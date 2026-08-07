/**
 * Runs observation for the whole app, not just for the 세션 screen.
 *
 * Before this, the poller and the intake writer lived inside `LiveSessionView`,
 * so Mori only ever noticed work while the user happened to be looking at the
 * live screen. That is the gap this closes: the point of the intake buffer is
 * that a user who is elsewhere still finds out what their agents did.
 *
 * Two things make it honest rather than a widening of scope:
 *
 * - **It observes when the user asked it to.** Either the ambient opt-in is on
 *   (off by default, with an always-visible state and a one-tap off in the
 *   sidebar), or the 세션 screen is open, which is the same consent the old
 *   behaviour had. Nothing observes silently.
 * - **It reads nothing new.** The sources, the parse, and the review gate are
 *   unchanged. Only *when* Mori looks moved.
 *
 * It never runs while the app is closed. A tray-resident reader is a separate,
 * identity-changing decision the goal doc names as a non-goal.
 *
 * There is exactly one poller. The 세션 view consumes this snapshot rather than
 * starting its own, so turning the opt-in on while that screen is open does not
 * produce two followers reading the same files and writing the same rows.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createElement } from "react";
import { useSessionStore } from "../../app/sessionStore";
import { useObservationStore } from "../../app/observationStore";
import { buildLiveFeed, type LiveFeedRequest } from "./liveFeed";
import { useIntakeWriter } from "./useIntakeWriter";
import { useLiveSessions, type LiveSessionsSnapshot } from "./useLiveSessions";

export type AmbientObservation = {
  snapshot: LiveSessionsSnapshot;
  /** The merged feed, built once here so no consumer rebuilds it. */
  feed: LiveFeedRequest[];
  /** Why observation is running, or that it is not. Drives the visible state. */
  reason: "ambient" | "sessionView" | "off";
};

const EMPTY: AmbientObservation = {
  snapshot: {
    status: "idle",
    sessions: [],
    activeCount: 0,
    lastPolledAt: null,
    lastError: null,
    nextDelayMs: null,
    aggregate: { rawLines: 0, parsed: 0, skipped: 0, unparseable: 0 },
  },
  feed: [],
  reason: "off",
};

const ObservationContext = createContext<AmbientObservation>(EMPTY);

/**
 * The single source of observed sessions. 세션 reads from here instead of
 * polling, so the opt-in cannot produce a second follower over the same files.
 */
export function useObservedSessions(): AmbientObservation {
  return useContext(ObservationContext);
}

export function AmbientObservationProvider({
  children,
  ...opts
}: {
  children: ReactNode;
  sessionViewOpen: boolean;
  available: boolean;
}) {
  const { snapshot, feed, reason } = useAmbientObservation(opts);
  // Memoised because this is the context value for the whole shell: a fresh
  // object each render would re-render every consumer on every poll tick.
  const value = useMemo(() => ({ snapshot, feed, reason }), [snapshot, feed, reason]);
  return createElement(ObservationContext.Provider, { value }, children);
}

export function useAmbientObservation(opts: {
  /** True while the 세션 screen is the current view. */
  sessionViewOpen: boolean;
  /** False in browser mode, where there is no agent bridge to read. */
  available: boolean;
}): AmbientObservation {
  const ambient = useObservationStore((state) => state.ambient);
  const pushLiveNotification = useSessionStore((state) => state.pushLiveNotification);

  const reason: AmbientObservation["reason"] = !opts.available
    ? "off"
    : ambient
      ? "ambient"
      : opts.sessionViewOpen
        ? "sessionView"
        : "off";

  const snapshot = useLiveSessions(reason !== "off");
  const feed = useMemo(
    () => {
      // This now runs for the whole shell rather than for one screen, so a
      // malformed session read from disk would blank the entire app instead of
      // one view. Observation is an addition to Mori; it must never be able to
      // take the product down with it.
      try {
        return buildLiveFeed(snapshot.sessions, { now: Date.now() });
      } catch (error) {
        console.error("[live-intake] failed to build the live feed", error);
        return [];
      }
    },
    // Recompute each poll so live status stays fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.sessions, snapshot.lastPolledAt],
  );

  useIntakeWriter(snapshot.sessions, feed, {
    enabled: reason !== "off",
    onNotify: pushLiveNotification,
  });

  return { snapshot, feed, reason };
}
