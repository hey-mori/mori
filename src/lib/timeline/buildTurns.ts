/**
 * Fold timeline events into conversation turns.
 *
 * A captured Claude conversation is a sequence of turns. The import now stamps
 * `turnId` + `actor` onto every event as data (see `claudeImport.ts`), so the
 * timeline can group events back into turns deterministically instead of
 * re-deriving structure from rendered text on every render.
 *
 * `buildTurns` folds events sharing a `turnId` into one `Turn`, bucketing each
 * member by its actor: the user ask, the assistant reply, and any tool calls,
 * file edits, decisions, and issues attributed to that turn. Events that carry
 * no `turnId` (legacy imports, manual notes, AI-derived decisions) are never
 * dropped — each becomes its own single-member turn so the flow never loses a
 * row.
 *
 * `inferActorFallback` reconstructs an actor for legacy events that predate the
 * `actor` field, porting the regex heuristics that used to live in
 * `conversationFlow.ts` so the rendered output stays equivalent.
 *
 * No React, no domain mutation — pure derivation, unit-testable.
 */
import type { EventActor, TimelineEvent } from "../../domain/types";

/**
 * One conversation turn: the events that share a `turnId`, bucketed by actor.
 * Today a single imported turn produces one `aiConversation` event, so most
 * turns carry just an `ask` and/or an `assistant`; the extra buckets give a
 * stable home to per-message events (tool calls, derived file edits, decisions,
 * issues) as the data model grows, without changing this contract.
 */
export type Turn = {
  /** Stable turn id (`event.turnId`), or the event id for an orphan event. */
  id: string;
  /** Chronological ordinal of the turn within the folded list. */
  index: number;
  /** The user's ask, when the turn has one. */
  ask: TimelineEvent | null;
  /** The assistant reply, when the turn has one. */
  assistant: TimelineEvent | null;
  /** Tool invocations attributed to the turn. */
  toolCalls: TimelineEvent[];
  /** File / code edits attributed to the turn. */
  fileEdits: TimelineEvent[];
  /** Decisions attributed to the turn. */
  decisions: TimelineEvent[];
  /** Issues attributed to the turn. */
  issues: TimelineEvent[];
};

/**
 * Group events into turns by `turnId`, preserving first-seen order. Events
 * without a `turnId` each become their own single-member turn keyed by event
 * id, so nothing is ever silently dropped.
 */
export function buildTurns(events: readonly TimelineEvent[]): Turn[] {
  const byId = new Map<string, Turn>();
  const order: string[] = [];

  for (const event of events) {
    // Orphan events (no turnId) get a unique key so they never collapse into
    // one another or into a real turn.
    const key = event.turnId ?? `orphan::${event.id}`;
    let turn = byId.get(key);
    if (!turn) {
      turn = {
        id: event.turnId ?? event.id,
        index: order.length,
        ask: null,
        assistant: null,
        toolCalls: [],
        fileEdits: [],
        decisions: [],
        issues: [],
      };
      byId.set(key, turn);
      order.push(key);
    }
    assignEventToTurn(turn, event);
  }

  return order.map((key) => byId.get(key) as Turn);
}

/** Drop `event` into the right bucket of `turn` by its (resolved) actor. */
function assignEventToTurn(turn: Turn, event: TimelineEvent): void {
  const actor = event.actor ?? inferActorFallback(event);
  switch (actor) {
    case "user":
      // First user event wins the `ask` slot; any extra fold in as tool-free
      // context rather than overwriting the primary ask.
      if (turn.ask === null) turn.ask = event;
      else turn.toolCalls.push(event);
      break;
    case "assistant":
      if (turn.assistant === null) turn.assistant = event;
      else turn.toolCalls.push(event);
      break;
    case "tool":
      turn.toolCalls.push(event);
      break;
    case "file":
      turn.fileEdits.push(event);
      break;
    case "decision":
      turn.decisions.push(event);
      break;
    case "system":
      // A standalone system / unknown event with no real actor still needs a
      // home; treat it as the turn's ask if nothing else claimed that slot so
      // the row renders.
      if (turn.ask === null && turn.assistant === null) turn.ask = event;
      else turn.toolCalls.push(event);
      break;
  }
  // Issues are typed at the event level, not the actor level — fold them in
  // regardless of who produced the event.
  if (event.type === "issue") turn.issues.push(event);
}

/**
 * Reconstruct an actor for a legacy event that predates the `actor` field.
 *
 * Ports the heuristics that `conversationFlow.ts` used to apply at render time:
 *   - `decision` events are decisions; `fileCode` events are file edits;
 *     `issue` events fall through to the conversation rules below (their issue
 *     nature is captured by `event.type`, not the actor).
 *   - For a conversation turn, the reply text (`summary`) is inspected: if it
 *     reads as mechanical tool activity it is a `tool` event; otherwise, a
 *     turn with a distinct reply is `assistant`, and a turn with only an ask is
 *     `user`. A turn with neither a usable ask nor reply is `system`.
 */
export function inferActorFallback(event: TimelineEvent): EventActor {
  if (event.type === "decision") return "decision";
  if (event.type === "fileCode" || event.type === "artifact") return "file";

  const ask = event.title.trim();
  const reply = event.summary.trim();
  const hasAsk = ask !== "" && ask !== "(no response captured)";
  const hasReply = reply !== "" && reply !== ask;

  if (hasReply) {
    return looksLikeToolActivity(reply) ? "tool" : "assistant";
  }
  if (hasAsk) return "user";
  return "system";
}

/**
 * Does this text read as mechanical tool activity rather than a human-facing
 * reply? Ported verbatim from `conversationFlow.ts` so legacy events classify
 * exactly as they rendered before the `actor` field existed.
 */
function looksLikeToolActivity(text: string): boolean {
  return (
    /^(\$\s|>\s|running\b|executing\b|tool[_\s-]?use|<function|<tool\b)/i.test(text) ||
    /^(실행|도구 호출|명령 실행)\b/.test(text)
  );
}
