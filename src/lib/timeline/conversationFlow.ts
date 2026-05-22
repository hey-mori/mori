/**
 * Conversation-flow helpers.
 *
 * Phase 1 made "1 Claude conversation = 1 Mori session": a single session now
 * holds one conversation's worth of turns, every one typed `aiConversation`.
 * The swimlane canvas was built for sessions that mix many event types across
 * lanes; a single-conversation session collapses into one dense lane that the
 * time-window bundler then over-clusters into meaningless "270개 이벤트" blobs.
 *
 * These pure helpers let the Timeline:
 *   1. detect when a session is really one conversation (so it can default to
 *      the readable chronological "대화 흐름" view), and
 *   2. turn a paired turn event (`title` = user ask, `summary` = Claude reply)
 *      into a small, role-aware view model the flow view renders.
 *
 * No React, no domain mutation — just derivation, so it is unit-testable and
 * reused by both the toggle default logic and the flow rows.
 */
import type { MoriMockSession, TimelineEvent } from "../../domain/types";

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
export function describeConversationContext(view: MoriMockSession): ConversationContext {
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

/**
 * Split a paired turn event into the segments the flow view renders.
 *
 * Claude imports pair one human message + the following assistant message into
 * one turn event, stashing the user ask in `title` and Claude's reply in
 * `summary` (see `claudeImport.ts`). The flow view wants those as two visually
 * distinct rows: the user's question prominent, Claude's answer below it. Tool
 * activity is detected from the reply text and surfaced as a muted segment so
 * mechanical tool calls never compete with the actual conversation.
 */
export function splitTurnSegments(event: TimelineEvent): ConversationTurnSegment[] {
  const segments: ConversationTurnSegment[] = [];

  const userText = event.title.trim();
  if (userText && userText !== "(no response captured)") {
    segments.push({ role: "user", label: "사용자", text: userText });
  }

  const replyText = event.summary.trim();
  if (replyText && replyText !== userText) {
    const role = looksLikeToolActivity(replyText) ? "tool" : "assistant";
    segments.push({
      role,
      label: role === "tool" ? "도구 호출" : "Claude",
      text: replyText,
    });
  }

  // A turn with neither a usable ask nor a reply still needs one segment so it
  // is never silently dropped from the flow.
  if (segments.length === 0) {
    segments.push({ role: "system", label: "기록", text: userText || replyText || "내용 없음" });
  }

  return segments;
}

/**
 * Heuristic: does this assistant text read as mechanical tool activity rather
 * than a human-facing reply? Tool calls / command output get a muted segment
 * so the real conversation stays visually dominant.
 */
function looksLikeToolActivity(text: string): boolean {
  return (
    /^(\$\s|>\s|running\b|executing\b|tool[_\s-]?use|<function|<tool\b)/i.test(text) ||
    /^(실행|도구 호출|명령 실행)\b/.test(text)
  );
}
