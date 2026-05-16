import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { TopSessionBar } from "../../components/layout/TopSessionBar";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import {
  buildTimelineRenderModel,
  getActiveLanes,
  shouldHideInspector,
  TIMELINE_INSPECTOR_NARROW_MAX_PX,
} from "../../lib/timeline/timelineViewModel";
import { EventInspector } from "./EventInspector";
import { TimelineBundleInspector } from "./TimelineBundleInspector";
import {
  TimelineCanvas,
  LANE_LABEL_WIDTH,
  DEFAULT_FRAME_WIDTH,
  type TimelineCanvasHandle,
} from "./TimelineCanvas";
import {
  FULL_MINIMAP_VIEWPORT,
  type MinimapViewport,
} from "../../lib/timeline/minimapViewport";
import { TimelineChronoList } from "./TimelineChronoList";
import { TimelineEmptyState } from "./TimelineEmptyState";
import { TimelineToolbar } from "./TimelineHeader";
import { TimelineMiniMap } from "./TimelineMiniMap";
import { FlowFocusHeader } from "../flow-focus/FlowFocusHeader";
import { TracePanel } from "../flow-focus/TracePanel";
import { CompanionStrip } from "../companion/CompanionStrip";
import { useCompanionSignals } from "../companion/useCompanionSignals";

/**
 * Thin orchestrator. The product math has moved into
 * `buildTimelineRenderModel`; this component:
 *
 *   1. wires session state + app state into the model input,
 *   2. swaps between Timeline and Flow Focus mode chrome,
 *   3. renders the appropriate inspector for the selected display item.
 */
