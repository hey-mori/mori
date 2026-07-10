/**
 * Conversation statistics — derived view over a Claude message list.
 *
 * Used by the Connections preview header and the full ConversationViewer
 * to show "350 messages · X tool calls · Y user turns · Z Claude replies"
 * without rewalking the array in every component.
 *
 * The classifier prefers the `subkind` field that the Rust parser now
 * emits, but falls back to a glyph check on `content` so older payloads
 * (and tests that craft messages by hand) still produce sensible numbers.
 */

import type { ClaudeMessage } from "./types";

export type ConversationStats = {
  /** Total number of message rows (including tool-result envelopes). */
  totalMessages: number;
  /** Real user input only — excludes tool-result envelopes. */
  humanMessages: number;
  /** Assistant rows excluding tool-only invocations. */
  assistantMessages: number;
  /** Assistant rows that are tool invocations (🔧 …). */
  toolUses: number;
  /** `human` rows that are actually tool responses (↳ 도구 결과 / 오류). */
  toolResults: number;
  /**
   * Wall-clock span between the earliest and latest message that carries a
   * parsable timestamp. Localised Korean label ("2시간 45분") or `null` when
   * the conversation has no usable timestamps.
   */
  durationLabel: string | null;
};

export function computeConversationStats(messages: ClaudeMessage[]): ConversationStats {
  let humanMessages = 0;
  let assistantMessages = 0;
  let toolUses = 0;
  let toolResults = 0;
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const message of messages) {
    const kind = classifyMessage(message);
    if (kind === "tool_result") {
      toolResults += 1;
    } else if (kind === "tool_use") {
      toolUses += 1;
    } else if (message.role === "human") {
      humanMessages += 1;
    } else if (message.role === "assistant") {
      assistantMessages += 1;
    }

    const epoch = parseMessageTimestamp(message.createdAt);
    if (epoch !== null) {
      if (earliest === null || epoch < earliest) earliest = epoch;
      if (latest === null || epoch > latest) latest = epoch;
    }
  }

  return {
    totalMessages: messages.length,
    humanMessages,
    assistantMessages,
    toolUses,
    toolResults,
    durationLabel: formatDuration(earliest, latest),
  };
}

/**
 * Resolve the subkind of a single message. Public so the ConversationViewer
 * can ask "is this row a tool result?" without duplicating the heuristic.
 */
export function classifyMessage(message: ClaudeMessage): "tool_result" | "tool_use" | "" {
  if (message.subkind === "tool_result" || message.subkind === "tool_use") {
    return message.subkind;
  }
  const trimmed = message.content.trimStart();
  if (message.role === "human") {
    // "↳ 도구 결과 …" / "↳ 도구 오류 …" for real results, and "↳ (도구 결과 없음)"
    // for an empty result — all are machine tool responses, not a user turn.
    if (
      trimmed.startsWith("↳ 도구 결과") ||
      trimmed.startsWith("↳ 도구 오류") ||
      trimmed.startsWith("↳ (도구 결과")
    ) {
      return "tool_result";
    }
    return "";
  }
  if (message.role === "assistant" && trimmed.startsWith("🔧")) {
    return "tool_use";
  }
  return "";
}

/**
 * Compact human label for a token count: 1234 → "1.2K", 1_500_000 → "1.5M".
 * Used in headers where a raw "1483920" would be noise. Exact counts stay
 * available in tooltips / detail rows.
 */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) {
    const k = tokens / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  const m = tokens / 1_000_000;
  return `${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
}

function parseMessageTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Numeric → epoch (seconds or milliseconds).
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    return num > 1e12 ? num : num * 1000;
  }
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

function formatDuration(earliest: number | null, latest: number | null): string | null {
  if (earliest === null || latest === null) return null;
  const diff = Math.max(0, latest - earliest);
  if (diff < 60_000) return "1분 미만";
  const totalMinutes = Math.floor(diff / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}일` : `${days}일 ${remainingHours}시간`;
}
