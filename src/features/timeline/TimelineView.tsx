import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ConversationFlowView } from "./ConversationFlowView";
import { TimelineBasisCaption } from "./TimelineBasisCaption";
import {
  describeConversationContext,
  isConversationSession,
} from "../../lib/timeline/conversationFlow";
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
 *
 * Always rendered as the **흐름** tab inside the unified Session Detail
 * workspace — the Session Detail owns the shell + header, so this view renders
 * only its content and toggles Timeline ↔ Flow Focus through internal state
 * (no separate `flow` route, no double header).
 */
export function TimelineView({ mode: modeProp }: { mode: "timeline" | "flow" }) {
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
  const splitSessionEvent = useMoriSessionStore((state) => state.splitSessionEvent);
  const mergeSessionEvent = useMoriSessionStore((state) => state.mergeSessionEvent);
  const addEventRelationship = useMoriSessionStore((state) => state.addEventRelationship);
  const removeRelationship = useMoriSessionStore((state) => state.removeRelationship);

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
  const setSearchQuery = useMoriAppStore((state) => state.setSearchQuery);
  const inspectorCollapsed = useMoriAppStore((state) => state.inspectorCollapsed);
  const setInspectorCollapsed = useMoriAppStore((state) => state.setInspectorCollapsed);
  const setSessionTab = useMoriAppStore((state) => state.setSessionTab);

  // The Timeline ↔ Flow Focus switch is internal state seeded from the prop;
  // there is no separate flow route — both modes live inside the 흐름 tab.
  const [mode, setMode] = useState<"timeline" | "flow">(modeProp);
  const goToMode = useCallback((next: "timeline" | "flow") => setMode(next), []);

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

  // A single Claude conversation reads far better as a time-ordered thread
  // than as a one-lane swimlane, so the timeline offers two reading modes:
  // "swimlane" (the canvas) and "flow" (the conversation thread). For a
  // conversation-dominant session we default to flow; the user can still
  // switch to the swimlane. `null` means "follow the session default".
  const conversationSession = useMemo(
    () => isConversationSession(view.events),
    [view.events],
  );
  const [readingModeOverride, setReadingModeOverride] = useState<
    "swimlane" | "flow" | null
  >(null);
  const readingMode: "swimlane" | "flow" =
    readingModeOverride ?? (conversationSession ? "flow" : "swimlane");

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

  if (model.emptyVariant) {
    // Inside the session 흐름 tab the shell content is full-bleed, so wrap the
    // empty state in a padded pane for breathing room.
    return (
      <div className="session-tab-pane session-tab-flow-empty">
        <TimelineEmptyState
          variant={model.emptyVariant}
          onStartSession={() => setCurrentView("start")}
          onOpenSources={() => setSessionTab("evidence")}
          onRunQuickPass={() => runQuickPass()}
          canRunQuickPass={analysisStatus !== "running"}
        />
      </div>
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
  // At comfortable widths, a conversation session reads as a vertical thread
  // (the flow view) unless the user switched to the swimlane. The narrow
  // chrono list takes precedence — it is the readable narrow fallback.
  const useConversationFlow =
    !useChronoList && mode === "timeline" && readingMode === "flow";

  return (
    <div
      className={`content-grid content-grid-embedded ${
        mode === "flow" ? "flow-grid" : ""
      } ${inspectorHidden ? "inspector-collapsed" : ""}`}
    >
      <section className="timeline-main">
        {mode === "flow" ? (
          <FlowFocusHeader
            onShowTimeline={() => goToMode("timeline")}
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
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            readingMode={readingMode}
            onReadingModeChange={setReadingModeOverride}
          />
        )}
        {mode === "timeline" ? (
          <TimelineBasisCaption
            context={conversationSession ? describeConversationContext(view) : null}
            isConversation={conversationSession}
            start={model.range.start}
            end={model.range.end}
          />
        ) : null}
        {useChronoList ? (
          <TimelineChronoList
            model={model}
            selectedItemId={selectedItem?.id ?? null}
            onSelect={setSelectedEventId}
          />
        ) : useConversationFlow ? (
          <ConversationFlowView
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
          onTrace={() => goToMode("flow")}
        />
      ) : mode === "flow" && selectedItem && selectedItem.kind === "event" ? (
        <TracePanel
          key={selectedItem.event.id}
          selectedEvent={selectedItem.event}
          session={view}
          onClearFocus={() => setSelectedEventId(view.events[0]?.id ?? "")}
          canWrite={sessionMode === "draft" && hasAnalysis}
          issueCreated={
            analysis
              ? isEventPromotedToIssue(analysis, selectedItem.event.id)
              : false
          }
          onCreateIssue={() => {
            const event = selectedItem.event;
            if (createIssueFromEvent(event)) {
              // openReviewItem routes to the Insights surface (the session
              // 인사이트 tab when embedded) — no separate navigation needed.
              openReviewItem({ kind: "issue", issueId: eventIssueId(event.id) });
            }
          }}
          onEditEvent={(edits) => updateSessionEvent(selectedItem.event.id, edits)}
          onAddRelationship={(toId, type) =>
            addEventRelationship(selectedItem.event.id, toId, type)
          }
          onRemoveRelationship={(relationshipId) => removeRelationship(relationshipId)}
        />
      ) : selectedItem && selectedItem.kind === "event" ? (
        <EventInspector
          key={selectedItem.event.id}
          selectedEvent={selectedItem.event}
          session={view}
          onTrace={() => goToMode("flow")}
          onOpenReviewItem={openReviewItem}
          canWrite={sessionMode === "draft" && hasAnalysis}
          onEditEvent={(edits) => updateSessionEvent(selectedItem.event.id, edits)}
          onSplitEvent={() => splitSessionEvent(selectedItem.event.id)}
          onMergeEvent={() => mergeSessionEvent(selectedItem.event.id)}
          issueCreated={
            analysis
              ? isEventPromotedToIssue(analysis, selectedItem.event.id)
              : false
          }
          onCreateIssue={() => {
            const event = selectedItem.event;
            if (createIssueFromEvent(event)) {
              // openReviewItem routes to the Insights surface (the session
              // 인사이트 tab when embedded) — no separate navigation needed.
              openReviewItem({ kind: "issue", issueId: eventIssueId(event.id) });
            }
          }}
        />
      ) : null}
    </div>
  );
}