export function TimelineView({ mode }: { mode: "timeline" | "flow" }) {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const view = useMoriSessionStore(selectSessionView);
  const sessionMode = useMoriSessionStore(selectSessionMode);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const imports = useMoriSessionStore((state) => state.imports);
  const runQuickPass = useMoriSessionStore((state) => state.runQuickPass);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const selectedEventId = useMoriAppStore((state) => state.selectedEventId);
  const hoveredEventId = useMoriAppStore((state) => state.hoveredEventId);
  const activeFilters = useMoriAppStore((state) => state.activeFilters);
  const searchQuery = useMoriAppStore((state) => state.searchQuery);
  const density = useMoriAppStore((state) => state.timelineDensity);
  const activeLanesOnly = useMoriAppStore((state) => state.activeLanesOnly);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const setHoveredEventId = useMoriAppStore((state) => state.setHoveredEventId);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const toggleFilter = useMoriAppStore((state) => state.toggleFilter);
  const clearFilters = useMoriAppStore((state) => state.clearFilters);
  const setTimelineDensity = useMoriAppStore((state) => state.setTimelineDensity);
  const toggleActiveLanesOnly = useMoriAppStore((state) => state.toggleActiveLanesOnly);
  const inspectorCollapsed = useMoriAppStore((state) => state.inspectorCollapsed);
  const setInspectorCollapsed = useMoriAppStore((state) => state.setInspectorCollapsed);

  const [frameWidth, setFrameWidth] = useState<number>(DEFAULT_FRAME_WIDTH);
  const [minimapViewport, setMinimapViewport] = useState<MinimapViewport>(
    FULL_MINIMAP_VIEWPORT,
  );
  const canvasRef = useRef<TimelineCanvasHandle>(null);

  // Track the viewport width so the inspector can auto-hide on narrow
  // screens, where a side column would otherwise crush the canvas.
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const model = useMemo(
    () =>
      buildTimelineRenderModel({
        view,
        mode,
        density,
        selectedEventId: selectedEventId || null,
        hoveredEventId,
        activeFilters,
        searchQuery,
        frameWidth,
        laneLabelWidthPx: LANE_LABEL_WIDTH,
        sessionMode,
        importCount: imports.length,
        hasAnalysis,
      }),
    [
      view,
      mode,
      density,
      selectedEventId,
      hoveredEventId,
      activeFilters,
      searchQuery,
      frameWidth,
      sessionMode,
      imports.length,
      hasAnalysis,
    ],
  );

  const totalLaneCount = model.lanes.length;
  const activeLaneCount = useMemo(() => getActiveLanes(model).length, [model]);

  // The canvas renders the configured lane order, but the user may want to
  // hide empty lanes for a tighter rhythm. We pass a model copy whose lane
  // list has been filtered, while keeping the layout coherent.
  const renderModel = useMemo(() => {
    if (!activeLanesOnly) return model;
    const activeLanes = getActiveLanes(model);
    if (activeLanes.length === model.lanes.length) return model;
    return { ...model, lanes: activeLanes };
  }, [model, activeLanesOnly]);

  const handleFrameWidth = useCallback((width: number) => {
    setFrameWidth((current) => (current === width ? current : width));
  }, []);

  if (model.emptyVariant) {
    return (
      <>
        <TopSessionBar />
        <SessionModeBanner />
        <TimelineEmptyState
          variant={model.emptyVariant}
          onOpenSources={() => setCurrentView("evidence")}
          onRunQuickPass={() => runQuickPass()}
          canRunQuickPass={analysisStatus !== "running"}
        />
      </>
    );
  }

  const selectedItem = renderModel.selectedItem ?? model.selectedItem;
  // The inspector hides when the user collapses it or when the viewport is
  // too narrow for a side column. Flow Focus keeps its Trace panel.
  const inspectorNarrow = viewportWidth <= TIMELINE_INSPECTOR_NARROW_MAX_PX;
  const inspectorHidden = shouldHideInspector({ mode, inspectorCollapsed, viewportWidth });
  // Narrow widths swap the horizontally-scrolling swimlane canvas for a flat
  // vertical chronological list — readable without a wide frame.
  const useChronoList = inspectorNarrow && mode === "timeline";
  const { signals: companionSignals } = useCompanionSignals();

  return (
    <>
      <TopSessionBar />
      <SessionModeBanner />
      <div
        className={`content-grid ${mode === "flow" ? "flow-grid" : ""} ${
          inspectorHidden ? "inspector-collapsed" : ""
        }`}
      >
        <section className="timeline-main">
          {mode === "timeline" ? (
            <CompanionStrip signals={companionSignals} onNavigate={setCurrentView} />
          ) : null}
          {mode === "flow" ? (
            <FlowFocusHeader
              onShowTimeline={() => setCurrentView("timeline")}
              hasFocus={Boolean(selectedEventId)}
              onClearFocus={() => setSelectedEventId(view.events[0]?.id ?? "")}
            />
          ) : (
            <TimelineToolbar
              density={density}
              onSetDensity={setTimelineDensity}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={clearFilters}
              activeLanesOnly={activeLanesOnly}
              onToggleActiveLanesOnly={toggleActiveLanesOnly}
              visibleLaneCount={activeLaneCount}
              totalLaneCount={totalLaneCount}
              inspectorCollapsed={inspectorCollapsed}
              onToggleInspector={() => setInspectorCollapsed(!inspectorCollapsed)}
              inspectorToggleDisabled={inspectorNarrow}
            />
          )}
          {useChronoList ? (
            <TimelineChronoList
              model={renderModel}
              selectedItemId={selectedItem?.id ?? null}
              onSelect={setSelectedEventId}
            />
          ) : (
            <>
              <TimelineCanvas
                ref={canvasRef}
                model={renderModel}
                relationships={view.relationships}
                density={density}
                onFrameWidth={handleFrameWidth}
                onViewportChange={setMinimapViewport}
                onSelect={setSelectedEventId}
                onHover={setHoveredEventId}
              />
              {mode === "timeline" ? (
                <TimelineMiniMap
                  items={model.visibleDisplayItems}
                  range={model.range}
                  ticks={model.ticks}
                  selectedItemId={selectedItem?.id ?? null}
                  focusedSet={model.focusedSet}
                  viewport={minimapViewport}
                  onSeek={(fraction) => canvasRef.current?.scrollToFraction(fraction)}
                />
              ) : null}
            </>
          )}
        </section>
        {inspectorHidden ? null : selectedItem && selectedItem.kind === "bundle" ? (
          <TimelineBundleInspector
            bundle={selectedItem}
            session={view}
            onTrace={() => setCurrentView("flow")}
          />
        ) : mode === "flow" && selectedItem && selectedItem.kind === "event" ? (
          <TracePanel
            selectedEvent={selectedItem.event}
            session={view}
            onClearFocus={() => setSelectedEventId(view.events[0]?.id ?? "")}
          />
        ) : selectedItem && selectedItem.kind === "event" ? (
          <EventInspector
            selectedEvent={selectedItem.event}
            session={view}
            model={model}
            onTrace={() => setCurrentView("flow")}
          />
        ) : null}
      </div>
    </>
  );
}
