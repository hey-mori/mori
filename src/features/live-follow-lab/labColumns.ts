import type { TimelineEvent } from "../../domain/types";
import { buildRequestSpans } from "../../lib/timeline/requestSpans";

export type LabColumn = {
  id: string;
  kind: "request" | "orphan";
  /** 0-based request ordinal, or -1 for the orphan column. */
  index: number;
  title: string;
  events: TimelineEvent[];
};

/**
 * Segment built timeline events into the lab's request columns via the shared
 * `buildRequestSpans`, plus a leading "orphan" column for any events before the
 * first user request (a tool result on session resume, say) so the lab never
 * silently drops a line it read. Pure derivation, unit-testable.
 */
export function buildLabColumns(events: TimelineEvent[]): LabColumn[] {
  const spans = buildRequestSpans(events);
  const byId = new Map(events.map((event) => [event.id, event]));
  const claimed = new Set<string>();
  const columns: LabColumn[] = [];

  for (const span of spans) {
    const spanEvents = span.eventIds
      .map((id) => byId.get(id))
      .filter((event): event is TimelineEvent => Boolean(event));
    for (const event of spanEvents) claimed.add(event.id);
    columns.push({
      id: span.id,
      kind: "request",
      index: span.index,
      title: span.title,
      events: spanEvents,
    });
  }

  const orphans = events.filter((event) => !claimed.has(event.id));
  if (orphans.length > 0) {
    columns.unshift({
      id: "lfl-orphan",
      kind: "orphan",
      index: -1,
      title: "요청 이전",
      events: orphans,
    });
  }

  return columns;
}
