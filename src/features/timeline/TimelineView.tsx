import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { TopSessionBar } from "../../components/layout/TopSessionBar";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { buildTimelineRenderModel, getActiveLanes } from "../../lib/timeline/timelineViewModel";
import { EventInspector } from "./EventInspector";
import { TimelineBundleInspector } from "./TimelineBundleInspector";
import { TimelineCanvas, LANE_LABEL_WIDTH, DEFAULT_FRAME_WIDTH } from "./TimelineCanvas";
import { TimelineEmptyState } from "./TimelineEmptyState";
import { TimelineToolbar } from "./TimelineHeader";
import { TimelineMiniMap } from "./TimelineMiniMap";
import { FlowFocusHeader } from "../flow-focus/FlowFocusHeader";
import { TracePanel } from "../flow-focus/TracePanel";

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
  // The inspector collapse only applies to Timeline mode — Flow Focus keeps
  // its Trace panel, and the toggle is not shown in Flow mode.
  const inspectorHidden = inspectorCollapsed && mode === "timeline";

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
            />
          )}
          <TimelineCanvas
            model={renderModel}
            relationships={view.relationships}
            density={density}
            onFrameWidth={handleFrameWidth}
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
            />
          ) : null}
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
