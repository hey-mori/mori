/**
 * Per-turn token-usage helpers for Claude imports.
 *
 * The Rust parser computes a session-level `ClaudeTokenUsage` aggregate
 * (input/output/total + last model), deduped by assistant `message.id`.
 * When a Claude conversation is turned into Mori `TimelineEvent`s, that
 * usage was previously dropped on the floor. These helpers let the import
 * pipeline attach the usage to the assistant event(s) it belongs to.
 *
 * The primitive the import works against is a map of assistant `message.id`
 * → per-message usage. Today the only usage Mori receives is the session
 * aggregate, so the map carries a single entry keyed by the last assistant
 * turn; if Claude Code ever exposes true per-message usage the same map
 * shape carries it without any caller change. Everything degrades to
 * "no field" when usage is absent — older logs and Claude Desktop
 * conversations simply omit it.
 */

import type { TimelineEvent } from "../../domain/types";
import type { ClaudeTokenUsage } from "./types";

/** The slice of token usage that lands on a `TimelineEvent`. */
export type EventTokenUsage = NonNullable<TimelineEvent["tokenUsage"]>;

/** Map of assistant `message.id` → the usage to stamp on its event. */
export type TokenUsageByMessageId = Record<string, EventTokenUsage>;

/**
 * Look up the usage to stamp on the assistant message with `messageId`.
 * Returns `undefined` (so the caller omits the field entirely) when there
 * is no usage for that id — a missing id, an empty map, or a zero-token
 * entry all degrade to nothing rather than a misleading `{0,0,0}`.
 */
export function tokenUsageForMessage(
  usageById: TokenUsageByMessageId | undefined,
  messageId: string | undefined,
): EventTokenUsage | undefined {
  if (!usageById || !messageId) return undefined;
  const usage = usageById[messageId];
  if (!usage) return undefined;
  if (usage.total <= 0 && usage.input <= 0 && usage.output <= 0) return undefined;
  return usage;
}

/**
 * Sum a list of per-event usages into a single total. Skips `undefined`
 * entries (events with no usage), so a mixed list adds only what's present.
 * Returns `undefined` when nothing contributed, keeping the "no field"
 * contract. The model is the last non-empty one seen, matching the
 * session-aggregate convention.
 */
export function sumTokenUsage(
  usages: Array<EventTokenUsage | undefined>,
): EventTokenUsage | undefined {
  let input = 0;
  let output = 0;
  let total = 0;
  let model: string | undefined;
  let seen = false;
  for (const usage of usages) {
    if (!usage) continue;
    seen = true;
    input += usage.input;
    output += usage.output;
    total += usage.total;
    if (usage.model) model = usage.model;
  }
  if (!seen) return undefined;
  return model ? { input, output, total, model } : { input, output, total };
}

/**
 * Build a per-message usage map from a Claude Code session's aggregate.
 *
 * Mori only receives a single session-level total today, so the whole
 * aggregate is attributed to the last assistant turn (the most recent
 * reply the user saw). That keeps the otherwise-dropped figure on a real
 * event without inventing a fake per-turn split. Returns an empty map when
 * there is no usage (zero totals, no assistant turn, or Claude Desktop,
 * which carries no usage at all) so callers attach nothing.
 */
export function tokenUsageMapFromAggregate(
  aggregate: ClaudeTokenUsage | undefined,
  lastAssistantMessageId: string | undefined,
): TokenUsageByMessageId {
  if (!aggregate || !lastAssistantMessageId) return {};
  const input = aggregate.inputTokens ?? 0;
  const output = aggregate.outputTokens ?? 0;
  const total = aggregate.totalTokens ?? input + output;
  if (total <= 0 && input <= 0 && output <= 0) return {};
  const usage: EventTokenUsage = aggregate.model
    ? { input, output, total, model: aggregate.model }
    : { input, output, total };
  return { [lastAssistantMessageId]: usage };
}
