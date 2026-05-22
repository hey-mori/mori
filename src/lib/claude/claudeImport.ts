/**
 * Convert a Claude conversation (Desktop or Code) into a Mori import
 * candidate.
 *
 * Mori's session model is 1 session = 1 import unit, so a single Claude
 * conversation becomes a single `SourceRef` with one `TimelineEvent` per
 * Q&A turn pair (one user message + the following assistant message).
 * That keeps the imported timeline navigable instead of presenting one
 * giant blob, while still preserving the original order.
 *
 * The output is shaped to match the existing `NormalizedImportCandidate`
 * contract so it can flow through the same Import Review pipeline as
 * pasted transcripts and connector JSONL imports — no special cases
 * downstream.
 */

import type { TimelineEvent } from "../../domain/types";
import { createImportId } from "../import/id";
import type { NormalizedImportCandidate } from "../import/types";
import {
  tokenUsageForMessage,
  tokenUsageMapFromAggregate,
} from "./tokenUsage";
import type {
  ClaudeCodeSessionDetail,
  ClaudeConversationDetail,
  ClaudeMessage,
  ClaudeSource,
  ClaudeTokenUsage,
} from "./types";

/** Common subset that both desktop and code conversations satisfy. */
type ClaudeImportSubject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  source: ClaudeSource;
  projectName?: string;
  messages: ClaudeMessage[];
  /**
   * Session-level token usage (Claude Code only). Carried so the import can
   * stamp it onto the assistant timeline events instead of dropping it.
   * Absent for Claude Desktop conversations, which report no usage.
   */
  tokenUsage?: ClaudeTokenUsage;
};

export type BuildClaudeImportInput = {
  projectId: string;
  sessionId: string;
  capturedAt?: string;
};

export function buildImportCandidateFromClaudeConversation(
  conversation: ClaudeConversationDetail,
  input: BuildClaudeImportInput,
): NormalizedImportCandidate {
  return buildCandidate(
    {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      source: conversation.source,
      projectName: conversation.projectName,
      messages: conversation.messages,
    },
    input,
  );
}

export function buildImportCandidateFromClaudeCodeSession(
  session: ClaudeCodeSessionDetail,
  input: BuildClaudeImportInput,
): NormalizedImportCandidate {
  return buildCandidate(
    {
      id: session.sessionId,
      title: session.title,
      createdAt: session.startedAt,
      updatedAt: session.startedAt,
      source: "code",
      projectName: session.projectName,
      messages: session.messages,
      tokenUsage: session.tokenUsage,
    },
    input,
  );
}

function buildCandidate(
  subject: ClaudeImportSubject,
  input: BuildClaudeImportInput,
): NormalizedImportCandidate {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const title = subject.title.trim() || fallbackTitle(subject);
  const sourceId = createImportId("src-claude", `${subject.source}-${subject.id || title}`, capturedAt);
  const turns = pairMessagesIntoTurns(subject.messages);
  const events: TimelineEvent[] = [];

  // The only token usage Mori receives is a session-level aggregate, so it
  // is attributed to the last assistant turn. The map is keyed by assistant
  // message id so the lookup naturally lands on the right event — and so it
  // upgrades to true per-message usage without touching this loop.
  const lastAssistantMessageId = lastAssistantId(turns);
  const usageByMessageId = tokenUsageMapFromAggregate(
    subject.tokenUsage,
    lastAssistantMessageId,
  );

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const start = turn.timestamp || capturedAt;
    const eventId = createImportId("evt-claude", `${subject.id}-${index}`, start);
    const tokenUsage = tokenUsageForMessage(usageByMessageId, turn.assistantMessageId ?? undefined);
    events.push({
      id: eventId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      start,
      type: "aiConversation",
      title: turn.title,
      summary: turn.summary,
      sourceRefs: [sourceId],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "observed",
      confidence: 0.9,
      createdBy: "import",
      userModified: false,
      connectorEventId: `claude::${subject.source}::${subject.id}::${index}`,
      ...(tokenUsage ? { tokenUsage } : {}),
    });
  }

  // Always create at least one event so the source has a representative
  // anchor on the timeline, even if the conversation had no Q&A pairs
  // (e.g. a Claude Code session that ended before the first response).
  if (events.length === 0) {
    const eventId = createImportId("evt-claude", subject.id || title, capturedAt);
    events.push({
      id: eventId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      start: capturedAt,
      type: "aiConversation",
      title,
      summary: `Imported from Claude ${labelForSource(subject.source)} — no Q&A turns detected.`,
      sourceRefs: [sourceId],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "observed",
      confidence: 0.6,
      createdBy: "import",
      userModified: false,
      connectorEventId: `claude::${subject.source}::${subject.id}::empty`,
    });
  }

  const detail = describeSourceDetail(subject, turns.length);

  return {
    source: {
      id: sourceId,
      sessionId: input.sessionId,
      // Both Desktop and Code sessions are Claude conversations — treating
      // them as `claudeTranscript` keeps Evidence Hub filtering coherent and
      // reads as "from Claude" everywhere downstream.
      kind: "claudeTranscript",
      title: prefixTitleWithSource(title, subject.source),
      detail,
      trustLevel: "observed",
      redactionStatus: "pending",
      rawRetention: "summaryOnly",
      capturedAt,
      relatedEventIds: events.map((event) => event.id),
    },
    events,
  };
}

