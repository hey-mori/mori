/**
 * Derive the cheap, honest per-session metric fields that ride on
 * `StoredSessionSummary` — `eventCount` and the token totals.
 *
 * These are computed once from a session's already-persisted imports (the
 * `StoredSessionImport.events`, the only place `tokenUsage` lives). The
 * derivation is pure and storage-agnostic so both the localStorage adapter
 * and any SQLite mirror can share it.
 *
 * Honesty contract: where there is no token usage — Claude Desktop sessions,
 * or events imported before `tokenUsage` was captured — the token fields are
 * omitted entirely. `sumTokenUsage` returns `undefined` for an all-empty list,
 * which we map to "no field" rather than a misleading `{0,0,0}`. The caller
 * never fabricates a number or splits a missing total.
 */

import { sumTokenUsage } from "../claude/tokenUsage";
import type { StoredSessionImport } from "./storageTypes";

/** The optional metric slice persisted on a `StoredSessionSummary`. */
export type SessionSummaryMetrics = {
  eventCount?: number;
  tokenTotal?: number;
  tokenInput?: number;
  tokenOutput?: number;
};

/**
 * Derive `eventCount` + token totals from a session's imports. `eventCount`
 * is the count of every imported event; the token fields are present only
 * when at least one event reported usage. An empty imports list yields an
 * empty object (no zero `eventCount`, so a never-imported session contributes
 * nothing rather than a fake "0 steps").
 */
export function deriveSessionSummaryMetrics(
  imports: StoredSessionImport[],
): SessionSummaryMetrics {
  const events = imports.flatMap((entry) => entry.events);
  if (events.length === 0) return {};

  const metrics: SessionSummaryMetrics = { eventCount: events.length };

  const usage = sumTokenUsage(events.map((event) => event.tokenUsage));
  if (usage && usage.total > 0) {
    metrics.tokenTotal = usage.total;
    metrics.tokenInput = usage.input;
    metrics.tokenOutput = usage.output;
  }

  return metrics;
}
