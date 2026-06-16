import type { LaidOutTimelineItem } from "../../lib/timeline/collisionLayout";
import { timestampToXPercent, type TimelineRange } from "../../lib/timeline/layout";
import {
  REQUEST_BAND_HEIGHT,
  REQUEST_BAND_TOP,
  type RequestSpan,
} from "../../lib/timeline/requestSpans";

/** A request bar narrower than this still shows as a legible tick. */
const MIN_BAR_WIDTH = 6;

/**
 * The request-grouping band: a slim strip over the lanes where each request (a
 * user ask → all the work it triggered) is one bar spanning its start → end on
 * the time axis. It brackets the swimlane into requests so the eye can see
 * where one ask's work ends and the next begins, the way a Gantt summary row
 * ties a group of tasks together.
 *
 * A bar is bracketed by the laid-out span of its member CARDS, not by raw
 * timestamps: card widths are clamped to a readable minimum, so a bar drawn
 * from timestamps alone would undershoot the cards it groups and look too
 * narrow. Using the cards' own `anchorLeft` / `anchorRight` makes the bar line
 * up exactly with its cards. A bar's right edge is clamped to the next
 * request's left so a long-running tail never overruns the request that follows.
 */
export function TimelineRequestBand({
  requests,
  range,
  contentLeftPx,
  contentWidthPx,
  eventLayouts,
  selectedEventIds,
  onSelect,
}: {
  requests: RequestSpan[];
  range: TimelineRange;
  contentLeftPx: number;
  contentWidthPx: number;
  /** Laid-out card geometry per event id, so bars bracket their real cards. */
  eventLayouts: Map<string, LaidOutTimelineItem>;
  /** Event ids currently selected/focused, so the owning bar reads active. */
  selectedEventIds: Set<string>;
  onSelect: (eventId: string) => void;
}) {
  if (requests.length === 0) return null;

  const xFor = (iso: string) =>
    contentLeftPx + (timestampToXPercent(iso, range) / 100) * contentWidthPx;

  // Left/right edges of each request from the laid-out span of its member
  // cards, falling back to the request's timestamps when none are laid out
  // (e.g. every member filtered out of the visible set).
  const bounds = requests.map((request) => {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const id of request.eventIds) {
      const item = eventLayouts.get(id);
      if (!item) continue;
      left = Math.min(left, item.anchorLeft.x);
      right = Math.max(right, item.anchorRight.x);
    }
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      const fallbackLeft = xFor(request.start);
      return { left: fallbackLeft, right: Math.max(fallbackLeft + MIN_BAR_WIDTH, xFor(request.end)) };
    }
    return { left, right };
  });

  return (
    <div
      className="timeline-request-band"
      style={{ top: `${REQUEST_BAND_TOP}px`, height: `${REQUEST_BAND_HEIGHT}px` }}
    >
      {requests.map((request, index) => {
        const { left, right: rawRight } = bounds[index];
        const nextLeft = bounds[index + 1]?.left ?? Number.POSITIVE_INFINITY;
        const right = Math.min(rawRight, nextLeft);
        const width = Math.max(MIN_BAR_WIDTH, right - left);
        const active = request.eventIds.some((id) => selectedEventIds.has(id));
        return (
          <button
            key={request.id}
            type="button"
            className={`timeline-request-bar${active ? " is-active" : ""}`}
            style={{ left: `${left}px`, width: `${width}px` }}
            onClick={() => onSelect(request.eventIds[0])}
            title={`요청 ${request.index + 1} · ${request.title}`}
            aria-label={`요청 ${request.index + 1}: ${request.title}`}
          >
            <span className="timeline-request-bar-label">{request.title}</span>
          </button>
        );
      })}
    </div>
  );
}
