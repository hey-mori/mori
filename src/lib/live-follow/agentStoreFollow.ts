/**
 * Agent-store Live Follow: the pure accumulator for tailing an anchor agent's
 * own session file (Claude Code JSONL) via the byte-offset delta read.
 *
 * The connector-inbox follow path (`followSource` + `followReadAdapter` +
 * `runFollowPoll`) re-reads whole inbox files each poll and diffs by connector
 * event identity. An agent-store tail is different and cheaper: the Rust delta
 * (`get_claude_code_session_delta`) is stateful by byte offset and returns only
 * the new lines, so "what is new" is decided by the offset, not by re-parsing.
 *
 * This module accumulates those deltas into the running event / file-touch list
 * a follow surface renders, deduped by message id as a defensive guard against a
 * re-read (the offset normally advances, so nothing repeats). Crucially, it
 * hands the accumulated events to the SAME `buildImportCandidateFromClaudeCode
 * Session` path a one-shot import uses, so request boundaries (`openedByUser` /
 * `turnId`) computed live match the imported session exactly, the drift the
 * Live Follow Lab spec calls out as the first thing to verify.
 *
 * Pure: no Tauri, no timer, no store. The desktop shell injects the delta read
 * and the store's `applyFollowPoll` into `runAgentStoreFollowPoll`; the reused
 * `followController` / `followCadence` provide the reaction and cadence.
 */
import type {
  ClaudeCodeSessionDelta,
  ClaudeCodeSessionDetail,
  ClaudeFileTouch,
  ClaudeMessage,
  ClaudeTokenUsage,
} from "../claude/types";
import type { FollowReaction } from "./followController";

/**
 * Keep only the most recent N messages / touches per followed session. A live
 * dashboard is left open for hours, so unbounded accumulation would grow memory
 * and make every poll's dedup and feed rebuild slower over time. The byte offset
 * (not this list) is what resumes the tail, so nothing stops being *readable*
 * when an entry is dropped.
 *
 * That used to be the whole argument for trimming being harmless, and it was
 * incomplete. Once the live feed began feeding a durable buffer, a request that
 * aged out of this list vanished from the feed, and the buffer's whole-session
 * rewrite then erased rows already observed. Trimming is safe **because
 * `persistObservedRows` upserts by row id**, not because the offset can re-read
 * the file. Anything else that derives durable state from this list has to hold
 * to the same rule.
 *
 * Note the ceiling is now well above what anyone reads: the feed builds from at
 * most `BOUNDED_SCAN_MESSAGES` (1200) per session. Lowering this would cut
 * memory, and is deliberately not done here, because the dedup set is built from
 * this list and a shorter window could re-admit an old message after a rotation
 * re-baseline. Worth deciding on purpose rather than by drift.
 */
const MAX_ACCUMULATED = 4000;

export type AgentStoreFollowStats = {
  rawLines: number;
  parsed: number;
  skipped: number;
  unparseable: number;
};

/** Accumulated state of an agent-store tail. */
export type AgentStoreFollowState = {
  /** Byte offset to resume the next delta read from. */
  offset: number;
  /** Every event seen so far, in arrival order, deduped by id. */
  messages: ClaudeMessage[];
  /** Every file touch seen so far, in arrival order, deduped defensively. */
  fileTouches: ClaudeFileTouch[];
  /** Running fidelity totals summed across every delta applied. */
  stats: AgentStoreFollowStats;
};

export function initialAgentStoreFollowState(offset = 0): AgentStoreFollowState {
  return {
    offset: Math.max(0, Math.floor(offset)),
    messages: [],
    fileTouches: [],
    stats: { rawLines: 0, parsed: 0, skipped: 0, unparseable: 0 },
  };
}

export type AppendDeltaResult = {
  state: AgentStoreFollowState;
  /** Ids of the genuinely-new events this delta contributed. */
  newEventIds: string[];
};

/**
 * Fold one delta into the accumulated state: advance the offset, append the
 * genuinely-new events and file touches, and sum the fidelity stats. Dedup is
 * by message id (events) and a composite key (touches) so a defensive re-read
 * of the same offset never double-counts. The offset always moves to the
 * delta's `newOffset`, which the Rust side guarantees never lands mid-line.
 */
