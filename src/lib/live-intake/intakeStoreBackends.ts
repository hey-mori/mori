/**
 * The two intake backends behind `IntakeStore`, and the choice between them.
 *
 * Browser mode keeps localStorage, because there is no SQLite there. Desktop
 * moves to the `intake_requests` table (V010), which is what R5 of
 * `docs/design/sqlite-source-of-truth-promotion.md` §7 is for: intake stops
 * competing for the few MB that issue #12 reports as exhausted.
 *
 * ## A correction to §7's own wording
 *
 * R5 says to "delete `evictIntakeRows` with the bound it enforces". That is
 * right for desktop and wrong for browser, where localStorage is still the
 * store and still capped. So the bound is not deleted, it moves: it belongs to
 * the backend whose constraint it answers, and the SQLite backend simply does
 * not have it.
 */
import { evictIntakeRows } from "./evictIntakeRows";
import { IntakeBrowserStore } from "./intakeStore";
import type { IntakeSaveResult, IntakeStore } from "./intakeStoreTypes";
import type { IntakeRequestRow } from "./intakeTypes";
import { isTauriRuntime, tauriCommands } from "../desktop";
import { fromSqliteIntakeRow, toSqliteIntakeRow } from "../sqlite/intakeRequestRows";

/**
 * Stored rows plus this poll's rows, newest observation of each id winning.
 *
 * Shared by both backends because it is the same rule either way: the follower
 * trims its history, so a whole-session rewrite would discard rows Mori has
 * already observed, and upserting by id is what stops that.
 */
export function mergeIntakeRows(
  stored: readonly IntakeRequestRow[],
  fresh: readonly IntakeRequestRow[],
): IntakeRequestRow[] {
  const byId = new Map<string, IntakeRequestRow>();
  for (const row of stored) byId.set(row.id, row);
  for (const row of fresh) byId.set(row.id, row);
  return [...byId.values()].sort(
    (a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0),
  );
}

export function createBrowserIntakeStore(
  inner = new IntakeBrowserStore(),
  /** Injected so the age bound can be tested without depending on the clock. */
  now: () => number = Date.now,
): IntakeStore {
  return {
    async saveSessionRows(sessionKey, rows): Promise<IntakeSaveResult> {
      const merged = mergeIntakeRows(inner.listSessionRows(sessionKey), rows);
      const { kept, dropped } = evictIntakeRows(merged, now());
      inner.saveSessionRows(sessionKey, kept);
      return { dropped };
    },
    async listSessionRows(sessionKey) {
      return inner.listSessionRows(sessionKey);
    },
    async listAllRows() {
      return inner.listAllRows();
    },
    async listProjectRows(projectPath) {
      // No index to use here, so the filter is in memory. Acceptable because
      // the bound above keeps this store small by construction, which is the
      // same reason the desktop backend does not need one.
      return inner.listAllRows().filter((row) => row.projectPath === projectPath);
    },
    async listProjectPaths() {
      return [...new Set(inner.listAllRows().map((row) => row.projectPath))];
    },
    async clearSession(sessionKey) {
      inner.clearSession(sessionKey);
    },
  };
}

/**
 * Only the commands this backend calls.
 *
 * Narrower than the whole bridge on purpose: it states the dependency exactly,
 * and lets a test supply a stand-in without a cast that would also hide a real
 * mismatch.
 */
export type IntakeCommands = Pick<
  typeof tauriCommands,
  | "saveIntakeRequestRows"
  | "listIntakeRequestRowsForSession"
  | "listIntakeRequestRowsForProject"
  | "listAllIntakeRequestRows"
  | "deleteIntakeRequestRowsForSession"
>;

export function createSqliteIntakeStore(commands: IntakeCommands = tauriCommands): IntakeStore {
  const read = (rows: Awaited<ReturnType<typeof commands.listAllIntakeRequestRows>>) =>
    rows.map(fromSqliteIntakeRow).filter((row): row is IntakeRequestRow => row !== null);

  return {
    async saveSessionRows(sessionKey, rows): Promise<IntakeSaveResult> {
      const stored = read(await commands.listIntakeRequestRowsForSession(sessionKey));
      const merged = mergeIntakeRows(stored, rows);
      await commands.saveIntakeRequestRows(merged.map(toSqliteIntakeRow));
      // No bound: this backend is not competing for the browser store's few MB,
      // and dropping an observation to save space it has is not a trade.
      return { dropped: 0 };
    },
    async listSessionRows(sessionKey) {
      return read(await commands.listIntakeRequestRowsForSession(sessionKey));
    },
    async listAllRows() {
      return read(await commands.listAllIntakeRequestRows());
    },
    async listProjectRows(projectPath) {
      return read(await commands.listIntakeRequestRowsForProject(projectPath));
    },
    async listProjectPaths() {
      // Distinct paths without loading rows would want its own query. Until a
      // store large enough to notice exists, the honest cheap version reads the
      // project column off the rows it already indexes.
      const rows = await commands.listAllIntakeRequestRows();
      return [...new Set(rows.map((row) => row.projectPath))];
    },
    async clearSession(sessionKey) {
      await commands.deleteIntakeRequestRowsForSession(sessionKey);
    },
  };
}

let singleton: IntakeStore | null = null;

/** The backend for this runtime, created once. */
export function getIntakeStore(): IntakeStore {
  if (!singleton) {
    singleton = isTauriRuntime() ? createSqliteIntakeStore() : createBrowserIntakeStore();
  }
  return singleton;
}

/** Test seam: forget the instance so a case can install its own. */
export function resetIntakeStore(): void {
  singleton = null;
}
