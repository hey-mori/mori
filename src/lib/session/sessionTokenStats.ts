/**
 * Session-level token statistics.
 *
 * Claude imports stamp per-event `tokenUsage` on the assistant events (the
 * session aggregate rides on the last assistant turn; see
 * `lib/claude/tokenUsage.ts`). This helper rolls the events back up into one
 * honest session figure for the 개요 scale strip. Returns `undefined` when no
 * event carries usage (demo data, manual notes, older logs, Claude Desktop),
 * so the surface hides the metric instead of showing a misleading 0.
 */

import type { TimelineEvent } from "../../domain/types";
import { sumTokenUsage } from "../claude/tokenUsage";
import { formatTokenCount } from "../claude/conversationStats";

export type SessionTokenStats = {
  input: number;
  output: number;
  total: number;
  model?: string;
  /** "12.4K": the headline for the metric cell. */
  totalLabel: string;
  /** "입력 9.1K · 출력 3.3K" plus the model when known: the hover detail. */
  detailLabel: string;
};

export function buildSessionTokenStats(
  events: TimelineEvent[],
): SessionTokenStats | undefined {
  const summed = sumTokenUsage(events.map((event) => event.tokenUsage));
  if (!summed || summed.total <= 0) return undefined;
  const detailParts = [
    `입력 ${formatTokenCount(summed.input)}`,
    `출력 ${formatTokenCount(summed.output)}`,
  ];
  if (summed.model) detailParts.push(summed.model);
  return {
    input: summed.input,
    output: summed.output,
    total: summed.total,
    model: summed.model,
    totalLabel: formatTokenCount(summed.total),
    detailLabel: detailParts.join(" · "),
  };
}
