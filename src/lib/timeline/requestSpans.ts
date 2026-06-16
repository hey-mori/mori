/**
 * Derive request spans from timeline events.
 *
 * A "request" is one user ask and all the work that follows it until the next
 * user ask: the unit a person actually thinks in ("when I asked X, this is
 * everything that happened"). The import stamps `openedByUser` on the event
 * that opens a real human turn (not a tool-result turn), so requests are the
 * segments between consecutive `openedByUser` events on the time-sorted stream.
 *
 * The swimlane renders each span as a grouping bar over the lanes (a Gantt-style
 * tie that brackets a request's start → end), so the eye can see where one
 * request ends and the next begins without reading timestamps.
 *
 * Sessions with no turn structure (legacy / flat imports, the demo) carry no
 * `openedByUser` marker, so this returns `[]` and the band simply does not
 * render. No React, no mutation, pure derivation, unit-testable.
 */
import type { TimelineEvent } from "../../domain/types";

export type RequestSpan = {
  /** Stable id (the opening ask's `turnId`, or its event id). */
  id: string;
  /** 0-based ordinal of the request within the session. */
  index: number;
  /** ISO start — the earliest member start (the opening ask). */
  start: string;
  /** ISO end — the latest member end (or start, for instantaneous events). */
  end: string;
  /** Every event attributed to this request, the opener first. */
  eventIds: string[];
  /** The opening ask's title, for the bar label and tooltip. */
  title: string;
};

/** Resolve an event's end instant in ms, falling back to its start. */
function eventEndMs(event: TimelineEvent): number {
  const start = Date.parse(event.start);
  const end = event.end ? Date.parse(event.end) : Number.NaN;
  if (Number.isNaN(end)) return start;
  return Math.max(end, start);
}

/**
 * Segment time-sorted events into requests at each `openedByUser` boundary.
 * Events before the first user ask have no owning request and are dropped from
 * the band (they still render as cards). Returns `[]` when no event opens a
 * request, so flat sessions render without a band.
 */
export function buildRequestSpans(events: readonly TimelineEvent[]): RequestSpan[] {
  const sorted = [...events]
    .filter((event) => !Number.isNaN(Date.parse(event.start)))
    .sort((a, b) => {
      const delta = Date.parse(a.start) - Date.parse(b.start);
      if (delta !== 0) return delta;
      return (a.turnIndex ?? 0) - (b.turnIndex ?? 0);
    });

  const groups: { opener: TimelineEvent; members: TimelineEvent[] }[] = [];
  let current: { opener: TimelineEvent; members: TimelineEvent[] } | null = null;
  for (const event of sorted) {
    if (event.openedByUser) {
      current = { opener: event, members: [event] };
      groups.push(current);
    } else if (current) {
      current.members.push(event);
    }
  }

  return groups.map((group, index) => {
    let minStart = Date.parse(group.opener.start);
    let maxEnd = eventEndMs(group.opener);
    const eventIds: string[] = [];
    for (const member of group.members) {
      eventIds.push(member.id);
      const start = Date.parse(member.start);
      if (start < minStart) minStart = start;
      const end = eventEndMs(member);
      if (end > maxEnd) maxEnd = end;
    }
    return {
      id: group.opener.turnId ?? group.opener.id,
      index,
      start: new Date(minStart).toISOString(),
      end: new Date(maxEnd).toISOString(),
      eventIds,
      title: group.opener.title.trim(),
    };
  });
}

// ─── Band layout constants ─────────────────────────────────────────────────────
// The band lives in a reserved strip between the 40px time axis and the lanes.
// Sharing these keeps the layout offset (which pushes the lanes down) and the
// band component (which paints the strip) in agreement.

/** Height of the request-bar strip. */
export const REQUEST_BAND_HEIGHT = 26;
/** Top of the strip. Sits well below the 40px time axis so the axis labels
 *  keep clear breathing room and are never crowded by the bars. */
export const REQUEST_BAND_TOP = 54;
/** Breathing room between the strip and the first lane. */
export const REQUEST_BAND_BOTTOM_GAP = 8;
/**
 * Lane offset to use when a band is present: the strip's bottom edge plus the
 * gap, so every lane / gridline / label below it is pushed down by exactly the
 * band's footprint.
 */
export const REQUEST_BAND_LANE_OFFSET =
  REQUEST_BAND_TOP + REQUEST_BAND_HEIGHT + REQUEST_BAND_BOTTOM_GAP;
