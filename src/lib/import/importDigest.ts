/**
 * Import digest — a compact, powerful "this is what's going in" summary for
 * the connect / import moment. Instead of leading with "review 319 events",
 * the surface can lead with a one-glance breakdown: how many conversation
 * turns, tool calls, file changes, research and build runs, and over what
 * span. Reuses the timeline lane classifier so the digest and the timeline
 * agree on what each event is. Pure and deterministic.
 */
import type { SourceRef, TimelineEvent } from "../../domain/types";
import {
  getActivityLaneVisuals,
  getTimelineLaneForEvent,
  type ActivityLaneId,
} from "../timeline/activityModel";

export type ImportDigestLane = {
  lane: ActivityLaneId;
  label: string;
  count: number;
};

export type ImportDigestSpan = {
  start: string | null;
  end: string | null;
  /** Human duration, e.g. "약 3시간" / "약 45분". Empty when unknown. */
  durationLabel: string;
};

export type ImportDigest = {
  eventCount: number;
  /** Non-empty lanes, highest count first. */
  lanes: ImportDigestLane[];
  conversationTurns: number;
  toolCalls: number;
  fileChanges: number;
  research: number;
  buildRuns: number;
  span: ImportDigestSpan;
};

export function buildImportDigest(
  events: readonly TimelineEvent[],
  sources?: readonly SourceRef[] | ReadonlyMap<string, SourceRef>,
): ImportDigest {
  const counts = new Map<ActivityLaneId, number>();
  let start: string | null = null;
  let end: string | null = null;

  for (const event of events) {
    const lane = getTimelineLaneForEvent({ event, sources });
    counts.set(lane, (counts.get(lane) ?? 0) + 1);
    if (event.start) {
      if (start === null || event.start < start) start = event.start;
      if (end === null || event.start > end) end = event.start;
    }
  }

  const lanes: ImportDigestLane[] = [...counts.entries()]
    .map(([lane, count]) => ({ lane, label: getActivityLaneVisuals(lane).label, count }))
    .sort((a, b) => b.count - a.count || a.lane.localeCompare(b.lane));

  const laneCount = (id: ActivityLaneId): number => counts.get(id) ?? 0;

  return {
    eventCount: events.length,
    lanes,
    conversationTurns: laneCount("conversation"),
    toolCalls: laneCount("command"),
    fileChanges: laneCount("files"),
    research: laneCount("research"),
    buildRuns: laneCount("build"),
    span: { start, end, durationLabel: durationLabel(start, end) },
  };
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return "";
  const minutes = Math.round((endMs - startMs) / 60000);
  if (minutes < 1) return "1분 미만";
  if (minutes < 60) return `약 ${minutes}분`;
  const hours = Math.round(minutes / 60);
  return `약 ${hours}시간`;
}
