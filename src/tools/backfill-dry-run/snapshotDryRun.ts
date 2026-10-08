/**
 * Offline, read-only dry run of the provisional-session backfill (#147, #148).
 *
 * Runs the PRODUCTION planner (`planAgentSessionStatusBackfill`) through the
 * PRODUCTION `KernelRepository` in desktop mode and the production SQLite row
 * converters, against a snapshot of `mori.sqlite`. Nothing here re-implements
 * the planner; the only SQL is the read side of `src-tauri/src/db/kernel.rs`,
 * which the desktop bridge would otherwise run.
 *
 * Why offline: launching any Mori build applies pending migrations and starts
 * auto-import writes, so a dry run inside the app is not read-only.
 *
 * Safety, in the order it is enforced:
 *   1. The snapshot is never opened. It is copied into a private temp
 *      directory and the COPY is opened read-only, so even the -wal / -shm
 *      files SQLite creates on a read-only open of a WAL database land there.
 *   2. A path in the live storage directory is refused outright.
 *   3. A non-empty -wal beside the snapshot is refused: the snapshot was taken
 *      while data was still in the log, and a stale log is silently ignored by
 *      SQLite, which would undercount without saying so.
 *   4. Integrity, migration metadata, and the kernel tables and columns are
 *      checked before anything is planned; anything unknown fails closed.
 *   5. Every write command throws AND is counted, because `KernelRepository`
 *      would otherwise absorb a failed write into its in-memory fallback and
 *      report success. Any attempt fails the run.
 *   6. Any read that fell back fails the run: offline, there is no legitimate
 *      fallback, only a failed SQLite read.
 *   7. The report carries counts only: no titles, bodies, ids, or paths.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve, win32 } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BackfillReadError,
  planAgentSessionStatusBackfill,
  type AgentSessionBackfillPlan,
} from "../../lib/record-kernel/agentSessionStatusBackfill";
import { KernelRepository, type KernelDesktopCommands } from "../../lib/record-kernel/kernelRepository";
import { KernelBrowserStore } from "../../lib/record-kernel/kernelStore";
import { MemoryKeyValueStorage } from "../../lib/storage/memoryStorage";

export const DRY_RUN_TOOL_NAME = "mori-backfill-dry-run";
export const DRY_RUN_TOOL_VERSION = 1;
/** node:sqlite is usable without a flag, with `readOnly`, from this release. */
export const MIN_NODE_VERSION = [22, 13, 0] as const;
/** The migrations this tool knows. A snapshot with any other version fails closed. */
export const KNOWN_MIGRATIONS = ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012", "013"];
/** The record kernel arrived in V008; the planner needs nothing newer. */
const KERNEL_MIGRATION = "008";

const RECORD_COLUMNS = [
  "id", "schema_id", "title", "body", "occurred_start", "occurred_end", "source_created_at",
  "captured_at", "time_basis", "time_confidence", "status", "origin", "ownership",
  "context_ids_json", "properties_json", "created_at", "updated_at",
];
const REVISION_COLUMNS = ["id", "record_id", "actor", "operation", "before_json", "after_json", "created_at"];

export type DryRunErrorCode =
  | "NODE_TOO_OLD"
  | "SNAPSHOT_NOT_FOUND"
  | "SNAPSHOT_IS_LIVE_DB"
  | "SNAPSHOT_HAS_UNCHECKPOINTED_WAL"
  | "SNAPSHOT_NOT_SQLITE"
  | "SNAPSHOT_INTEGRITY_FAILED"
  | "SNAPSHOT_CHANGED"
  | "SCHEMA_NO_MIGRATION_TABLE"
  | "SCHEMA_TOO_OLD"
  | "SCHEMA_NEWER_THAN_TOOL"
  | "SCHEMA_GAP"
  | "SCHEMA_MISSING_TABLE"
  | "SCHEMA_MISSING_COLUMN"
  | "READ_FAILED"
  | "WRITE_ATTEMPTED"
  | "NOT_REPEATABLE";

