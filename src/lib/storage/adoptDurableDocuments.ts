/**
 * The one-time adoption pass: copy the durable documents that already exist in
 * localStorage into SQLite.
 *
 * The other half of R2 in `docs/design/sqlite-source-of-truth-promotion.md` §7.
 * Dual-write only covers documents written from now on, so without this a
 * session analysed before the feature shipped would have nothing in SQLite and
 * the R6 read flip would lose it.
 *
 * ## What §7.1 asks of an adoption slice, and how this answers it
 *
 * **A backup before the pass.** Already taken, structurally: `ensure_migrated`
 * snapshots an existing database before applying pending migrations, and
 * `V009` is such a migration. A second backup here would guard nothing, since
 * this pass only inserts into the empty table that migration just created and
 * has no way to damage anything that existed before it.
 *
 * **No deletion.** Nothing is removed from localStorage. The pass is a copy,
 * and localStorage stays the read source until R6.
 *
 * **Survives interruption.** There is no progress ledger, deliberately. Every
 * write is an upsert keyed by `(kind, owner_id)`, so re-running the whole pass
 * is not merely safe but produces the identical result, which makes "resume"
 * and "start over" the same operation and removes a whole class of half-state
 * bugs. The store is capped at a few MB, so redoing it costs little.
 *
 * **Reports what moved.** The return value, surfaced in the diagnostics export.
 *
 * ## Why it aborts rather than pushing through failures
 *
 * The failures that can happen here, a full disk or a database that will not
 * open, affect every write that follows. Continuing would turn one problem into
 * several hundred identical failure records and delay the report. Aborting is
 * also safe precisely because the pass is idempotent: the next launch re-runs
 * it from the start and the already-written documents are simply rewritten.
 *
 * ## Why it will not overwrite a fresher document
 *
 * The pass and dual-write run against the same table. Scanning collects the
 * localStorage bodies as they are at that moment, and a save landing while the
 * chunks are still being written would put a newer document in SQLite that a
 * later chunk then replaces with the older scanned copy. localStorage would be
 * ahead of SQLite with nothing reporting it, which is precisely the state R6
 * must not flip under.
 *
 * So the pass reads what SQLite already holds and skips any owner whose stored
 * document is at least as new. Three list calls against a table that is empty
 * or nearly so, in exchange for removing a race that would only ever show up as
 * data missing after the flip.
 */
import type { KeyValueStorage } from "./storageTypes";
import type { DocumentMirrorTarget } from "./documentMirror";
import {
  toDurableDocumentRow,
  type DurableDocumentKind,
  type SqliteDurableDocumentRow,
} from "../sqlite/durableDocumentRows";
import { durableKeyToDocument, durableKinds } from "./durableKeyMap";

/**
 * Keys that look adopted and are not, asserted rather than assumed.
 *
 * `mori.currentSessionDraft` is the pointer to the open session. It holds a
 * byte-identical copy of a per-session draft, so adopting it would store the
 * same session twice under an owner id that is not a session id. It is
 * excluded by the shape of the prefixes above rather than by a rule, which is
 * exactly the kind of correctness that goes quiet, so a test names it.
 */

/** Documents per SQLite transaction. Bounded so one write is not the whole store. */
const CHUNK = 50;

/**
 * Set only after a pass that completed with no failures, so an interrupted or
 * failed run is retried on the next launch rather than recorded as done.
 */
export const ADOPTION_MARKER_KEY = "mori.adoption.durableDocuments.v2";

/**
 * The marker of the first pass, before imported transcripts and reopen
 * descriptors were durable classes. A device carrying only it has every other
 * class in SQLite already; v2 runs once more to copy the two new ones (the
 * pass skips what SQLite already holds at least as new).
 */
export const LEGACY_ADOPTION_MARKER_KEY = "mori.adoption.durableDocuments.v1";

/** Older builds stored a session's imports as one array under this prefix. */
const LEGACY_IMPORTS_PREFIX = "mori.sessionImports.";

export type AdoptionReport = {
  /** Matching keys found in localStorage. */
  scanned: number;
  /** Documents written into SQLite. */
  written: number;
  /** Keys whose stored value could not be parsed, so there was nothing to copy. */
  unreadable: number;
  /**
   * Owners left alone because SQLite already held a document at least as new,
   * which is how a concurrent dual-write survives the pass.
   */
  skippedFresher: number;
  /** Why the pass stopped early, when it did. */
  stoppedBecause: string | null;
};

export function hasAdopted(storage: KeyValueStorage): boolean {
  return storage.getItem(ADOPTION_MARKER_KEY) !== null;
}

