import { Badge } from "../../components/ui/Badge";
import {
  BaseInspectorPanel,
  InspectorSection,
  InspectorRows,
  InspectorRow,
} from "../../components/ui/BaseInspectorPanel";
import { eventTypeLabels } from "../../domain/constants";
import type { MockSession } from "../../domain/types";
import { formatTimeRange } from "../../lib/formatting/time";
import { getActivityLaneVisuals } from "../../lib/timeline/activityModel";
import type { TimelineDisplayBundle } from "../../lib/timeline/displayItems";

/**
 * The read panel for a bundle (a folded run of nearby events), composed from the
 * shared inspector kit so the right rail reads as one system. A bundle only
 * needs to say what it is (title + lane) and what it contains, so the body is a
 * single "포함된 이벤트" section of calm rows.
 */
export function TimelineBundleInspector({
  bundle,
  session,
  onClose,
}: {
  bundle: TimelineDisplayBundle;
  session: MockSession;
  /** Close the inspector from within the panel. Absent ⇒ the X is hidden. */
  onClose?: () => void;
}) {
  const laneVisuals = getActivityLaneVisuals(bundle.laneType);
  const includedEvents = session.events.filter((event) =>
    bundle.memberEventIds.includes(event.id),
  );

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="묶음 인스펙터"
      onClose={onClose}
      eyebrow={<Badge tone={laneVisuals.tone}>{laneVisuals.label}</Badge>}
      title={bundle.title}
      meta={formatTimeRange(bundle.start, bundle.end)}
    >
      <InspectorSection title="포함된 이벤트" hint={`${includedEvents.length}건`}>
        <InspectorRows>
          {includedEvents.map((event) => (
            <InspectorRow
              key={event.id}
              title={event.title}
              meta={`${eventTypeLabels[event.type]} · ${formatTimeRange(event.start, event.end)}`}
            />
          ))}
        </InspectorRows>
      </InspectorSection>
    </BaseInspectorPanel>
  );
}
