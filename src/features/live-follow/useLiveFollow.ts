/**
 * Live Follow foreground shell — the desktop polling loop.
 *
 * The store already holds the follow brain (`follow` state + `startFollow` /
 * `applyFollowPoll` / `stopFollow` …). This is the missing foreground driver:
 * while the active session is being followed and the app is visible, it polls on
 * an adaptive cadence (`decideFollowCadence`), re-reads the connector inbox
 * (`readFollowCandidates`), runs one tested poll (`runFollowPoll`), and lets the
 * store detect the new events and emit the low-noise feed notice. Brisk right
 * after activity, backing off as the session goes quiet, and auto-stopping once
 * the silence says the session has ended. Foreground only: it pauses while the
 * tab is hidden and tears down on unfollow / unmount.
 */
import { useEffect, useRef } from "react";
import { selectSessionView, useSessionStore } from "../../app/sessionStore";
import { decideFollowCadence, runFollowPoll } from "../../lib/live-follow";
import { readFollowCandidates } from "./followReadAdapter";

/** Poll interval while the tab is hidden — long, since we skip the actual read. */
const HIDDEN_RECHECK_MS = 2_000;
/** Back-off after a read/poll error so a broken inbox does not spin. */
const ERROR_BACKOFF_MS = 30_000;

export function useLiveFollow() {
  const status = useSessionStore((state) => state.follow.status);
  const view = useSessionStore(selectSessionView);
  const projectId = view.project.id;
  const sessionId = view.session.id;
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (status !== "following") return;
    lastActivityRef.current = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled) return;
      const store = useSessionStore.getState();
      if (store.follow.status !== "following") return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule(HIDDEN_RECHECK_MS);
        return;
      }
      try {
        const outcome = await runFollowPoll({
          knownIds: store.follow.knownEventIds,
          read: () => readFollowCandidates({ projectId, sessionId }),
          importEvents: () => {},
          applyPoll: (incomingEventIds, at) => store.applyFollowPoll(incomingEventIds, at),
          at: new Date().toISOString(),
        });
        if (outcome.importedCount > 0) lastActivityRef.current = Date.now();
      } catch (error) {
        useSessionStore
          .getState()
          .setFollowError(error instanceof Error ? error.message : "Live Follow 폴링 실패");
        schedule(ERROR_BACKOFF_MS);
        return;
      }
      if (cancelled) return;
      const cadence = decideFollowCadence({
        status: "following",
        msSinceLastActivity: Date.now() - lastActivityRef.current,
      });
      if (cadence.shouldAutoStop) {
        useSessionStore.getState().stopFollow();
        return;
      }
      schedule(cadence.nextDelayMs);
    }

    schedule(decideFollowCadence({ status: "following", msSinceLastActivity: 0 }).nextDelayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, projectId, sessionId]);
}
