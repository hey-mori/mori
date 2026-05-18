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
  shouldHideInspector,
  TIMELINE_INSPECTOR_NARROW_MAX_PX,
} from "../../lib/timeline/timelineViewModel";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { EventInspector } from "./EventInspector";
import { eventIssueId, isEventPromotedToIssue } from "../../lib/timeline/eventToIssue";
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
  const analysis = useMoriSessionStore((state) => state.analysis);
  const createIssueFromEvent = useMoriSessionStore((state) => state.createIssueFromEvent);
  const updateSessionEvent = useMoriSessionStore((state) => state.updateSessionEvent);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const selectedEventId = useMoriAppStore((state) => state.selectedEventId);
  const hoveredEventId = useMoriAppStore((state) => state.hoveredEventId);
  const activeFilters = useMoriAppStore((state) => state.activeFilters);
  const searchQuery = useMoriAppStore((state) => state.searchQuery);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const setHoveredEventId = useMoriAppStore((state) => state.setHoveredEventId);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);
  const toggleFilter = useMoriAppStore((state) => state.toggleFilter);
  const clearFilters = useMoriAppStore((state) => state.clearFilters);
  const inspectorCollapsed = useMoriAppStore((state) => state.inspectorCollapsed);
  const setInspectorCollapsed = useMoriAppStore((state) => state.setInspectorCollapsed);

  // Density is fixed to one comfortable tier — the user-facing density control
  // was removed. The internal `density` plumbing stays so card sizing and
  // bundle tuning keep a single, stable code path.
  const density: TimelineDensity = "comfortable";

  const [frameWidth, setFrameWidth] = useState<number>(DEFAULT_FRAME_WIDTH);
  const [minimapViewport, setMinimapViewport] = useState<MinimapViewport>(
    FULL_MINIMAP_VIEWPORT,
  );
  // Time-axis zoom. 1 = the whole span fits; >1 widens the layout frame so
  // the canvas scrolls horizontally. Driven by the minimap brush handles.
  const [zoomFactor, setZoomFactor] = useState<number>(1);
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
        frameWidth: Math.round(frameWidth * zoomFactor),
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
      zoomFactor,
      sessionMode,
      imports.length,
      hasAnalysis,
    ],
  );

  const handleFrameWidth = useCallback((width: number) => {
    setFrameWidth((current) => (current === width ? current : width));
  }, []);

  // Hooks must run unconditionally — keep this above the empty-variant
  // early return so the hook order never changes between renders.
  const { signals: companionSignals } = useCompanionSignals();

  if (model.emptyVariant) {
    return (
      <>
        <TopSessionBar />
        <SessionModeBanner />
        <TimelineEmptyState
          variant={model.emptyVariant}
          onStartSession={() => setCurrentView("start")}
          onOpenSources={() => setCurrentView("evidence")}
          onRunQuickPass={() => runQuickPass()}
          canRunQuickPass={analysisStatus !== "running"}
        />
      </>
    );
  }

  const selectedItem = model.selectedItem;
  // The inspector hides when the user collapses it or when the viewport is
  // too narrow for a side column. Flow Focus keeps its Trace panel.
  const inspectorNarrow = viewportWidth <= TIMELINE_INSPECTOR_NARROW_MAX_PX;
  const inspectorHidden = shouldHideInspector({ mode, inspectorCollapsed, viewportWidth });
  // Narrow widths swap the horizontally-scrolling swimlane canvas for a flat
  // vertical chronological list — readable without a wide frame.
  const useChronoList = inspectorNarrow && mode === "timeline";

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
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={clearFilters}
              inspectorCollapsed={inspectorCollapsed}
              onToggleInspector={() => setInspectorCollapsed(!inspectorCollapsed)}
              inspectorToggleDisabled={inspectorNarrow}
            />
          )}
          {useChronoList ? (
            <TimelineChronoList
              model={model}
              selectedItemId={selectedItem?.id ?? null}
              onSelect={setSelectedEventId}
            />
          ) : (
            <>
              <TimelineCanvas
                ref={canvasRef}
                model={model}
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
                  onZoom={setZoomFactor}
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
            key={selectedItem.event.id}
            selectedEvent={selectedItem.event}
            session={view}
            onTrace={() => setCurrentView("flow")}
            onOpenReviewItem={openReviewItem}
            canWrite={sessionMode === "draft" && hasAnalysis}
            onEditEvent={(edits) => updateSessionEvent(selectedItem.event.id, edits)}
            issueCreated={
              analysis
                ? isEventPromotedToIssue(analysis, selectedItem.event.id)
                : false
            }
            onCreateIssue={() => {
              const event = selectedItem.event;
              if (createIssueFromEvent(event)) {
                openReviewItem({ kind: "issue", issueId: eventIssueId(event.id) });
                setCurrentView("review");
              }
            }}
          />
        ) : null}
      </div>
    </>
  );
}
