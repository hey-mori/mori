import { Search } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { getActivityLaneVisuals } from "../../lib/timeline/activityModel";
import type { TimelineRenderModel } from "../../lib/timeline/timelineViewModel";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import {
  computeMinimapViewport,
  minimapClickToScrollLeft,
  type MinimapViewport,
} from "../../lib/timeline/minimapViewport";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineRequestBand } from "./TimelineRequestBand";
import { TimelineGridLines } from "./TimelineGridLines";
import { TimelineLane } from "./TimelineLane";
import { RelationshipLineLayer } from "./RelationshipLineLayer";
import type { Relationship } from "../../domain/types";
import type { BaseMenuItemSpec } from "../../components/ui/BaseActionMenu";
import { activityLaneIcons } from "./lib/activityIcons";

export type TimelineCanvasProps = {
  model: TimelineRenderModel;
  relationships: Relationship[];
  density: TimelineDensity;
  /** Optional callback so the parent can resize-driven recompute layout. */
  onFrameWidth?: (width: number) => void;
  /**
   * Optional callback reporting which horizontal slice of the timeline is
   * currently visible, so the minimap can draw a real viewport rectangle.
   */
  onViewportChange?: (viewport: MinimapViewport) => void;
  onSelect: (itemId: string) => void;
  onHover: (itemId: string | null) => void;
  eventMenuItems?: (event: TimelineRenderModel["visibleDisplayItems"][number] & { kind: "event" }) => BaseMenuItemSpec[];
};

/** Imperative handle so the minimap can pan the canvas. */
export type TimelineCanvasHandle = {
  /** Scroll so the given 0–1 fraction of the timeline span is centred. */
  scrollToFraction: (fraction: number) => void;
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
export const TimelineCanvas = forwardRef<TimelineCanvasHandle, TimelineCanvasProps>(
  function TimelineCanvas(
    { model, relationships, density, onFrameWidth, onViewportChange, onSelect, onHover, eventMenuItems },
    ref,
  ) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState<number>(DEFAULT_FRAME_WIDTH);

  // Report the visible horizontal slice of the timeline so the minimap can
  // draw a real viewport rectangle instead of a static decoration.
  const emitViewport = useCallback(() => {
    const element = scrollerRef.current;
    if (!element || !onViewportChange) return;
    onViewportChange(
      computeMinimapViewport(
        element.scrollLeft,
        element.clientWidth,
        element.scrollWidth,
      ),
    );
  }, [onViewportChange]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToFraction(fraction: number) {
        const element = scrollerRef.current;
        if (!element) return;
        element.scrollLeft = minimapClickToScrollLeft(
          fraction,
          element.clientWidth,
          element.scrollWidth,
        );
        emitViewport();
      },
    }),
    [emitViewport],
  );

  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      if (!width) return;
      const next = Math.min(MAX_FRAME_WIDTH, Math.max(MIN_FRAME_WIDTH, width + LANE_LABEL_WIDTH));
      setFrameWidth(next);
      onFrameWidth?.(next);
      emitViewport();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", emitViewport, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", emitViewport);
    };
  }, [onFrameWidth, emitViewport]);

  // The rendered frame width changes with filters / density / lane
  // visibility; recompute the viewport when it does so the rectangle
  // stays honest after the scrollable width shifts.
  useLayoutEffect(() => {
    emitViewport();
  }, [emitViewport, model.layout.frameWidth, model.visibleEvents.length, density]);

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
            title="현재 필터에 맞는 이벤트가 없습니다"
            description="툴바에서 필터를 조정하거나 소스에서 가져오면 타임라인이 채워집니다."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-2col">
      {/* Fixed lane-label column — rendered OUTSIDE the scroller, so it is
          physically pinned to the left (never scrolls with the content), shows
          one consistent edge shadow, and has no time axis above it. Labels are
          positioned to mirror the frame's lane rows (axis height + lane top). */}
      {/* Width only — no fixed height. The `.timeline-2col` flex row stretches
          this column to match the scroller, whose height includes the
          horizontal scrollbar, so the rail and canvas bottoms always align
          (a fixed frameHeight here left the rail ~12px short of the scroller). */}
      <div
        className="timeline-axis-col"
        style={{ width: `${layout.contentLeftPx}px` }}
      >
        <div className="timeline-axis-col-corner" style={{ height: `${layout.laneOffsetPx}px` }} />
        {lanes.map((lane) => {
          const laneLayout = layout.lanes.find((entry) => entry.type === lane.type);
          if (!laneLayout) return null;
          const Icon = activityLaneIcons[lane.type];
          const visuals = getActivityLaneVisuals(lane.type);
          return (
            <div
              key={lane.type}
              className={`lane-axis-label lane-tone-${visuals.tone}${lane.eventCount === 0 ? " is-empty" : ""}`}
              style={{ top: `${laneLayout.top}px`, height: `${laneLayout.height}px` }}
            >
              <span className="lane-axis-icon" aria-hidden="true">
                <Icon size={14} />
              </span>
              <strong>{visuals.label}</strong>
              <span className={`lane-axis-count${lane.eventCount === 0 ? " is-zero" : ""}`}>
                {lane.eventCount}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scroller — ONLY the time content. The frame keeps its original
          coordinates (cards offset by contentLeftPx); a negative left margin
          pulls the now-empty label gutter off-screen so the first card sits at
          the scroller's left edge and the horizontal scrollbar covers content. */}
      <div className="timeline-scroller" ref={scrollerRef}>
        <div
          className={`timeline-frame ${model.mode === "flow" ? "compact" : ""}${model.focusActive ? " is-focus-active" : ""}`}
          style={{
            width: `${Math.max(layout.frameWidth, frameWidth)}px`,
            height: `${layout.frameHeight}px`,
            marginLeft: `-${layout.contentLeftPx}px`,
          }}
        >
          <TimelineAxis
            ticks={ticks}
            frameWidth={layout.frameWidth}
            contentLeftPx={layout.contentLeftPx}
            contentWidthPx={layout.contentWidthPx}
          />
          <TimelineRequestBand
            requests={model.requestSpans}
            range={model.range}
            contentLeftPx={layout.contentLeftPx}
            contentWidthPx={layout.contentWidthPx}
            eventLayouts={eventAnchorIndex}
            selectedEventIds={model.focusedSet}
            onSelect={onSelect}
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
                  tone={getActivityLaneVisuals(lane.type).tone}
                  lane={laneLayout}
                  items={lane.items}
                  dimmed={lane.dimmed}
                  layouts={layoutIndex}
                  density={density}
                  selectedItemId={model.selectedItem?.id ?? null}
                  focusedSet={model.focusedSet}
                  onSelect={onSelect}
                  onHover={onHover}
                  eventMenuItems={eventMenuItems}
                  sourceIndex={model.sourceIndex}
                />
              );
            })}
          </div>
          <TimelineGridLines
            ticks={ticks}
            contentLeftPx={layout.contentLeftPx}
            contentWidthPx={layout.contentWidthPx}
            topPx={layout.laneOffsetPx}
            heightPx={Math.max(layout.frameHeight - layout.laneOffsetPx, 0)}
          />
        </div>
      </div>
    </div>
  );
});

export { LANE_LABEL_WIDTH, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH, DEFAULT_FRAME_WIDTH };