export function appendDelta(
  state: AgentStoreFollowState,
  delta: ClaudeCodeSessionDelta,
): AppendDeltaResult {
  const knownIds = new Set(state.messages.map((message) => message.id));
  const freshMessages: ClaudeMessage[] = [];
  const newEventIds: string[] = [];
  for (const event of delta.events) {
    if (knownIds.has(event.id)) continue;
    knownIds.add(event.id);
    freshMessages.push(event);
    newEventIds.push(event.id);
  }

  const knownTouchKeys = new Set(state.fileTouches.map(touchKey));
  const freshTouches: ClaudeFileTouch[] = [];
  for (const touch of delta.fileTouches) {
    const key = touchKey(touch);
    if (knownTouchKeys.has(key)) continue;
    knownTouchKeys.add(key);
    freshTouches.push(touch);
  }

  const nextMessages =
    freshMessages.length > 0 ? [...state.messages, ...freshMessages] : state.messages;
  const nextTouches =
    freshTouches.length > 0 ? [...state.fileTouches, ...freshTouches] : state.fileTouches;

  return {
    state: {
      // The delta read is monotonic; never move the offset backwards even if a
      // stale delta reports a smaller `newOffset`.
      offset: Math.max(state.offset, delta.newOffset),
      // Trim to the most recent window so a long-lived dashboard stays bounded.
      messages:
        nextMessages.length > MAX_ACCUMULATED ? nextMessages.slice(-MAX_ACCUMULATED) : nextMessages,
      fileTouches:
        nextTouches.length > MAX_ACCUMULATED ? nextTouches.slice(-MAX_ACCUMULATED) : nextTouches,
      stats: {
        rawLines: state.stats.rawLines + delta.stats.rawLines,
        parsed: state.stats.parsed + delta.stats.parsed,
        skipped: state.stats.skipped + delta.stats.skipped,
        unparseable: state.stats.unparseable + delta.stats.unparseable,
      },
    },
    newEventIds,
  };
}

/**
 * Project the accumulated tail into a `ClaudeCodeSessionDetail`, the exact shape
 * `buildImportCandidateFromClaudeCodeSession` consumes. A follow surface calls
 * that builder on this subject to get events with the same request boundaries an
 * imported session has, then `buildRequestSpans` over them for the request view.
 */
export function buildFollowSubject(
  state: AgentStoreFollowState,
  meta: {
    sessionId: string;
    title: string;
    startedAt: string;
    projectName: string;
    filePath: string;
    projectPath?: string;
    tokenUsage?: ClaudeTokenUsage;
  },
): ClaudeCodeSessionDetail {
  return {
    sessionId: meta.sessionId,
    projectPath: meta.projectPath ?? meta.projectName,
    projectName: meta.projectName,
    filePath: meta.filePath,
    startedAt: meta.startedAt,
    messageCount: state.messages.length,
    title: meta.title,
    ...(meta.tokenUsage ? { tokenUsage: meta.tokenUsage } : {}),
    messages: state.messages,
    fileTouches: state.fileTouches,
  };
}

export type AgentStoreFollowPollDeps = {
  /** The accumulated state before this poll. */
  state: AgentStoreFollowState;
  /** Read the next delta from the given byte offset (the delta command). */
  readDelta: (offset: number) => Promise<ClaudeCodeSessionDelta>;
  /** Store action: advance the follow brain and return the reaction. */
  applyPoll: (incomingEventIds: string[], at: string) => FollowReaction;
  /** ISO timestamp for this poll. */
  at: string;
};

export type AgentStoreFollowPollOutcome = {
  state: AgentStoreFollowState;
  reaction: FollowReaction;
  newEventIds: string[];
};

/**
 * One foreground agent-store follow poll, composed from the pure pieces so the
 * read then append then react sequence is unit tested without a timer, the file
 * system, or Tauri. Reads the delta at the current offset, folds it in, and
 * feeds the accumulated event ids to the follow brain (which diffs against its
 * own seeded known set to decide the reaction).
 */
export async function runAgentStoreFollowPoll(
  deps: AgentStoreFollowPollDeps,
): Promise<AgentStoreFollowPollOutcome> {
  const delta = await deps.readDelta(deps.state.offset);
  const { state, newEventIds } = appendDelta(deps.state, delta);
  const reaction = deps.applyPoll(
    state.messages.map((message) => message.id),
    deps.at,
  );
  return { state, reaction, newEventIds };
}

/**
 * A stable identity for a file touch. Touches carry no unique id of their own,
 * so we key on the fields that make two touches genuinely the same event; this
 * only matters as a re-read guard, since the offset normally advances.
 */
function touchKey(touch: ClaudeFileTouch): string {
  return [
    touch.messageId,
    touch.path,
    touch.tool,
    touch.at,
    String(touch.additions),
    String(touch.deletions),
  ].join("|");
}
