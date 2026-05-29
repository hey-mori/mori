/**
 * Conversation-flow helpers.
 *
 * Some imports are conversation-dominant work units: one source conversation
 * or agent run represented as a sequence of `aiConversation` events.
 * The swimlane canvas was built for sessions that mix many event types across
 * lanes; a single-conversation session collapses into one dense lane that the
 * time-window bundler then over-clusters into meaningless "270개 이벤트" blobs.
 *
 * These pure helpers let the Timeline:
 *   1. detect when a session is really one conversation (so it can default to
 *      the readable chronological "대화 흐름" view), and
 *   2. turn a paired turn event (`title` = initiating ask, `summary` = reply)
 *      into a small, role-aware view model the flow view renders.
 *
 * No React, no domain mutation — just derivation, so it is unit-testable and
 * reused by both the toggle default logic and the flow rows.
 */
import type { MockSession, TimelineEvent } from "../../domain/types";
import { inferActorFallback } from "./buildTurns";

/**
 * Whether a session reads as a single conversation rather than a mixed
 * research/build session. True when the visible events are overwhelmingly
 * `aiConversation` turns — the case where the swimlane is the wrong default
 * and the chronological flow view is far more readable.
 *
 * Threshold is a share, not an absolute count, so a 12-turn session and a
 * 239-turn session both qualify, while a session that merely happens to
 * include a few chat turns alongside decisions / research does not.
 */
export function isConversationSession(events: readonly TimelineEvent[]): boolean {
  if (events.length === 0) return false;
  const conversationTurns = events.filter((event) => event.type === "aiConversation").length;
  // A handful of stray non-conversation events (a derived decision, an issue)
  // should not flip a clearly-conversation session out of flow view.
  return conversationTurns / events.length >= 0.8 && conversationTurns >= 3;
}

export type ConversationContext = {
  /** Conversation title (session title). */
  title: string;
  /** Project / source grouping label, when known. */
  projectLabel: string | null;
  /** Number of conversation turns in the session. */
  turnCount: number;
};

/**
 * Header context for a conversation session: what conversation am I looking
 * at, from which project, and how many turns. Drives the "이 세션은 …" caption
 * so the user always knows what the timeline is showing.
 */
export function describeConversationContext(view: MockSession): ConversationContext {
  const turnCount = view.events.filter((event) => event.type === "aiConversation").length;
  const projectLabel =
    view.session.sourceLabel?.trim() || view.project?.name?.trim() || null;
  return {
    title: view.session.title,
    projectLabel,
    turnCount,
  };
}

export type ConversationTurnRole = "user" | "assistant" | "tool" | "system";

export type ConversationTurnSegment = {
  role: ConversationTurnRole;
  /** Korean role label for the segment header. */
  label: string;
  /** The segment's text content. */
  text: string;
};

/** Korean role label for a conversation segment header. */
export const CONVERSATION_ROLE_LABEL: Record<ConversationTurnRole, string> = {
  user: "User",
  assistant: "어시스턴트",
  tool: "도구 활동",
  system: "기록",
};

/**
 * Split a paired turn event into the segments the flow view renders.
 *
 * Conversation imports pair one human message + the following assistant message into
 * one turn event, stashing the user ask in `title` and the response in
 * `summary`, and stamp the turn's actor as data when the source can provide it.
 * The flow view wants those as two visually distinct rows: the initiating ask
 * prominent, the source response below it. The reply's role comes from the stamped
 * `actor` (with `inferActorFallback` reconstructing it for legacy events that
 * predate the field) instead of re-guessing from the text on every render, so
 * tool activity stays a muted segment without a per-render regex pass.
 */
export function conversationTurnSegments(event: TimelineEvent): ConversationTurnSegment[] {
  const segments: ConversationTurnSegment[] = [];
  const actor = event.actor ?? inferActorFallback(event);

  const userText = event.title.trim();
  if (userText && userText !== "(no response captured)") {
    segments.push({ role: "user", label: CONVERSATION_ROLE_LABEL.user, text: userText });
  }

  const replyText = event.summary.trim();
  if (replyText && replyText !== userText) {
    // A turn whose dominant actor is the tool surfaces its reply as a muted
    // tool segment; otherwise it reads as an assistant/source answer.
    const role: ConversationTurnRole = actor === "tool" ? "tool" : "assistant";
    segments.push({ role, label: CONVERSATION_ROLE_LABEL[role], text: replyText });
  }

  // A turn with neither a usable ask nor a reply still needs one segment so it
  // is never silently dropped from the flow.
  if (segments.length === 0) {
    segments.push({
      role: "system",
      label: CONVERSATION_ROLE_LABEL.system,
      text: userText || replyText || "내용 없음",
    });
  }

  return segments;
}
