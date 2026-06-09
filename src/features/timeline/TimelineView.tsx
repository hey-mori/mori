import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCopy, FileText, PlusCircle, Search } from "lucide-react";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import {
  buildTimelineRenderModel,
  shouldHideInspector,
} from "../../lib/timeline/timelineViewModel";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { selectAcrossLane, selectInLane } from "../../lib/timeline/keyboardNavigation";
import {
  getTimelineLaneForEvent,
  resolveTimelineLaneOrder,
  type ActivityLaneId,
} from "../../lib/timeline/activityModel";
import type { TimelineEvent } from "../../domain/types";
import type { BaseMenuItemSpec } from "../../components/ui/BaseActionMenu";
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
import { TimelineEmptyState, TimelineNoResultsState } from "./TimelineEmptyState";
import { TimelineToolbar } from "./TimelineHeader";
import { TimelineMiniMap } from "./TimelineMiniMap";
import { FlowFocusHeader } from "../flow-focus/FlowFocusHeader";
import { TracePanel } from "../flow-focus/TracePanel";
import { CausalMapView } from "../timeline-lab/CausalMapView";
import { AiWorkflowView } from "./AiWorkflowView";
import type { WorkPhase } from "../../lib/session/workArc";
import type { TimelineReadingMode } from "./TimelineHeader";

