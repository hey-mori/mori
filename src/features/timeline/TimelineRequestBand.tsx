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
 * Bars share the exact coordinate transform the cards use (`contentLeftPx` +
 * `timestampToXPercent` × `contentWidthPx`), so a bar sits directly above the
 * cards it groups. A bar's right edge is clamped to the next request's start so
 * a long-running tail never visually overruns the request that follows.
 */
export function TimelineRequestBand({
  requests,
  range,
  contentLeftPx,
  contentWidthPx,
  selectedEventIds,
  onSelect,
}: {
  requests: RequestSpan[];
  range: TimelineRange;
  contentLeftPx: number;
  contentWidthPx: number;
  /** Event ids currently selected/focused, so the owning bar reads active. */
  selectedEventIds: Set<string>;
  onSelect: (eventId: string) => void;
}) {
  if (requests.length === 0) return null;

  const xFor = (iso: string) =>
    contentLeftPx + (timestampToXPercent(iso, range) / 100) * contentWidthPx;

  return (
    <div
      className="timeline-request-band"
      style={{ top: `${REQUEST_BAND_TOP}px`, height: `${REQUEST_BAND_HEIGHT}px` }}
    >
      {requests.map((request, index) => {
        const left = xFor(request.start);
        const next = requests[index + 1];
        const rawRight = xFor(request.end);
        const right = next ? Math.min(rawRight, xFor(next.start)) : rawRight;
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
