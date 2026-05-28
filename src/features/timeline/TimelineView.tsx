import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCopy, FileText, PlusCircle, Search } from "lucide-react";
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
} from "../../lib/timeline/timelineViewModel";
import type { TimelineDensity } from "../../lib/timeline/collisionLayout";
import { selectAcrossLane, selectInLane } from "../../lib/timeline/keyboardNavigation";
import { resolveTimelineLaneOrder, type ActivityLaneId } from "../../lib/timeline/activityModel";
import type { TimelineEvent } from "../../domain/types";
import type { MoriMenuItemSpec } from "../../components/ui/MoriActionMenu";
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
import { ConversationFlowView } from "./ConversationFlowView";
import { isConversationSession } from "../../lib/timeline/conversationFlow";
import { TimelineEmptyState, TimelineNoResultsState } from "./TimelineEmptyState";
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

  // Selecting an item opens the inspector; clicking the same item again clears
  // the selection and folds the inspector away.
  const selectAndShowInspector = useCallback(
    (id: string) => {
      if (selectedEventId === id && !inspectorCollapsed) {
        setSelectedEventId("");
        setInspectorCollapsed(true);
        return;
      }
      setSelectedEventId(id);
      setInspectorCollapsed(false);
    },
    [inspectorCollapsed, selectedEventId, setSelectedEventId, setInspectorCollapsed],
  );

  // The Timeline ↔ Flow Focus switch is internal state seeded from the prop;
  // there is no separate flow route — both modes live inside the 흐름 tab.
  const [mode, setMode] = useState<"timeline" | "flow">(modeProp);
  const goToMode = useCallback((next: "timeline" | "flow") => setMode(next), []);

  // Density is fixed — the timeline reads at one calm scale; there is no
  // user-facing density control.
  const density: TimelineDensity = "compact";

  // The always-visible canonical lane set plus any extra lane the session's
  // events actually populate. Passed as the layout's lane order so the
  // swimlane structure is stable and complete (empty lanes show as slim bands).
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

  // Per-lane event counts for the toolbar's category filter (shown as a plain
  // number next to each category) — derived from the same lane model the
  // canvas renders, so the filter list and the swimlane never disagree.
  const laneCounts = useMemo<Partial<Record<ActivityLaneId, number>>>(() => {
    const counts: Partial<Record<ActivityLaneId, number>> = {};
    for (const lane of model.lanes) counts[lane.type] = lane.eventCount;
    return counts;
  }, [model.lanes]);

  const handleFrameWidth = useCallback((width: number) => {
    setFrameWidth((current) => (current === width ? current : width));
  }, []);

  // Arrow-key navigation for the swimlane: ← → move within a lane by time,
  // ↑ ↓ jump to the nearest item in the adjacent non-empty lane. Defined
  // before the empty-state early return so hook order stays stable. Disabled
  // in Flow Focus, the narrow chrono list, the conversation thread, and while
  // the user is typing in an input.
  useEffect(() => {
    const swimlaneActive = mode === "timeline" && readingMode !== "flow";
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
      const items = model.visibleDisplayItems;
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
  }, [mode, viewportWidth, readingMode, model.visibleDisplayItems, selectedEventId, setSelectedEventId, laneOrder]);

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
  const inspectorHidden = shouldHideInspector({ mode, inspectorCollapsed, viewportWidth });
  // The inspector is a detail panel for the *selected* item — there is nothing
  // to inspect with no selection, so the column is only reserved when something
  // is selected. Otherwise an "open" inspector with no selection is just an
  // empty band of whitespace.
  const inspectorVisible = !inspectorHidden && Boolean(selectedItem);
  // Timeline mode ALWAYS renders the swimlane canvas — it scrolls horizontally
  // on narrow screens and never auto-degrades to a flat list. The vertical 피드
  // view appears only when the user explicitly selects the 피드 reading mode.
  const useConversationFlow = mode === "timeline" && readingMode === "flow";
  const buildEventMenuItems = useCallback(
    (event: TimelineEvent): MoriMenuItemSpec[] => {
      const issueCreated = analysis ? isEventPromotedToIssue(analysis, event.id) : false;
      const items: MoriMenuItemSpec[] = [
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
          label: "관련 증거 열기",
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
        {mode === "timeline" && model.filteredEmpty ? (
          <TimelineNoResultsState
            onClear={() => {
              clearFilters();
              setSearchQuery("");
            }}
          />
        ) : useConversationFlow ? (
          <ConversationFlowView
            model={model}
            selectedItemId={selectedItem?.id ?? null}
            onSelect={selectAndShowInspector}
            density={density}
            eventMenuItems={buildEventMenuItems}
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
              onSelect={selectAndShowInspector}
              onHover={setHoveredEventId}
              eventMenuItems={(item) => buildEventMenuItems(item.event)}
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
      {!inspectorVisible ? null : selectedItem && selectedItem.kind === "bundle" ? (
        <TimelineBundleInspector
          bundle={selectedItem}
          session={view}
          onTrace={() => goToMode("flow")}
          onClose={() => setInspectorCollapsed(true)}
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
          onClose={() => setInspectorCollapsed(true)}
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
