/**
 * The intake store seam.
 *
 * R5 of `docs/design/sqlite-source-of-truth-promotion.md` §7 gives intake its
 * own SQLite table, so there are now two backends and callers must not branch
 * on which one they have.
 *
 * ## Why the interface is async
 *
 * The desktop backend crosses the Tauri bridge. Making only that one async and
 * leaving the browser one synchronous would push the branch back into every
 * caller, which is the thing this seam exists to prevent.
 *
 * ## Why eviction lives behind it rather than above it
 *
 * The bound is a property of one backend, not of intake. localStorage caps a
 * few MB, which is why `evictIntakeRows` exists at all; SQLite does not, and
 * applying the same cap there would delete observations for no reason.
 *
 * So `saveSessionRows` reports what it dropped and each backend decides.
 * A caller that asked "am I on the bounded one" would be asking the wrong
 * question: what it wants to tell the user is how many rows went, and that is
 * what it gets.
 */
import type { IntakeRequestRow } from "./intakeTypes";

export type IntakeSaveResult = {
  /**
   * Observations dropped to keep this backend within its bounds. Always zero
   * on a backend that has none.
   */
  dropped: number;
};

export type IntakeStore = {
  /** Merge this poll's rows into the session's stored rows. */
  saveSessionRows(
    sessionKey: string,
    rows: readonly IntakeRequestRow[],
  ): Promise<IntakeSaveResult>;
  /** One session's rows, newest request first. */
  listSessionRows(sessionKey: string): Promise<IntakeRequestRow[]>;
  /**
   * Every row, newest request first. Cross-session conflicts cannot be seen
   * from inside one session, so that read takes the lot.
   */
  listAllRows(): Promise<IntakeRequestRow[]>;
  /**
   * One project's rows. The read the project projection is built from, and the
   * reason the desktop backend is a table rather than a document per session.
   */
  listProjectRows(projectPath: string): Promise<IntakeRequestRow[]>;
  /** Distinct project paths, so a label can be resolved without loading rows. */
  listProjectPaths(): Promise<string[]>;
  clearSession(sessionKey: string): Promise<void>;
};
