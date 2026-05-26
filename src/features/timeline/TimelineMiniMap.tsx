import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { getActivityLaneVisuals, timelineActivityLaneOrder } from "../../lib/timeline/activityModel";
import { focusStateClassName, getEventFocusState } from "../../lib/timeline/focusState";
import { timestampToXPercent, type TimelineRange } from "../../lib/timeline/layout";
import type { TimelineDisplayItem } from "../../lib/timeline/displayItems";
import type { AxisTick } from "../../lib/timeline/timeScale";
import {
  brushWidthToZoom,
  FULL_MINIMAP_VIEWPORT,
  MIN_BRUSH_FRACTION,
  type MinimapViewport,
} from "../../lib/timeline/minimapViewport";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type DragState = {
  /** "pan" moves the brush; "left"/"right" resize an edge (zoom). */
  mode: "pan" | "left" | "right";
  /** Pointer-to-brush-centre offset, captured at grab time (pan only). */
  grabOffset: number;
};

export function TimelineMiniMap({
  items,
  range,
  ticks,
  selectedItemId,
  focusedSet,
  viewport = FULL_MINIMAP_VIEWPORT,
  onSeek,
  onZoom,
}: {
  items: TimelineDisplayItem[];
  range: TimelineRange;
  ticks: AxisTick[];
  selectedItemId: string | null;
  focusedSet: Set<string>;
  /** Visible horizontal slice of the canvas, drawn as the viewport rect. */
  viewport?: MinimapViewport;
  /** Pan the canvas — receives the 0–1 fraction the viewport should centre on. */
  onSeek?: (fraction: number) => void;
  /** Zoom the time axis — receives a new zoom factor. */
  onZoom?: (zoom: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const placed = useMemo(() => {
    return items.map((item) => {
      const xPercent = timestampToXPercent(item.start, range);
      const laneIndex = Math.max(0, timelineActivityLaneOrder.indexOf(item.laneType));
      return { item, xPercent, laneIndex };
    });
  }, [items, range]);

  if (placed.length === 0) return null;

  const totalLanes = timelineActivityLaneOrder.length;
  const selectedDot = placed.find((dot) => dot.item.id === selectedItemId);
  const interactive = Boolean(onSeek);

  /** 0–1 position of a clientX along the minimap track. */
  function fractionAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!onSeek || dragRef.current) return;
    onSeek(fractionAt(event.clientX));
  }

  function beginDrag(
    mode: DragState["mode"],
    event: ReactPointerEvent<HTMLElement>,
  ) {
    event.stopPropagation();
    // Capture keeps move events flowing while the pointer leaves the grip;
    // a failure here must not abort the drag (the handlers sit on the same
    // element regardless), so it is best-effort.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture unavailable — drag still works */
    }
    const centre = (viewport.leftPercent + viewport.widthPercent / 2) / 100;
    dragRef.current = { mode, grabOffset: fractionAt(event.clientX) - centre };
  }

  function handleDragMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const fraction = fractionAt(event.clientX);

    if (drag.mode === "pan") {
      onSeek?.(fraction - drag.grabOffset);
      return;
    }

    // Resize: one edge is anchored, the dragged edge follows the pointer.
    const leftF = viewport.leftPercent / 100;
    const rightF = (viewport.leftPercent + viewport.widthPercent) / 100;
    let nextLeft = leftF;
    let nextRight = rightF;
    if (drag.mode === "left") {
      nextLeft = Math.min(fraction, rightF - MIN_BRUSH_FRACTION);
    } else {
      nextRight = Math.max(fraction, leftF + MIN_BRUSH_FRACTION);
    }
    const widthF = Math.max(MIN_BRUSH_FRACTION, nextRight - nextLeft);
    onZoom?.(brushWidthToZoom(widthF));
    onSeek?.((nextLeft + nextRight) / 2);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  return (
    <div className="mini-map" aria-label="Timeline overview">
      <div className="mini-map-axis" aria-hidden="true">
        {ticks.map((tick) => {
          const atStart = tick.xPercent <= 4;
          const atEnd = tick.xPercent >= 96;
          return (
            <span
              key={tick.iso}
              className={`mini-map-tick${atStart ? " is-start" : ""}${atEnd ? " is-end" : ""}`}
              style={
                atStart
                  ? { left: 0 }
                  : atEnd
                    ? { right: 0 }
                    : { left: `${tick.xPercent}%` }
              }
            >
              {tick.label}
            </span>
          );
        })}
      </div>
      <div
        ref={trackRef}
        className={`mini-track${interactive ? " is-seekable" : ""}`}
        onPointerDown={handleTrackPointerDown}
        title={interactive ? "클릭하거나 요약 막대를 끌어 타임라인을 이동합니다." : undefined}
      >
        <span
          className={`mini-map-viewport${interactive ? " is-draggable" : ""}`}
          role={interactive ? "slider" : undefined}
          aria-label={interactive ? "표시 구간" : undefined}
          style={{
            left: `${viewport.leftPercent}%`,
            width: `${viewport.widthPercent}%`,
          }}
          onPointerDown={interactive ? (event) => beginDrag("pan", event) : undefined}
          onPointerMove={interactive ? handleDragMove : undefined}
          onPointerUp={interactive ? endDrag : undefined}
          onPointerCancel={interactive ? endDrag : undefined}
        >
          {onZoom ? (
            <>
              <i
                className="mini-map-handle is-left"
                aria-hidden="true"
                onPointerDown={(event) => beginDrag("left", event)}
                onPointerMove={handleDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
              <i
                className="mini-map-handle is-right"
                aria-hidden="true"
                onPointerDown={(event) => beginDrag("right", event)}
                onPointerMove={handleDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </>
          ) : null}
        </span>
        {placed.map(({ item, xPercent, laneIndex }) => {
          const state = getEventFocusState({
            itemId: item.id,
            itemEntityIds: item.memberEventIds,
            selectedItemId,
            focusedSet,
          });
          const topPercent = (laneIndex / Math.max(1, totalLanes - 1)) * 80 + 10;
          return (
            <i
              key={item.id}
              className={`mini-dot tone-${getActivityLaneVisuals(item.laneType).tone} ${focusStateClassName(state)} ${item.kind === "bundle" ? "is-bundle" : ""}`}
              style={{
                left: `${xPercent}%`,
                top: `${topPercent}%`,
              }}
              title={item.kind === "bundle" ? item.title : item.event.title}
            />
          );
        })}
        {selectedDot ? (
          <span
            className="mini-map-marker"
            style={{ left: `${selectedDot.xPercent}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}
