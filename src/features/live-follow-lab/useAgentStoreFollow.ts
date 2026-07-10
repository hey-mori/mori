/**
 * Live Follow Lab foreground driver.
 *
 * A self-contained polling loop for the dev lab: given a Claude Code session
 * file path, it tails that one file by byte-offset delta read while the app is
 * open and the tab is visible, accumulating the events into an
 * `AgentStoreFollowState` the lab renders. It reuses the tested pure pieces
 * (`getClaudeCodeSessionDelta`, `appendDelta`, `decideFollowCadence`) and holds
 * only the timer + local snapshot here.
 *
 * Unlike the session-store Live Follow, the lab keeps its own local state rather
 * than the global `follow` slice, because the lab follows an arbitrary session
 * file for verification, not the active imported session. Foreground only:
 * pauses while the tab is hidden, backs off on error, auto-stops once the
 * session has been silent long enough, and tears down on unmount / session
 * switch. It never writes memory or drives the agent.
 */
import { useEffect, useState } from "react";
import { getClaudeCodeSessionDelta, isClaudeBridgeAvailable } from "../../lib/claude/claudeTauri";
import { appendDelta, decideFollowCadence, initialAgentStoreFollowState } from "../../lib/live-follow";
import type { AgentStoreFollowState } from "../../lib/live-follow";

/** Long recheck while the tab is hidden, since we skip the actual read. */
const HIDDEN_RECHECK_MS = 2_000;
/** Back-off after a read error so a broken path does not spin. */
const ERROR_BACKOFF_MS = 15_000;

export type LabFollowStatus = "idle" | "following" | "stopped" | "unavailable";

export type LabFollowSnapshot = {
  status: LabFollowStatus;
  follow: AgentStoreFollowState;
  lastPolledAt: string | null;
  lastError: string | null;
  /** Delay the next poll was scheduled with, for the cadence readout. */
  nextDelayMs: number | null;
};

function emptySnapshot(status: LabFollowStatus): LabFollowSnapshot {
  return {
    status,
    follow: initialAgentStoreFollowState(),
    lastPolledAt: null,
    lastError: null,
    nextDelayMs: null,
  };
}

export function useAgentStoreFollow(input: {
  sessionPath: string | null;
  enabled: boolean;
}): LabFollowSnapshot {
  const { sessionPath, enabled } = input;
  const [snapshot, setSnapshot] = useState<LabFollowSnapshot>(() => emptySnapshot("idle"));

  useEffect(() => {
    if (!enabled || !sessionPath) {
      setSnapshot(emptySnapshot("idle"));
      return;
    }
    if (!isClaudeBridgeAvailable()) {
      setSnapshot(emptySnapshot("unavailable"));
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let state = initialAgentStoreFollowState();
    let lastActivity = Date.now();

    setSnapshot({
      status: "following",
      follow: state,
      lastPolledAt: null,
      lastError: null,
      nextDelayMs: 0,
    });

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule(HIDDEN_RECHECK_MS);
        return;
      }
      try {
        const delta = await getClaudeCodeSessionDelta(sessionPath!, state.offset);
        if (cancelled) return;
        const result = appendDelta(state, delta);
        state = result.state;
        if (result.newEventIds.length > 0) lastActivity = Date.now();
        const cadence = decideFollowCadence({
          status: "following",
          msSinceLastActivity: Date.now() - lastActivity,
        });
        setSnapshot({
          status: cadence.shouldAutoStop ? "stopped" : "following",
          follow: state,
          lastPolledAt: new Date().toISOString(),
          lastError: null,
          nextDelayMs: cadence.shouldAutoStop ? null : cadence.nextDelayMs,
        });
        if (cadence.shouldAutoStop) return;
        schedule(cadence.nextDelayMs);
      } catch (error) {
        if (cancelled) return;
        setSnapshot((prev) => ({
          ...prev,
          status: "following",
          lastError: error instanceof Error ? error.message : "델타 읽기 실패",
          nextDelayMs: ERROR_BACKOFF_MS,
        }));
        schedule(ERROR_BACKOFF_MS);
      }
    }

    schedule(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionPath, enabled]);

  return snapshot;
}
