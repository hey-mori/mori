/**
 * Resolves, once per launch, where durable reads come from.
 *
 * R6 of `docs/design/sqlite-source-of-truth-promotion.md` §7. The decision has
 * to be made before the session store hydrates, because hydration is what pulls
 * the sessions into memory and there is no point flipping a source after
 * everything has been read from the other one.
 *
 * The flip is conditional on SQLite holding every durable key localStorage
 * holds, so a device whose copy is incomplete keeps reading exactly what it
 * reads today. The held-back state is reported rather than swallowed: a
 * fallback that nobody can see is the failure R0 was written to end, and this
 * is the same failure one layer up.
 */
import { isTauriRuntime, tauriCommands } from "../lib/desktop";
import {
  resolveDurableReadSource,
  type DurableReadSource,
} from "../lib/storage/durableReadSource";
import type { KeyValueStorage } from "../lib/storage/storageTypes";
import { useStorageHealthStore } from "./storageHealthStore";
import { setAppStorageProvider } from "../lib/storage/appStorage";
import { adoptDurableDocuments } from "../lib/storage/adoptDurableDocuments";
import { replayPendingDeletes } from "../lib/storage/desktopDocumentMirror";
import { adoptReopenDescriptors } from "../lib/session/autoImportMetaStore";
import { recordAdoptionReport } from "./useDurableDocumentAdoption";

let resolved: DurableReadSource | null = null;
let storage: KeyValueStorage | null = null;
let inFlight: Promise<void> | null = null;

/**
 * Decide the read source. Safe to call repeatedly: the work happens once, and
 * concurrent callers await the same attempt rather than racing to build two
 * caches over one store.
 */
export function prepareDurableReads(): Promise<void> {
  if (resolved) return Promise.resolve();
  if (inFlight) return inFlight;
  if (!isTauriRuntime() || typeof window === "undefined") {
    // Browser mode has no second source, so there is nothing to decide and
    // nothing to report.
    resolved = { source: "browser-local-storage" };
    return Promise.resolve();
  }

  inFlight = (async () => {
    try {
      // 1. Deletes a previous run recorded and SQLite never confirmed: gone
      //    before anything can be served from them.
      await replayPendingDeletes(window.localStorage, (kind, ownerId) =>
        tauriCommands.deleteDurableDocumentRow(kind, ownerId),
      );
      // 2. Copy every body localStorage holds newer than SQLite (or SQLite
      //    lacks), on every launch: the adoption of classes newly made durable
      //    and the repair of a mirror write lost at a quit. Idempotent and
      //    non-destructive; a failure leaves the decision to report the gap.
      try {
        recordAdoptionReport(
          await adoptDurableDocuments({
            storage: window.localStorage,
            target: {
              saveDocuments: (documents) => tauriCommands.saveDurableDocumentRows(documents),
              deleteDocument: (kind, ownerId) => tauriCommands.deleteDurableDocumentRow(kind, ownerId),
            },
            listExisting: (kind) => tauriCommands.listDurableDocumentRows(kind),
            now: () => new Date().toISOString(),
          }),
        );
      } catch {
        // Reported through the decision below if anything is missing.
      }
      // 3. Reopen descriptors: one document per session, merged with the
      //    local map rather than flipped (see autoImportMetaStore).
      try {
        adoptReopenDescriptors(await tauriCommands.listDurableDocumentRows("reopen_descriptor"));
      } catch {
        // Unreadable: the local map still serves; nothing is overwritten.
      }
      const outcome = await resolveDurableReadSource({
        local: window.localStorage,
        listDocuments: (kind) => tauriCommands.listDurableDocumentRows(kind),
      });
      resolved = { source: outcome.source, heldBack: outcome.heldBack };
      storage = outcome.storage;
      if (outcome.heldBack) {
        // Visible, not only logged. A gap here is what R7 must not ship on top
        // of, and the person who can act on it is the one using the app.
        useStorageHealthStore.getState().reportReadFlipHeldBack({
          reason: outcome.heldBack.reason,
          missingKeys: outcome.heldBack.missingKeys,
          at: new Date().toISOString(),
        });
        console.info(
          `[durable-reads] staying on localStorage: ${outcome.heldBack.reason}` +
            ` (${outcome.heldBack.missingKeys} key(s), e.g. ${outcome.heldBack.example ?? "none"})`,
        );
      }
    } catch (error) {
      // resolveDurableReadSource already returns rather than throws for storage
      // failures, so reaching here is a defect in it. The response is the same
      // either way, because it is the only one that cannot lose anything.
      resolved = {
        source: "browser-local-storage",
        heldBack: {
          missingKeys: 0,
          example: null,
          reason: error instanceof Error ? error.message : String(error),
        },
      };
      storage = null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * The storage the repository should read through, or `null` to read
 * localStorage as before.
 */
export function getDurableStorage(): KeyValueStorage | null {
  return storage;
}

/**
 * One storage whose every call goes to wherever reads come from *now*: the
 * SQLite-backed cache once the flip engaged, localStorage until then (and for
 * good when it did not).
 *
 * The repository is created lazily by its first reader, and the shell's first
 * render reads session summaries before `hydrate` has awaited the decision.
 * A repository handed `getDurableStorage()` at that moment captured `null` and
 * read localStorage for the rest of the run, so the flip never reached it: on
 * a profile restored from its storage folder, the sessions SQLite held stayed
 * invisible. Deciding per call removes the ordering dependency.
 */
export const effectiveStorage: KeyValueStorage = {
  get length() {
    return current().length;
  },
  key: (index) => current().key(index),
  getItem: (key) => current().getItem(key),
  setItem: (key, value) => current().setItem(key, value),
  removeItem: (key) => current().removeItem(key),
};

function current(): KeyValueStorage {
  return storage ?? window.localStorage;
}

// Library readers (the browser repository's default, the reopen descriptors,
// the project mappings) follow the same decision through this provider.
if (typeof window !== "undefined") setAppStorageProvider(() => effectiveStorage);

/** What was decided, for the diagnostics export. `null` before the first call. */
export function getDurableReadSource(): DurableReadSource | null {
  return resolved;
}

/** Test seam: forget the decision so a case can make its own. */
export function resetDurableReads(): void {
  resolved = null;
  storage = null;
  inFlight = null;
}