const FILTERED_EMPTY_SETTLE_MS = 260;

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
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const sessionMode = useSessionStore(selectSessionMode);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const imports = useSessionStore((state) => state.imports);
  const runQuickPass = useSessionStore((state) => state.runQuickPass);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const analysis = useSessionStore((state) => state.analysis);
  const createIssueFromEvent = useSessionStore((state) => state.createIssueFromEvent);
  const updateSessionEvent = useSessionStore((state) => state.updateSessionEvent);
  const splitSessionEvent = useSessionStore((state) => state.splitSessionEvent);
  const mergeSessionEvent = useSessionStore((state) => state.mergeSessionEvent);
  const addEventRelationship = useSessionStore((state) => state.addEventRelationship);
  const removeRelationship = useSessionStore((state) => state.removeRelationship);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const selectedEventId = useAppStore((state) => state.selectedEventId);
  const hoveredEventId = useAppStore((state) => state.hoveredEventId);
  const activeFilters = useAppStore((state) => state.activeFilters);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSelectedEventId = useAppStore((state) => state.setSelectedEventId);
  const setHoveredEventId = useAppStore((state) => state.setHoveredEventId);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const openReviewItem = useAppStore((state) => state.openReviewItem);
  const toggleFilter = useAppStore((state) => state.toggleFilter);
  const clearFilters = useAppStore((state) => state.clearFilters);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const inspectorCollapsed = useAppStore((state) => state.inspectorCollapsed);
  const setInspectorCollapsed = useAppStore((state) => state.setInspectorCollapsed);
  const setSessionTab = useAppStore((state) => state.setSessionTab);

  // Selecting an item opens the inspector; clicking the same item again clears
  // the selection and folds the inspector away.
  const selectAndShowInspector = useCallback(
    (id: string) => {
      if (selectedEventId === id && !inspectorCollapsed) {
        setSelectedEventId("");
        setHoveredEventId(null);
        setInspectorCollapsed(true);
        return;
      }
      setSelectedEventId(id);
      setInspectorCollapsed(false);
    },
    [inspectorCollapsed, selectedEventId, setHoveredEventId, setSelectedEventId, setInspectorCollapsed],
  );

  const closeInspector = useCallback(() => {
    setSelectedEventId("");
    setHoveredEventId(null);
    setInspectorCollapsed(true);
  }, [setHoveredEventId, setSelectedEventId, setInspectorCollapsed]);

  // The Timeline ↔ Flow Focus switch is internal state seeded from the prop;
  // there is no separate flow route — both modes live inside the 흐름 tab.
  const [mode, setMode] = useState<"timeline" | "flow">(modeProp);
  const goToMode = useCallback((next: "timeline" | "flow") => setMode(next), []);

  // Density is fixed — the timeline reads at one calm scale; there is no
  // user-facing density control.
  const density: TimelineDensity = "compact";

  // Only the lanes this session's events actually populate, in canonical order.
  // Empty lanes are dropped so the swimlane is not padded with blank rows; the
  // full taxonomy still lives in the category filter.
  const laneOrder = useMemo(
    () => resolveTimelineLaneOrder(view.events, view.sources),
    [view.events, view.sources],
  );

  const [frameWidth, setFrameWidth] = useState<number>(DEFAULT_FRAME_WIDTH);
  const [minimapViewport, setMinimapViewport] = useState<MinimapViewport>(
    FULL_MINIMAP_VIEWPORT,
  );
  // Time-axis zoom. 1 = the whole span fits; >1 widens the layout frame so
  // the canvas scrolls horizontally. Driven by the minimap brush handles.
  const [zoomFactor, setZoomFactor] = useState<number>(1);
  const canvasRef = useRef<TimelineCanvasHandle>(null);

  // The tab opens on the 흐름 (AI work-flow) view by default — the AI's reading
  // of how the work progressed. 타임라인 / 원본 / 연결 are the other views; an
  // unanalyzed session shows the 흐름 view's "분석 실행" prompt.
  const [readingModeOverride, setReadingModeOverride] = useState<
    TimelineReadingMode | null
  >(null);
  const readingMode: TimelineReadingMode = readingModeOverride ?? "workflow";

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
        laneOrder,
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
      laneOrder,
      sessionMode,
      imports.length,
      hasAnalysis,
    ],
  );
  const lastNonEmptyModelRef = useRef<typeof model | null>(null);
  const [filteredEmptySettled, setFilteredEmptySettled] = useState(false);

  useEffect(() => {
    if (!model.filteredEmpty && model.visibleDisplayItems.length > 0) {
      lastNonEmptyModelRef.current = model;
    }
  }, [model]);

  useEffect(() => {
    if (!model.filteredEmpty) {
      setFilteredEmptySettled(false);
      return;
    }
    if (!searchQuery.trim()) {
      setFilteredEmptySettled(true);
      return;
    }
    setFilteredEmptySettled(false);
    const timer = window.setTimeout(
      () => setFilteredEmptySettled(true),
      FILTERED_EMPTY_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [model.filteredEmpty, searchQuery]);

  const renderModel =
    model.filteredEmpty && !filteredEmptySettled
      ? lastNonEmptyModelRef.current ?? model
      : model;
  const showNoResults =
    mode === "timeline" && model.filteredEmpty && filteredEmptySettled;

  // Per-lane event counts for the toolbar's category filter. Derived from ALL
  // events (not the filtered model), so the popover keeps listing every
  // category with its true count even while the filter shows only some lanes.
  const laneCounts = useMemo<Partial<Record<ActivityLaneId, number>>>(() => {
    const counts: Partial<Record<ActivityLaneId, number>> = {};
    const sources = new Map(view.sources.map((source) => [source.id, source]));
    for (const event of view.events) {
      const lane = getTimelineLaneForEvent({ event, sources });
      counts[lane] = (counts[lane] ?? 0) + 1;
    }
    return counts;
  }, [view.events, view.sources]);

  const handleFrameWidth = useCallback((width: number) => {
    setFrameWidth((current) => (current === width ? current : width));
  }, []);

  // Arrow-key navigation for the swimlane: ← → move within a lane by time,
  // ↑ ↓ jump to the nearest item in the adjacent non-empty lane. Defined
  // before the empty-state early return so hook order stays stable. Disabled
  // in Flow Focus, the list / connection views, and while
  // the user is typing in an input.
  useEffect(() => {
    const swimlaneActive = mode === "timeline" && readingMode === "swimlane";
    if (!swimlaneActive) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const items = renderModel.visibleDisplayItems;
      if (items.length === 0) return;
      const current = selectedEventId || null;
      let nextId: string | null = null;
      switch (event.key) {
        case "ArrowRight":
          nextId = selectInLane(items, current, "next");
          break;
        case "ArrowLeft":
          nextId = selectInLane(items, current, "prev");
          break;
        case "ArrowDown":
          nextId = selectAcrossLane(items, current, "down", laneOrder);
          break;
        case "ArrowUp":
          nextId = selectAcrossLane(items, current, "up", laneOrder);
          break;
        default:
          return;
      }
      if (nextId) {
        event.preventDefault();
        setSelectedEventId(nextId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, viewportWidth, readingMode, renderModel.visibleDisplayItems, selectedEventId, setSelectedEventId, laneOrder]);

  const buildEventMenuItems = useCallback(
    (event: TimelineEvent): BaseMenuItemSpec[] => {
      const issueCreated = analysis ? isEventPromotedToIssue(analysis, event.id) : false;
      const items: BaseMenuItemSpec[] = [
        {
          id: "open-details",
          label: "상세 열기",
          icon: Search,
          onSelect: () => setSelectedEventId(event.id),
        },
        {
          id: "copy-summary",
          label: "이벤트 내용 복사",
          icon: ClipboardCopy,
          onSelect: () =>
            copyText(`${event.title}\n\n${event.summary}\n\n${event.start}${event.end ? ` - ${event.end}` : ""}`),
        },
        {
          id: "copy-reference",
          label: "이벤트 참조 복사",
          icon: ClipboardCopy,
          onSelect: () => copyText(`mori:event:${event.id}`),
        },
      ];
      if (event.sourceRefs.length > 0) {
        items.push({
          id: "open-evidence",
          label: "관련 자료 열기",
          icon: FileText,
          onSelect: () => setSessionTab("evidence"),
        });
      }
      if (issueCreated) {
        items.push(
          { type: "separator", id: "review-separator" },
          {
            id: "open-issue",
            label: "생성된 이슈 열기",
            icon: PlusCircle,
            onSelect: () => openReviewItem({ kind: "issue", issueId: eventIssueId(event.id) }),
          },
        );
      } else if (sessionMode === "draft" && hasAnalysis) {
        items.push(
          { type: "separator", id: "review-separator" },
          {
            id: "create-issue",
            label: "이슈로 만들기",
            icon: PlusCircle,
            onSelect: () => {
              if (createIssueFromEvent(event)) {
                openReviewItem({ kind: "issue", issueId: eventIssueId(event.id) });
              }
            },
          },
        );
      }
      return items;
    },
    [
      analysis,
      createIssueFromEvent,
      hasAnalysis,
      openReviewItem,
      sessionMode,
      setSelectedEventId,
      setSessionTab,
    ],
  );

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

  const selectedItem = renderModel.selectedItem;
  const useStreamView = mode === "timeline" && readingMode === "stream";
  const useWorkflowView = mode === "timeline" && readingMode === "workflow";
  const useCausalView = mode === "timeline" && readingMode === "causal";
  const inspectorHidden = shouldHideInspector({ mode, inspectorCollapsed, viewportWidth });
  // The inspector is a detail panel for the *selected* item — there is nothing
  // to inspect with no selection, so the column is only reserved when something
  // is selected. Otherwise an "open" inspector with no selection is just an
  // empty band of whitespace. The full-width AI 흐름 / 연결 views reserve no
  // inspector band of their own.
  const inspectorVisible =
    !useCausalView && !useWorkflowView && !inspectorHidden && Boolean(selectedItem);

  // Drill from an AI 흐름 phase into the 원본 stream: select the first event at
  // or after the phase start and switch to the stream, which auto-highlights and
  // scrolls to it. Reuses the shared selection rail — no new global state.
  const selectPhaseInStream = useCallback(
    (phase: WorkPhase) => {
      const phaseStart = new Date(phase.startIso).getTime();
      const target = renderModel.visibleDisplayItems.find((item) => {
        const at = new Date(item.start).getTime();
        return Number.isFinite(at) && at >= phaseStart;
      });
      if (target) setSelectedEventId(target.id);
      setReadingModeOverride("stream");
    },
    [renderModel.visibleDisplayItems, setSelectedEventId],
  );
  // The 흐름 tab offers two reading modes: the swimlane canvas (시간 축) and a
  // content-rich chronological 목록. The swimlane never auto-degrades to a list
  // on narrow screens; the 목록 appears only when the user picks it (or when a
  // conversation-dominant session defaults to it).
  return (
    <div
      className={`content-grid content-grid-embedded ${
        mode === "flow" ? "flow-grid" : ""
      } ${inspectorVisible ? "" : "inspector-collapsed"}`}
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
            laneCounts={laneCounts}
            onToggleFilter={toggleFilter}
            onClearFilters={clearFilters}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            readingMode={readingMode}
            onReadingModeChange={setReadingModeOverride}
          />
        )}
        {showNoResults ? (
          <TimelineNoResultsState
            onClear={() => {
              clearFilters();
              setSearchQuery("");
            }}
          />
        ) : useStreamView ? (
          <TimelineChronoList
            model={renderModel}
            selectedItemId={selectedItem?.id ?? null}
            onSelect={selectAndShowInspector}
            density={density}
            eventMenuItems={buildEventMenuItems}
          />
        ) : useWorkflowView ? (
          <AiWorkflowView
            view={view}
            analysis={analysis}
            selectedItemId={selectedItem?.id ?? null}
            onSelectPhase={selectPhaseInStream}
            onRunQuickPass={() => void runQuickPass()}
            canRunQuickPass={analysisStatus !== "running"}
          />
        ) : useCausalView ? (
          <div className="timeline-causal-mode timeline-lab">
            <CausalMapView view={view} title="연결 흐름" />
          </div>
        ) : (
          <>
            <TimelineCanvas
              ref={canvasRef}
              model={renderModel}
              relationships={view.relationships}
              density={density}
              onFrameWidth={handleFrameWidth}
              onViewportChange={setMinimapViewport}
              onSelect={selectAndShowInspector}
              onHover={setHoveredEventId}
              eventMenuItems={(item) => buildEventMenuItems(item.event)}
            />
            {mode === "timeline" ? (
              <TimelineMiniMap
                items={renderModel.visibleDisplayItems}
                range={renderModel.range}
                ticks={renderModel.ticks}
                selectedItemId={selectedItem?.id ?? null}
                focusedSet={renderModel.focusedSet}
                focusActive={renderModel.focusActive}
                viewport={minimapViewport}
                onSeek={(fraction) => canvasRef.current?.scrollToFraction(fraction)}
                onZoom={setZoomFactor}
              />
            ) : null}
          </>
        )}
      </section>
      {!inspectorVisible ? null : selectedItem && selectedItem.kind === "bundle" ? (
        <TimelineBundleInspector
          bundle={selectedItem}
          session={view}
          onTrace={() => goToMode("flow")}
          onClose={closeInspector}
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
          onClose={closeInspector}
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

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      void navigator.clipboard.writeText(text).catch(() => {});
    } catch {
      // Clipboard access is permission-gated in some browser shells.
    }
  }
}
