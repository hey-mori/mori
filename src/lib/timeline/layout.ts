import type { EventType, TimelineEvent } from "../../domain/types";

export type TimelineRange = {
  start: string;
  end: string;
};

export type PositionedEvent = TimelineEvent & {
  xPercent: number;
  laneIndex: number;
};

export function timestampToXPercent(timestamp: string, range: TimelineRange): number {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const value = new Date(timestamp).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(value) || end <= start) {
    return 0;
  }

  const percent = ((value - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function groupEventsByLane<T extends TimelineEvent>(events: T[], laneOrder: EventType[]): Record<EventType, T[]> {
  const grouped = Object.fromEntries(laneOrder.map((lane) => [lane, []])) as unknown as Record<EventType, T[]>;

  for (const event of events) {
    grouped[event.type] ??= [];
    grouped[event.type].push(event);
  }

  for (const lane of laneOrder) {
    grouped[lane].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  return grouped;
}

export function positionEvents(events: TimelineEvent[], laneOrder: EventType[], range: TimelineRange): PositionedEvent[] {
  return events.map((event) => ({
    ...event,
    xPercent: timestampToXPercent(event.start, range),
    laneIndex: Math.max(0, laneOrder.indexOf(event.type)),
  }));
}

export function getTimelineRange(events: TimelineEvent[], fallback: TimelineRange): TimelineRange {
  if (!events.length) return fallback;

  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const last = sorted[sorted.length - 1];
  return {
    start: sorted[0]?.start ?? fallback.start,
    end: last?.end ?? last?.start ?? fallback.end,
  };
}
