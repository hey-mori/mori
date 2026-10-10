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
import {
  buildIntakeRows,
  buildIntakeSignals,
  findCrossSessionConflicts,
  getIntakeStore,
  type ConflictFinding,
  type IntakeRequestRow,
  type IntakeStore,
} from "../../lib/live-intake";
import {
  buildConflictNotification,
  buildIntakeSignalNotification,
} from "../../lib/notifications/intakeSignalNotifications";
import type { CompanionNotification } from "../../lib/notifications/notification";
import { promoteNotificationSignals } from "../../lib/notifications/signalPolicy";
import { isStorageQuotaError } from "../../lib/storage/storageQuota";
import { useSessionStore } from "../../app/sessionStore";
import type { FollowedSession, LiveFeedRequest } from "./liveFeed";

export type IntakeWriteResult = {
  /** Sessions actually rewritten this pass. Unchanged ones are skipped. */
  writtenSessions: number;
  /** Signals that survived the policy, ready to push into the feed. */
  notifications: CompanionNotification[];
  /**
   * Observations dropped to keep the buffer bounded. Reported rather than
   * silent: a history that shrinks on its own should be visible, especially
   * while intake still shares a storage budget that issue #12 reports as full.
   */
  evicted: number;
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
export async function persistObservedRows(
  store: IntakeStore,
  sessions: readonly FollowedSession[],
  requests: readonly LiveFeedRequest[],
  written: Map<string, string>,
  now: () => number = Date.now,
): Promise<IntakeWriteResult> {
  let writtenSessions = 0;
  let evicted = 0;
  const notifications: CompanionNotification[] = [];
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

      // Signals are a function of what CHANGED, so the stored rows are read
      // before they are overwritten. Deriving them here rather than in a
      // component is the point: a transition observed a moment before the user
      // navigates away is still a transition, and used to be lost with the
      // component that held it.
      const before = await store.listSessionRows(sessionKey);
      for (const signal of promoteNotificationSignals(
        buildIntakeSignals({ previous: before, next: sessionRows, now: at }),
        { allowSystem: true },
      )) {
        if (signal.delivery !== "inApp" && signal.delivery !== "system") continue;
        const row = sessionRows.find((candidate) => signal.id.endsWith(candidate.id));
        const level = useSessionStore.getState().analysisSettings.requestDisclosureLevel;
        const notification = row ? buildIntakeSignalNotification(signal, row, level) : null;
        if (notification) notifications.push(notification);
      }

      // Merging and bounding both live in the store now. Merging is the same
      // rule on either backend, because the follower trims its history and a
      // whole-session rewrite would otherwise discard rows Mori has already
      // observed. Bounding is not: it answers localStorage's cap, and the
      // SQLite backend has none, so the store reports what it dropped rather
      // than this deciding.
      const { dropped } = await store.saveSessionRows(sessionKey, sessionRows);
      evicted += dropped;
      written.set(sessionKey, fingerprint);
      writtenSessions += 1;
    }

    // Conflicts are the one finding that cannot be seen from inside a single
    // session, so they are derived across every session at once, after the
    // writes. Each agent's transcript looks perfectly reasonable alone.
    //
    // Read from the store, not from the rows just built. A session that has
    // dropped out of the followed set still has stored rows, and a run that just
    // finished colliding with one still going is precisely the case worth
    // warning about. Deriving this from memory alone was tried and lost that
    // case; the store is small (tens of KB), so the read is not the cost it
    // looked like.
    if (writtenSessions > 0) {
      const findings = findCrossSessionConflicts({ rows: await store.listAllRows(), now: at });
      const byId = new Map(findings.map((finding) => [conflictId(finding), finding]));
      for (const signal of promoteNotificationSignals(
        findings.map((finding) => ({
          id: conflictId(finding),
          reason: "conflictDetected" as const,
          hasObservedEvidence: true,
          occurredAt: finding.at,
        })),
      )) {
        if (signal.delivery !== "inApp" && signal.delivery !== "system") continue;
        const finding = byId.get(signal.id);
        if (finding) notifications.push(buildConflictNotification(finding));
      }
    }
  } catch (error) {
    return { writtenSessions, notifications, evicted, failure: error };
  }
  return { writtenSessions, notifications, evicted, failure: null };
}

export function useIntakeWriter(
  sessions: readonly FollowedSession[],
  requests: readonly LiveFeedRequest[],
  opts: {
    enabled: boolean;
    store?: IntakeStore;
    /** Where a promoted signal goes. Omitted in tests and in browser mode. */
    onNotify?: (notification: CompanionNotification) => void;
  },
): void {
  const { enabled, onNotify } = opts;
  const store = useMemo(
    () => opts.store ?? (typeof window === "undefined" ? null : getIntakeStore()),
    [opts.store],
  );
  // Last written fingerprint per session, so an unchanged session is not rewritten.
  const written = useRef(new Map<string, string>());

  useEffect(() => {
    if (!enabled || !store || sessions.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { failure, notifications, evicted } = await persistObservedRows(
        store,
        sessions,
        requests,
        written.current,
      );
      // A poll that resolves after the effect was torn down must not push
      // notifications into a feed that has moved on.
      if (cancelled) return;
      for (const notification of notifications) onNotify?.(notification);
      if (evicted > 0) {
      // Visible in diagnostics rather than silent. When #12 moves durable data
      // to SQLite this bound, and this line, should go away.
        console.info(
          `[live-intake] dropped ${evicted} observed row(s) to stay within storage bounds`,
        );
      }
      // A quota failure already reached the shared health observer through the
      // store, so it needs no second report. Anything else is a bug worth seeing.
      if (failure && !isStorageQuotaError(failure)) {
        console.error("[live-intake] failed to persist observed rows", failure);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, store, sessions, requests, onNotify]);
}

/** One id per conflicting file, so an ongoing clash stays one signal. */
function conflictId(finding: ConflictFinding): string {
  return `intake:conflict:${finding.projectPath} ${finding.path}`;
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