/**
 * Re-bind a Claude import candidate to a different Mori session id.
 *
 * `buildImportCandidateFromClaude*` stamps the `sessionId` it was told to
 * use onto the source and every event. The "1 Claude conversation = 1 Mori
 * session" flow builds the candidate before the destination session exists,
 * then creates a fresh session and needs the candidate's `sessionId`
 * references to point at the real id. This rewrites `source.sessionId` and
 * `events[].sessionId` (and `projectId` when the new session lives in a
 * different project) without touching the stable event / source ids — those
 * are derived from the conversation, not the session, so duplicate detection
 * and references stay intact.
 */
export function rebindCandidateToSession(
  candidate: NormalizedImportCandidate,
  binding: { sessionId: string; projectId?: string },
): NormalizedImportCandidate {
  const { sessionId, projectId } = binding;
  return {
    source: { ...candidate.source, sessionId },
    events: candidate.events.map((event) => ({
      ...event,
      sessionId,
      ...(projectId ? { projectId } : {}),
    })),
  };
}

function fallbackTitle(subject: ClaudeImportSubject): string {
  if (subject.projectName) {
    return `Claude ${labelForSource(subject.source)} · ${subject.projectName}`;
  }
  return `Claude ${labelForSource(subject.source)} session`;
}

function prefixTitleWithSource(title: string, source: ClaudeSource): string {
  const prefix = `Claude ${labelForSource(source)}`;
  if (title.toLowerCase().startsWith("claude")) {
    return title;
  }
  return `${prefix} · ${title}`;
}

function labelForSource(source: ClaudeSource): string {
  return source === "desktop" ? "Desktop" : "Code";
}

function describeSourceDetail(subject: ClaudeImportSubject, turnCount: number): string {
  const parts: string[] = [];
  parts.push(`${turnCount} turn${turnCount === 1 ? "" : "s"}`);
  parts.push(`${subject.messages.length} message${subject.messages.length === 1 ? "" : "s"}`);
  if (subject.projectName) {
    parts.push(subject.projectName);
  }
  parts.push(`from Claude ${labelForSource(subject.source)}`);
  return parts.join(" · ");
}

type ConversationTurn = {
  title: string;
  summary: string;
  timestamp: string;
  /**
   * Stable id of the assistant message that produced this turn, when the
   * turn has one. Used to attach the assistant message's token usage to the
   * resulting event. `null` for turns with no assistant message (an
   * unanswered human turn or a standalone system message).
   */
  assistantMessageId: string | null;
};

/**
 * Pair every consecutive (human, assistant) sequence into a single Mori
 * timeline turn. Stray assistant messages without a preceding human (or
 * vice versa) still produce a turn so nothing is silently dropped.
 */
export function pairMessagesIntoTurns(messages: ClaudeMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let buffered: ClaudeMessage | null = null;
  for (const message of messages) {
    if (message.role === "human") {
      if (buffered) {
        turns.push(messageToTurn(buffered, null));
      }
      buffered = message;
      continue;
    }
    if (message.role === "assistant") {
      turns.push(messageToTurn(buffered, message));
      buffered = null;
      continue;
    }
    // system / unknown — flush any pending human and emit a standalone
    // entry so the user can still see context in the timeline.
    if (buffered) {
      turns.push(messageToTurn(buffered, null));
      buffered = null;
    }
    turns.push(messageToTurn(null, message));
  }
  if (buffered) {
    turns.push(messageToTurn(buffered, null));
  }
  return turns;
}

/** Id of the most recent turn that has an assistant message, or null. */
function lastAssistantId(turns: ConversationTurn[]): string | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const id = turns[index].assistantMessageId;
    if (id) return id;
  }
  return undefined;
}

function messageToTurn(
  human: ClaudeMessage | null,
  assistant: ClaudeMessage | null,
): ConversationTurn {
  const titleSeed = (human?.content ?? assistant?.content ?? "").trim();
  const summarySeed = (assistant?.content ?? human?.content ?? "").trim();
  return {
    title: summarize(titleSeed || "Untitled Claude turn", 90),
    summary: summarize(summarySeed || "(no response captured)", 220),
    timestamp:
      assistant?.createdAt && assistant.createdAt.trim().length > 0
        ? assistant.createdAt
        : human?.createdAt ?? "",
    assistantMessageId: assistant?.id ?? null,
  };
}

function summarize(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}
