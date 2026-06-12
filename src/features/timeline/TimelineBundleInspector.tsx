import { Badge } from "../../components/ui/Badge";
import { BaseInspectorPanel } from "../../components/ui/BaseInspectorPanel";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { eventTypeLabels } from "../../domain/constants";
import type { MockSession } from "../../domain/types";
import { formatTimeRange } from "../../lib/formatting/time";
import { getActivityLaneVisuals } from "../../lib/timeline/activityModel";
import type { TimelineDisplayBundle } from "../../lib/timeline/displayItems";

/**
 * The read panel for a bundle (a folded run of nearby events), built on the same
 * BaseInspectorPanel shell as the single-event inspector so the right side reads
 * as one surface, not two. A bundle is just "these events, folded together" — so
 * the panel answers exactly that: what it is (title + lane) and what is inside
 * it. The earlier density chart, type-mix, "묶인 이유", evidence rollup and action
 * row were inspector-for-its-own-sake; they are gone.
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
      <section className="inspector-section">
        <SectionHeader title="포함된 이벤트" hint={`${includedEvents.length}건`} />
        <ul className="inspector-bundle-events">
          {includedEvents.map((event) => (
            <li key={event.id}>
              <strong>{event.title}</strong>
              <small>
                {eventTypeLabels[event.type]} · {formatTimeRange(event.start, event.end)}
              </small>
            </li>
          ))}
        </ul>
      </section>
    </BaseInspectorPanel>
  );
}
