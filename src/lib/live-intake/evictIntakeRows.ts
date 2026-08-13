/**
 * Bounds how far the intake buffer can grow.
 *
 * Intake writes to localStorage, which the webview caps at roughly 5-10 MB and
 * which issue #12 already reports as exhausted. Two earlier decisions of mine
 * combine badly there: S1 shipped with **no eviction cap**, on the reasoning
 * that a whole agent store holds under 5,000 requests so storage is not a
 * constraint, and #66 then changed writes from replace to **upsert**, correctly,
 * to stop trimming from erasing observed rows. Replace bounded a session by
 * whatever the feed still held; upsert does not bound it at all. The first
 * decision stopped being safe when the second landed.
 *
 * So this is a stop-gap with a clear scope, not the fix. The fix is #12, moving
 * durable data to SQLite. Until then intake must not be the thing that fills the
 * store other features are already failing to write into.
 *
 * What it may and may not drop:
 *
 * - **May** drop intake rows. Every one is a derived observation of an agent's
 *   own transcript, which is the durable original (D1). Nothing here is
 *   authored by the user.
 * - **Must not** be reached for anything authored, reviewed, or accepted. This
 *   module is deliberately typed to intake rows only so it cannot be pointed at
 *   notes or accepted memory by accident.
 *
 * Dropping is reported rather than silent: the caller surfaces the count, so a
 * shrinking history is something the user can see rather than discover.
 */
import type { IntakeRequestRow } from "./intakeTypes";

/**
 * Rows kept per session. Generous against real data: §4.3 of the execution plan
 * measured 89 to 713 requests in a heavy session, so this keeps all of a normal
 * one and the recent end of an extreme one.
 */
export const MAX_ROWS_PER_SESSION = 400;

/**
 * How far back a row may be and still be kept. The buffer answers "what is
 * happening and what just happened"; a request from two months ago is answered
 * by the ledger and by the agent's own log, not by this.
 */
export const MAX_ROW_AGE_MS = 45 * 24 * 60 * 60 * 1000;

export type EvictionResult = {
  kept: IntakeRequestRow[];
  /** How many rows were dropped, so the caller can report rather than hide it. */
  dropped: number;
};

/**
 * Trim one session's rows to the age and count bounds, newest first.
 *
 * Age is applied before count so a quiet old session is emptied by age rather
 * than kept alive by being under the row cap. A row with an unparseable
 * timestamp sorts oldest and is dropped first, which is the safe direction: it
 * cannot be shown on a surface that orders by time anyway.
 */
export function evictIntakeRows(
  rows: readonly IntakeRequestRow[],
  now: number,
): EvictionResult {
  const withinAge = rows.filter((row) => {
    const started = Date.parse(row.startedAt);
    if (!Number.isFinite(started)) return false;
    return now - started <= MAX_ROW_AGE_MS;
  });

  const ordered = [...withinAge].sort(
    (a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0),
  );
  const kept = ordered.slice(0, MAX_ROWS_PER_SESSION);
  return { kept, dropped: rows.length - kept.length };
}
