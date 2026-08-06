/**
 * Persists what the live feed observes, so closing 세션 stops losing it.
 *
 * This is the write end of the Live Intake Buffer (stage S1 of
 * `docs/design/live-project-intelligence-execution-plan.md`). The follower and
 * the feed are unchanged: they still hold full text in memory and still own the
 * present. This module only reduces each poll's requests to durable rows and
 * writes them per session. Observation auto-applies with no review queue in
 * front of it (D3): these are deterministic parses of a structured log, not
 * interpretation.
 *
 * The work lives in `persistObservedRows`, a plain function, so the failure
 * contract is testable without rendering: the hook is a two-line caller.
 */
import { useEffect, useMemo, useRef } from "react";
import { buildIntakeRows, IntakeBrowserStore, type IntakeRequestRow } from "../../lib/live-intake";
import { isStorageQuotaError } from "../../lib/storage/storageQuota";
import type { FollowedSession, LiveFeedRequest } from "./liveFeed";

export type IntakeWriteResult = {
  /** Sessions actually rewritten this pass. Unchanged ones are skipped. */
  writtenSessions: number;
  /** What went wrong, if anything. Never thrown: see the note below. */
  failure: unknown | null;
};

/**
 * Reduce this poll's requests and write the sessions that changed.
 *
 * **Nothing in here may take down the live view.** Observation is the product;
 * intake is an addition to it. So every fault, in derivation as much as in
 * storage, is caught and returned rather than thrown: a persistence problem
 * degrades to "the overview is stale", never to "the user cannot watch their
 * own work". The rows re-derive from the locator (D1) on the next poll either
 * way, which is what makes swallowing safe rather than lossy.
 */
export function persistObservedRows(
  store: IntakeBrowserStore,
  sessions: readonly FollowedSession[],
  requests: readonly LiveFeedRequest[],
  written: Map<string, string>,
  now: () => number = Date.now,
): IntakeWriteResult {
  let writtenSessions = 0;
  try {
    const at = now();
    const rows = buildIntakeRows(sessions, requests, {
      now: at,
      observedAt: new Date(at).toISOString(),
    });

    const bySession = new Map<string, IntakeRequestRow[]>();
    for (const session of sessions) bySession.set(session.meta.filePath, []);
    for (const row of rows) {
      bySession.get(row.sessionKey)?.push(row);
    }

    for (const [sessionKey, sessionRows] of bySession) {
      if (sessionRows.length === 0) continue;
      const fingerprint = fingerprintRows(sessionRows);
      if (written.get(sessionKey) === fingerprint) continue;
      store.saveSessionRows(sessionKey, sessionRows);
      written.set(sessionKey, fingerprint);
      writtenSessions += 1;
    }
  } catch (error) {
    return { writtenSessions, failure: error };
  }
  return { writtenSessions, failure: null };
}

export function useIntakeWriter(
  sessions: readonly FollowedSession[],
  requests: readonly LiveFeedRequest[],
  opts: { enabled: boolean; store?: IntakeBrowserStore },
): void {
  const { enabled } = opts;
  const store = useMemo(
    () => opts.store ?? (typeof window === "undefined" ? null : new IntakeBrowserStore()),
    [opts.store],
  );
  // Last written fingerprint per session, so an unchanged session is not rewritten.
  const written = useRef(new Map<string, string>());

  useEffect(() => {
    if (!enabled || !store || sessions.length === 0) return;
    const { failure } = persistObservedRows(store, sessions, requests, written.current);
    // A quota failure already reached the shared health observer through the
    // store, so it needs no second report. Anything else is a bug worth seeing.
    if (failure && !isStorageQuotaError(failure)) {
      console.error("[live-intake] failed to persist observed rows", failure);
    }
  }, [enabled, store, sessions, requests]);
}

/**
 * What must change before a session is worth rewriting. Deliberately excludes
 * `observedAt`, which moves every poll and would defeat the check entirely.
 */
function fingerprintRows(rows: readonly IntakeRequestRow[]): string {
  return rows
    .map((row) => `${row.id}:${row.status}:${row.stepCount}:${row.endedAt}:${row.files.length}`)
    .join("|");
}
