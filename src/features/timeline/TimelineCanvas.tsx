import { Search } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { eventTypeIcons, eventTypeLabels } from "../../domain/constants";
import type { TimelineRenderModel } from "../../lib/timeline/timelineViewModel";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineLane } from "./TimelineLane";
import { RelationshipLineLayer } from "./RelationshipLineLayer";
import type { Relationship } from "../../domain/types";

export type TimelineCanvasProps = {
  model: TimelineRenderModel;
  relationships: Relationship[];
  density: TimelineDensity;
  /** Optional callback so the parent can resize-driven recompute layout. */
  onFrameWidth?: (width: number) => void;
  onSelect: (itemId: string) => void;
  onHover: (itemId: string | null) => void;
};

const MIN_FRAME_WIDTH = 1100;
const MAX_FRAME_WIDTH = 1640;
const DEFAULT_FRAME_WIDTH = 1240;
const LANE_LABEL_WIDTH = 138;

/**
 * Scroll contract:
 *
 * - `.timeline-scroller` is the ONLY horizontally-scrollable element. Vertical
 *   scrolling happens on the page itself.
 * - The time ruler is `position: sticky; top: 0` inside the scroller so it
 *   pins to the top of the frame as the user scrolls vertically.
 * - Each lane label is `position: sticky; left: 0` so the lane name remains
 *   visible during horizontal scroll.
 * - The relationship layer and event cards sit inside the absolute-positioned
 *   layout; lane labels render in front of them on the left edge with a
 *   solid background.
 */
export function TimelineCanvas({
  model,
  relationships,
  density,
  onFrameWidth,
  onSelect,
  onHover,
}: TimelineCanvasProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState<number>(DEFAULT_FRAME_WIDTH);

  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      if (!width) return;
      const next = Math.min(MAX_FRAME_WIDTH, Math.max(MIN_FRAME_WIDTH, width));
      setFrameWidth(next);
      onFrameWidth?.(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onFrameWidth]);

  // Trust the parent's model; only fall back to local frame width when the
  // model was built with the default width.
  const layout = model.layout;
  const lanes = model.lanes;
  const ticks = model.ticks;
  const layoutIndex = model.layoutIndex;
  const eventAnchorIndex = model.eventAnchorIndex;

  const empty = model.visibleEvents.length === 0;

  const laneRowsStyle = useMemo(
    () => ({ height: `${Math.max(layout.frameHeight - layout.laneOffsetPx, 0)}px` }),
    [layout.frameHeight, layout.laneOffsetPx],
  );

  if (empty) {
    return (
      <div className="timeline-scroller" ref={scrollerRef}>
        <div className="timeline-empty-inset">
          <EmptyState
            icon={Search}
            title="No events match your current filters"
            description="Adjust the filters in the toolbar, or import a source from Evidence Hub to populate this timeline."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-scroller" ref={scrollerRef}>
      <div
        className={`timeline-frame ${model.mode === "flow" ? "compact" : ""}`}
        style={{
          width: `${Math.max(layout.frameWidth, frameWidth)}px`,
          minHeight: `${layout.frameHeight}px`,
        }}
      >
        <TimelineAxis
          ticks={ticks}
          frameWidth={layout.frameWidth}
          contentLeftPx={layout.contentLeftPx}
          contentWidthPx={layout.contentWidthPx}
        />
        <RelationshipLineLayer
          itemLayouts={layoutIndex}
          eventAnchorLayouts={eventAnchorIndex}
          relationships={relationships}
          focusedSet={model.focusedSet}
          focusActive={model.focusActive}
          mode={model.mode}
          frameWidth={layout.frameWidth}
          frameHeight={layout.frameHeight}
        />
        <div className="lanes" style={laneRowsStyle}>
          {lanes.map((lane) => {
            const laneLayout = layout.lanes.find((entry) => entry.type === lane.type);
            if (!laneLayout) return null;
            return (
              <TimelineLane
                key={lane.type}
                icon={eventTypeIcons[lane.type]}
                label={eventTypeLabels[lane.type]}
                tone={lane.type}
                lane={laneLayout}
                laneLabelWidthPx={layout.laneLabelWidthPx}
                items={lane.items}
                eventCount={lane.eventCount}
                layouts={layoutIndex}
                density={density}
                selectedItemId={model.selectedItem?.id ?? null}
                focusedSet={model.focusedSet}
                onSelect={onSelect}
                onHover={onHover}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { LANE_LABEL_WIDTH, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH, DEFAULT_FRAME_WIDTH };
