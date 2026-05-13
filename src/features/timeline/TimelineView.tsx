import { useEffect } from "react";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { TopSessionBar } from "../../components/layout/TopSessionBar";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { getFocusedEntitySet } from "../../lib/relationships/traversal";
import { getTimelineRange } from "../../lib/timeline/layout";
import { computeAxisTicks } from "../../lib/timeline/timeScale";
import { EventInspector } from "./EventInspector";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineEmptyState, type TimelineEmptyVariant } from "./TimelineEmptyState";
import { TimelineToolbar } from "./TimelineHeader";
import { TimelineMiniMap } from "./TimelineMiniMap";
import { FlowFocusHeader } from "../flow-focus/FlowFocusHeader";
import { TracePanel } from "../flow-focus/TracePanel";

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
  const density = useMoriAppStore((state) => state.timelineDensity);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const setHoveredEventId = useMoriAppStore((state) => state.setHoveredEventId);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const toggleFilter = useMoriAppStore((state) => state.toggleFilter);
  const clearFilters = useMoriAppStore((state) => state.clearFilters);
  const toggleDensity = useMoriAppStore((state) => state.toggleTimelineDensity);

  const emptyVariant = chooseEmptyVariant({
    mode: sessionMode,
    eventCount: view.events.length,
    importCount: imports.length,
    hasAnalysis,
  });

  if (emptyVariant) {
    return (
      <>
        <TopSessionBar />
        <SessionModeBanner />
        <TimelineEmptyState
          variant={emptyVariant}
          onOpenSources={() => setCurrentView("sources")}
          onRunQuickPass={() => runQuickPass()}
          canRunQuickPass={analysisStatus !== "running"}
        />
      </>
    );
  }

  const range = getTimelineRange(view.events, {
    start: view.session.startedAt,
    end: view.session.endedAt,
  });

  const visibleEvents = activeFilters.length
    ? view.events.filter((event) => activeFilters.includes(event.type))
    : view.events;
  const fallbackEvent = view.events[0];
  const selectedEvent =
    view.events.find((event) => event.id === selectedEventId) ?? fallbackEvent;
  const focusedEntityId = hoveredEventId ?? selectedEvent.id;
  const focusedSet = getFocusedEntitySet(
    focusedEntityId,
    view.relationships,
    mode === "flow" ? 2 : 1,
  );
  const ticks = computeAxisTicks(range, { maxTicks: 6 });

  return (
    <>
      <TopSessionBar />
      <SessionModeBanner />
      <div className={`content-grid ${mode === "flow" ? "flow-grid" : ""}`}>
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
              onToggleDensity={toggleDensity}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={clearFilters}
            />
          )}
          <TimelineCanvas
            events={visibleEvents}
            relationships={view.relationships}
            range={range}
            selectedEventId={selectedEvent.id}
            focusedSet={focusedSet}
            mode={mode}
            density={density}
            onSelect={setSelectedEventId}
            onHover={setHoveredEventId}
          />
          {mode === "timeline" ? (
            <TimelineMiniMap
              events={visibleEvents}
              range={range}
              ticks={ticks}
              selectedEventId={selectedEvent.id}
              focusedSet={focusedSet}
            />
          ) : null}
        </section>
        {mode === "flow" ? (
          <TracePanel
            selectedEvent={selectedEvent}
            session={view}
            onClearFocus={() => setSelectedEventId(view.events[0]?.id ?? "")}
          />
        ) : (
          <EventInspector
            selectedEvent={selectedEvent}
            session={view}
            onTrace={() => setCurrentView("flow")}
          />
        )}
      </div>
    </>
  );
}

function chooseEmptyVariant({
  mode,
  eventCount,
  importCount,
  hasAnalysis,
}: {
  mode: "demo" | "draft";
  eventCount: number;
  importCount: number;
  hasAnalysis: boolean;
}): TimelineEmptyVariant | null {
  if (eventCount > 0) return null;
  if (mode === "demo") return "demo-empty";
  if (importCount === 0) return "draft-no-imports";
  if (!hasAnalysis) return "draft-needs-quick-pass";
  return null;
}
