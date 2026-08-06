/**
 * Persists what the live feed observes, so closing 세션 stops losing it.
 *
 * This is the write end of the Live Intake Buffer (stage S1 of
 * `docs/design/live-project-intelligence-execution-plan.md`). The follower and
 * the feed are unchanged: they still hold full text in memory and still own the
 * present. This hook only reduces each poll's requests to durable rows and
 * writes them per session.
 *
 * Writes are keyed and batched by session because a session's rows are rewritten
 * whole (see `intakeStore`), and are skipped when nothing about a session
 * changed, so an idle poll costs no storage traffic. Observation auto-applies
 * with no review queue in front of it (D3): these are deterministic parses of a
 * structured log, not interpretation.
 *
 * A quota failure is reported through the shared health observer and then
 * swallowed HERE rather than thrown, because the live view must keep rendering:
 * the rows are re-derivable from the locator, so the cost of a failed write is
 * a stale overview, not lost work, and the observer is what makes it visible.
 */
import { useEffect, useMemo, useRef } from "react";
import { buildIntakeRows, IntakeBrowserStore, type IntakeRequestRow } from "../../lib/live-intake";
import { isStorageQuotaError } from "../../lib/storage/storageQuota";
import type { FollowedSession, LiveFeedRequest } from "./liveFeed";

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

    const rows = buildIntakeRows(sessions, requests, {
      now: Date.now(),
      observedAt: new Date().toISOString(),
    });

    const bySession = new Map<string, IntakeRequestRow[]>();
    for (const session of sessions) bySession.set(session.meta.filePath, []);
    for (const row of rows) {
      const held = bySession.get(row.sessionKey);
      if (held) held.push(row);
    }

    for (const [sessionKey, sessionRows] of bySession) {
      if (sessionRows.length === 0) continue;
      const fingerprint = fingerprintRows(sessionRows);
      if (written.current.get(sessionKey) === fingerprint) continue;
      try {
        store.saveSessionRows(sessionKey, sessionRows);
        written.current.set(sessionKey, fingerprint);
      } catch (error) {
        // The health observer has already been notified by the store. Keep the
        // live view alive; the rows re-derive from the locator next poll.
        if (!isStorageQuotaError(error)) throw error;
      }
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
