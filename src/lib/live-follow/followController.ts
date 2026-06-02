/**
 * Live Follow controller — the pure decision brain for following a
 * still-running session.
 *
 * Mori's Live Follow is explicit, per-session, and FOREGROUND ONLY: the
 * user turns it on for one registered session, and while the app is open
 * Mori re-reads that one session's already-growing connector file and
 * reacts to genuinely new events. It is not a background watcher, not a
 * daemon, and not a global monitor (see
 * `docs/design/local-llm-understanding-and-live-follow.md` §3.1).
 *
 * This module holds none of that IO. It is a reducer + decision helpers:
 * the foreground polling shell (desktop) feeds it `poll` actions with the
 * event ids it just read, and asks `decideFollowReaction` whether to
 * trigger an incremental re-analysis and a notification. Keeping the
 * brain pure makes the lifecycle and delta logic testable without a file
 * system, a timer, or Tauri.
 */
export type FollowStatus = "idle" | "following" | "paused" | "stopped";

export type FollowState = {
  status: FollowStatus;
  sessionId: string | null;
  /** Every event id the follow loop has already seen for this session. */
  knownEventIds: string[];
  /** New ids since the last reaction was consumed, awaiting handling. */
  pendingEventIds: string[];
  lastPolledAt: string | null;
  lastError: string | null;
};

export type FollowAction =
  | { type: "start"; sessionId: string; knownEventIds?: string[]; at?: string }
  | { type: "poll"; incomingEventIds: string[]; at: string }
  | { type: "consumePending" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "error"; message: string; at?: string }
  | { type: "stop" };

export function initialFollowState(): FollowState {
  return {
    status: "idle",
    sessionId: null,
    knownEventIds: [],
    pendingEventIds: [],
    lastPolledAt: null,
    lastError: null,
  };
}

/**
 * Event ids in `incoming` not already in `known`, preserving the incoming
 * order and de-duplicated within the batch. The connector file only grows
 * (append-only), so only additions matter.
 */
export function computeNewEventIds(
  known: readonly string[],
  incoming: readonly string[],
): string[] {
  const seen = new Set(known);
  const fresh: string[] = [];
  for (const id of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    fresh.push(id);
  }
  return fresh;
}

export function followReducer(state: FollowState, action: FollowAction): FollowState {
  switch (action.type) {
    case "start":
      return {
        status: "following",
        sessionId: action.sessionId,
        knownEventIds: unique(action.knownEventIds ?? []),
        pendingEventIds: [],
        lastPolledAt: action.at ?? null,
        lastError: null,
      };
    case "poll": {
      // Polling only does work while actively following; a stray poll
      // after pause/stop is ignored rather than silently resuming.
      if (state.status !== "following") return state;
      const fresh = computeNewEventIds(state.knownEventIds, action.incomingEventIds);
      if (fresh.length === 0) {
        return { ...state, lastPolledAt: action.at };
      }
      return {
        ...state,
        knownEventIds: [...state.knownEventIds, ...fresh],
        pendingEventIds: [...state.pendingEventIds, ...fresh],
        lastPolledAt: action.at,
      };
    }
    case "consumePending":
      if (state.pendingEventIds.length === 0) return state;
      return { ...state, pendingEventIds: [] };
    case "pause":
      return state.status === "following" ? { ...state, status: "paused" } : state;
    case "resume":
      return state.status === "paused" ? { ...state, status: "following" } : state;
    case "error":
      return {
        ...state,
        lastError: action.message,
        lastPolledAt: action.at ?? state.lastPolledAt,
      };
    case "stop":
      return { ...state, status: "stopped", pendingEventIds: [], lastError: null };
    default:
      return state;
  }
}

export type FollowReaction = {
  /** Trigger an incremental re-analysis over the new events. */
  shouldReanalyze: boolean;
  /** Surface a notification that the followed session grew. */
  shouldNotify: boolean;
  /** How many new events are pending. */
  newCount: number;
};

/**
 * Decide whether the pending events warrant a reaction. Only an actively
 * following session reacts, and only once at least `minNewEvents` (default
 * 1) new events have accumulated, so the shell can debounce by polling
 * without consuming until enough has arrived.
 */
export function decideFollowReaction(
  state: FollowState,
  opts: { minNewEvents?: number } = {},
): FollowReaction {
  const minNewEvents = Math.max(1, opts.minNewEvents ?? 1);
  const newCount = state.pendingEventIds.length;
  const active = state.status === "following" && newCount >= minNewEvents;
  return { shouldReanalyze: active, shouldNotify: active, newCount };
}

export function isActivelyFollowing(state: FollowState): boolean {
  return state.status === "following";
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
