import { Badge } from "../../components/ui/Badge";
import { eventTypeLabels, eventTypeTone } from "../../domain/constants";
import type { TimelineEvent } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import { describeTrustLevel } from "../../lib/relationships/relationshipDisplay";

export function FocusPathSummary({
  selectedEvent,
  causeCount,
  resultCount,
  onClearFocus,
}: {
  selectedEvent: TimelineEvent;
  causeCount: number;
  resultCount: number;
  onClearFocus?: () => void;
}) {
  const trust = describeTrustLevel(selectedEvent.trustLevel);
  return (
    <div className="focus-path-summary">
      <div className="focus-path-meta">
        <Badge tone={eventTypeTone[selectedEvent.type]}>{eventTypeLabels[selectedEvent.type]}</Badge>
        <Badge tone={trust.tone}>{trust.label}</Badge>
        <span className="muted">{formatTime(selectedEvent.start)}</span>
      </div>
      <h3>{selectedEvent.title}</h3>
      <p>{selectedEvent.summary}</p>
      <div className="focus-path-counts">
        <span>
          <strong>{causeCount}</strong> upstream
        </span>
        <span aria-hidden="true">→</span>
        <span>
          <strong>Selected event</strong>
        </span>
        <span aria-hidden="true">→</span>
        <span>
          <strong>{resultCount}</strong> downstream
        </span>
        {onClearFocus ? (
          <button type="button" className="focus-clear" onClick={onClearFocus}>
            Clear focus
          </button>
        ) : null}
      </div>
    </div>
  );
}