export async function adoptDurableDocuments(input: {
  storage: KeyValueStorage;
  target: DocumentMirrorTarget;
  /** Row timestamp for documents whose stored body carries no `savedAt`. */
  now: () => string;
  /**
   * What SQLite already holds, per kind. Omitted only in tests that are not
   * about the race; production always passes it.
   */
  listExisting?: (kind: DurableDocumentKind) => Promise<SqliteDurableDocumentRow[]>;
}): Promise<AdoptionReport> {
  const { storage, target, now, listExisting } = input;
  const report: AdoptionReport = {
    scanned: 0,
    written: 0,
    unreadable: 0,
    skippedFresher: 0,
    stoppedBecause: null,
  };

  // Read before scanning, so a document written between the two is treated as
  // fresher and left alone rather than compared against a stale snapshot.
  const existing = new Map<string, string>();
  if (listExisting) {
    for (const kind of durableKinds()) {
      try {
        for (const row of await listExisting(kind)) {
          existing.set(`${row.kind} ${row.ownerId}`, row.updatedAt);
        }
      } catch (error) {
        report.stoppedBecause = error instanceof Error ? error.message : String(error);
        return report;
      }
    }
  }

  const rows: SqliteDurableDocumentRow[] = [];
  // Collected by index first. Reading and writing in one loop would walk a
  // store that is being written to, and `key(index)` shifts under mutation.
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (key.startsWith(LEGACY_IMPORTS_PREFIX)) {
      collectLegacyImports(key);
      continue;
    }
    // One shared mapping with the read flip, so the two directions cannot
    // disagree about what a key holds.
    const match = durableKeyToDocument(key);
    if (!match) continue;
    report.scanned += 1;

    const raw = storage.getItem(key);
    if (raw === null) {
      report.unreadable += 1;
      continue;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      // Left where it is rather than copied. An unparseable value is not a
      // document, and localStorage keeps it either way since nothing is deleted.
      report.unreadable += 1;
      continue;
    }

    const ownerId = match.ownerId;
    const updatedAt = readSavedAt(body) ?? now();
    const held = existing.get(`${match.kind} ${ownerId}`);
    if (held !== undefined && held >= updatedAt) {
      // Equal counts as fresher: an identical timestamp means the same
      // document, and rewriting it would be work for no change.
      report.skippedFresher += 1;
      continue;
    }

    rows.push(
      toDurableDocumentRow({
        kind: match.kind,
        ownerId,
        schemaVersion: readSchemaVersion(body),
        body,
        updatedAt,
      }),
    );
  }

  /**
   * A legacy import array becomes one document per entry, under the owner the
   * per-entry key would have (`<sessionId>.<importId>`), so a restore reads it
   * back as the entries the adapter already merges with the array. The array
   * stays in localStorage: nothing is deleted.
   */
  function collectLegacyImports(key: string): void {
    const sessionId = key.slice(LEGACY_IMPORTS_PREFIX.length);
    const raw = storage.getItem(key);
    let entries: unknown;
    try {
      entries = raw === null ? null : JSON.parse(raw);
    } catch {
      entries = null;
    }
    if (!sessionId || !Array.isArray(entries)) {
      report.scanned += 1;
      report.unreadable += 1;
      return;
    }
    for (const entry of entries) {
      report.scanned += 1;
      const id = entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined;
      if (typeof id !== "string" || !id) {
        report.unreadable += 1;
        continue;
      }
      const ownerId = `${sessionId}.${id}`;
      // A per-entry key for the same import is newer than the array (the
      // adapter writes entries since), and it is adopted under this owner too.
      if (storage.getItem(`mori.sessionImportEntry.${ownerId}`) !== null) continue;
      const updatedAt = readSavedAt(entry) ?? now();
      const held = existing.get(`session_import ${ownerId}`);
      if (held !== undefined && held >= updatedAt) {
        report.skippedFresher += 1;
        continue;
      }
      rows.push(
        toDurableDocumentRow({ kind: "session_import", ownerId, schemaVersion: 1, body: entry, updatedAt }),
      );
    }
  }

  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    try {
      await target.saveDocuments(chunk);
      report.written += chunk.length;
    } catch (error) {
      report.stoppedBecause = error instanceof Error ? error.message : String(error);
      return report;
    }
  }

  storage.setItem(ADOPTION_MARKER_KEY, now());
  return report;
}

/**
 * The body's own version, defaulting to 1.
 *
 * Records written before the versioned envelope existed carry none, and they
 * are exactly the old data this pass is for, so a missing version is treated as
 * the first version rather than as a reason to skip.
 */
function readSchemaVersion(body: unknown): number {
  const value = (body as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof value === "number" ? value : 1;
}

function readSavedAt(body: unknown): string | null {
  const value = (body as { savedAt?: unknown } | null)?.savedAt;
  return typeof value === "string" ? value : null;
}