/** Messages are fixed text: never a path, a SQL error, or row content. */
const MESSAGES: Record<DryRunErrorCode, string> = {
  NODE_TOO_OLD: "Node 22.13 or newer is required (node:sqlite with readOnly).",
  SNAPSHOT_NOT_FOUND: "The snapshot path does not name a readable file.",
  SNAPSHOT_IS_LIVE_DB: "The path is inside Mori's live storage directory. Pass a snapshot copied elsewhere.",
  SNAPSHOT_HAS_UNCHECKPOINTED_WAL: "A non-empty -wal file sits beside the snapshot, so it is not a consistent snapshot. Quit Mori cleanly and take the snapshot again.",
  SNAPSHOT_NOT_SQLITE: "The snapshot is not a SQLite database.",
  SNAPSHOT_INTEGRITY_FAILED: "PRAGMA integrity_check did not return ok for the snapshot.",
  SNAPSHOT_CHANGED: "The snapshot's bytes changed during the run.",
  SCHEMA_NO_MIGRATION_TABLE: "The snapshot has no _mori_migrations table.",
  SCHEMA_TOO_OLD: "The snapshot predates the record kernel (V008).",
  SCHEMA_NEWER_THAN_TOOL: "The snapshot has a migration this tool does not know. Use a tool built from a matching Mori commit.",
  SCHEMA_GAP: "The snapshot's applied migrations are not contiguous.",
  SCHEMA_MISSING_TABLE: "A kernel table the planner reads is missing.",
  SCHEMA_MISSING_COLUMN: "A kernel table lacks a column the planner reads.",
  READ_FAILED: "A SQLite read failed; refusing to report a partial plan.",
  WRITE_ATTEMPTED: "Something attempted a write; the dry run is void.",
  NOT_REPEATABLE: "Two plans over the same snapshot disagreed.",
};

export class DryRunError extends Error {
  readonly code: DryRunErrorCode;
  constructor(code: DryRunErrorCode) {
    super(MESSAGES[code]);
    this.name = "DryRunError";
    this.code = code;
  }
}

export type DryRunProvenance = { sourceCommit: string; sourceDirty: boolean };

export type DryRunReport = {
  tool: { name: string; version: number; sourceCommit: string; sourceDirty: boolean };
  schema: { migrations: string[] };
  repository: { runtime: "desktop"; source: "desktop-sqlite"; fellBack: false };
  integrity: "ok";
  planner: { scanned: number; eligible: number; skipped: Record<string, number> };
  repeatable: true;
  /** Straight SQL, for context. Not planner output. */
  sqlContext: {
    kernelRecords: number;
    kernelRevisions: number;
    agentSessionByStatus: Record<string, number>;
    nonAgentSessionRecords: number;
  };
  snapshot: { bytes: number; sha256: string; unchangedByRun: true; sidecarsCreatedBesideIt: false };
};

export function nodeVersionSupported(version: string): boolean {
  const parts = version.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i += 1) {
    const have = parts[i] ?? 0;
    if (have !== MIN_NODE_VERSION[i]) return have > MIN_NODE_VERSION[i];
  }
  return true;
}

/**
 * Mori's live storage directory, resolved the way `default_storage_dir()` does
 * (`src-tauri/src/package.rs`): the trimmed contents of `~/.mori/storage_location`
 * when non-empty, else `<home>/Mori/Records`, where home is HOME, then USERPROFILE.
 */
export function liveStorageDir(env: NodeJS.ProcessEnv): string | null {
  const home = env.HOME || env.USERPROFILE;
  if (!home) return null;
  const override = join(home, ".mori", "storage_location");
  if (existsSync(override)) {
    try {
      const trimmed = readFileSync(override, "utf8").trim();
      if (trimmed) return trimmed;
    } catch {
      // Unreadable means "no override", exactly as the Rust resolver reads it.
    }
  }
  return join(home, "Mori", "Records");
}

function canonical(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

/** Whether `candidate` is `dir` or inside it, case-insensitively on Windows. */
export function isInside(candidate: string, dir: string, platform: NodeJS.Platform = process.platform): boolean {
  // The platform's own path rules, chosen explicitly: `node:path` on a POSIX
  // host does not understand `C:\...`, so the default module would compare
  // Windows paths wrongly when this runs anywhere but Windows.
  const paths = platform === "win32" ? win32 : posix;
  const fold = (p: string) => (platform === "win32" ? p.toLowerCase() : p);
  const rel = paths.relative(fold(dir), fold(candidate));
  return rel === "" || (!rel.startsWith("..") && !paths.isAbsolute(rel));
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

type Guarded = { repository: KernelRepository; writeAttempts: () => number };

/** A desktop `KernelRepository` over a read-only connection. Every write
 *  command throws and is counted, so a fallback cannot hide it. */
export function createReadOnlyKernelRepository(db: DatabaseSync): Guarded {
  let attempts = 0;
  const refuse = async (): Promise<never> => {
    attempts += 1;
    throw new Error("read-only dry run");
  };
  const commands: KernelDesktopCommands = {
    listKernelRecordRows: async () =>
      db.prepare(`SELECT ${RECORD_COLUMNS.join(", ")} FROM kernel_records ORDER BY captured_at DESC`).all() as never,
    getKernelRecordRow: async (id: string) =>
      (db.prepare(`SELECT ${RECORD_COLUMNS.join(", ")} FROM kernel_records WHERE id = ?`).get(id) ?? null) as never,
    listKernelRevisionRows: async (recordId: string) =>
      db
        .prepare(`SELECT ${REVISION_COLUMNS.join(", ")} FROM kernel_revisions WHERE record_id = ? ORDER BY created_at, id`)
        .all(recordId) as never,
    searchKernelRecordRows: async () => [],
    listKernelObjectRows: async () => [],
    saveKernelRecordRows: refuse,
    deleteKernelRecordRow: refuse,
    saveKernelObjectRows: refuse,
    appendKernelRevisionRows: refuse,
  };
  const repository = new KernelRepository({
    runtime: "desktop",
    store: new KernelBrowserStore(new MemoryKeyValueStorage()),
    commands,
  });
  return { repository, writeAttempts: () => attempts };
}

function reasonCounts(plan: AgentSessionBackfillPlan): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of plan.skipped) counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
  return counts;
}

/** Plan twice through the guarded repository; fail closed on any fallback,
 *  unreadable trail, write attempt, or disagreement. */
export async function planReadOnly(guarded: Guarded): Promise<DryRunReport["planner"]> {
  const probe = await guarded.repository.listRecords();
  if (probe.fellBack || probe.source !== "desktop-sqlite") throw new DryRunError("READ_FAILED");
  const plans: AgentSessionBackfillPlan[] = [];
  for (let i = 0; i < 2; i += 1) {
    try {
      plans.push(await planAgentSessionStatusBackfill(guarded.repository));
    } catch (error) {
      if (error instanceof BackfillReadError) throw new DryRunError("READ_FAILED");
      throw error;
    }
  }
  if (guarded.writeAttempts() > 0) throw new DryRunError("WRITE_ATTEMPTED");
  const [first, second] = plans;
  if (first.skipped.some((entry) => entry.reason === "unreadable")) throw new DryRunError("READ_FAILED");
  const same =
    first.scanned === second.scanned &&
    JSON.stringify(first.eligible) === JSON.stringify(second.eligible) &&
    JSON.stringify(first.skipped) === JSON.stringify(second.skipped);
  if (!same) throw new DryRunError("NOT_REPEATABLE");
  return { scanned: first.scanned, eligible: first.eligible.length, skipped: reasonCounts(first) };
}

function checkSchema(db: DatabaseSync): string[] {
  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
  if (!tables.has("_mori_migrations")) throw new DryRunError("SCHEMA_NO_MIGRATION_TABLE");
  const migrations = (
    db.prepare("SELECT version FROM _mori_migrations ORDER BY version").all() as Array<{ version: string }>
  ).map((row) => String(row.version));
  if (migrations.some((version) => !KNOWN_MIGRATIONS.includes(version))) throw new DryRunError("SCHEMA_NEWER_THAN_TOOL");
  const expected = KNOWN_MIGRATIONS.slice(0, migrations.length);
  if (migrations.join() !== expected.join()) throw new DryRunError("SCHEMA_GAP");
  if (!migrations.includes(KERNEL_MIGRATION)) throw new DryRunError("SCHEMA_TOO_OLD");
  for (const [table, columns] of [
    ["kernel_records", RECORD_COLUMNS],
    ["kernel_revisions", REVISION_COLUMNS],
  ] as const) {
    if (!tables.has(table)) throw new DryRunError("SCHEMA_MISSING_TABLE");
    const have = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name),
    );
    if (columns.some((column) => !have.has(column))) throw new DryRunError("SCHEMA_MISSING_COLUMN");
  }
  return migrations;
}

function sqlContext(db: DatabaseSync): DryRunReport["sqlContext"] {
  const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
  const byStatus: Record<string, number> = {};
  for (const row of db
    .prepare("SELECT status, COUNT(*) AS n FROM kernel_records WHERE schema_id = 'agent-session' GROUP BY status ORDER BY status")
    .all() as Array<{ status: string; n: number }>) {
    byStatus[String(row.status)] = Number(row.n);
  }
  return {
    kernelRecords: count("SELECT COUNT(*) AS n FROM kernel_records"),
    kernelRevisions: count("SELECT COUNT(*) AS n FROM kernel_revisions"),
    agentSessionByStatus: byStatus,
    nonAgentSessionRecords: count("SELECT COUNT(*) AS n FROM kernel_records WHERE schema_id <> 'agent-session'"),
  };
}

export async function runSnapshotDryRun(options: {
  snapshotPath: string;
  env: NodeJS.ProcessEnv;
  provenance: DryRunProvenance;
  platform?: NodeJS.Platform;
}): Promise<DryRunReport> {
  const snapshot = resolve(options.snapshotPath);
  if (!existsSync(snapshot) || !statSync(snapshot).isFile()) throw new DryRunError("SNAPSHOT_NOT_FOUND");

  const live = liveStorageDir(options.env);
  if (live && isInside(canonical(snapshot), canonical(live), options.platform)) {
    throw new DryRunError("SNAPSHOT_IS_LIVE_DB");
  }
  const wal = `${snapshot}-wal`;
  if (existsSync(wal) && statSync(wal).size > 0) throw new DryRunError("SNAPSHOT_HAS_UNCHECKPOINTED_WAL");

  const header = readFileSync(snapshot).subarray(0, 16).toString("latin1");
  if (header !== "SQLite format 3\u0000") throw new DryRunError("SNAPSHOT_NOT_SQLITE");

  const sidecarsBefore = [`${snapshot}-wal`, `${snapshot}-shm`].map(existsSync);
  const before = { bytes: statSync(snapshot).size, sha256: sha256(snapshot) };

  const workDir = mkdtempSync(join(tmpdir(), "mori-dry-run-"));
  let report: Omit<DryRunReport, "snapshot">;
  try {
    const workCopy = join(workDir, "snapshot.sqlite");
    copyFileSync(snapshot, workCopy);
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(workCopy, { readOnly: true });
    } catch {
      throw new DryRunError("SNAPSHOT_NOT_SQLITE");
    }
    try {
      let integrity: unknown[];
      try {
        integrity = db.prepare("PRAGMA integrity_check").all();
      } catch {
        throw new DryRunError("SNAPSHOT_INTEGRITY_FAILED");
      }
      const ok = integrity.length === 1 && Object.values(integrity[0] as object)[0] === "ok";
      if (!ok) throw new DryRunError("SNAPSHOT_INTEGRITY_FAILED");
      const migrations = checkSchema(db);
      const planner = await planReadOnly(createReadOnlyKernelRepository(db));
      report = {
        tool: { name: DRY_RUN_TOOL_NAME, version: DRY_RUN_TOOL_VERSION, ...options.provenance },
        schema: { migrations },
        repository: { runtime: "desktop", source: "desktop-sqlite", fellBack: false },
        integrity: "ok",
        planner,
        repeatable: true,
        sqlContext: sqlContext(db),
      };
    } finally {
      db.close();
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const after = { bytes: statSync(snapshot).size, sha256: sha256(snapshot) };
  const sidecarsAfter = [`${snapshot}-wal`, `${snapshot}-shm`].map(existsSync);
  if (after.sha256 !== before.sha256 || after.bytes !== before.bytes) throw new DryRunError("SNAPSHOT_CHANGED");
  if (sidecarsAfter.some((exists, i) => exists && !sidecarsBefore[i])) throw new DryRunError("SNAPSHOT_CHANGED");
  return {
    ...report,
    snapshot: { bytes: before.bytes, sha256: before.sha256, unchangedByRun: true, sidecarsCreatedBesideIt: false },
  };
}

