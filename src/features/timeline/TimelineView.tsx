import { Archive, Bell, FileText, Grid2X2, Info, Link, MessageSquare, Plus, Search, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { TopSessionBar } from "../../components/layout/TopSessionBar";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { eventTypeIcons, eventTypeLabels, eventTypeTone, laneOrder } from "../../domain/constants";
import type { EventType, MoriMockSession, Relationship, TimelineEvent } from "../../domain/types";
import { formatTime, formatTimeRange } from "../../lib/formatting/time";
import { getCauseRelationships, getFocusedEntitySet, getRelationshipsForEntity, getResultRelationships } from "../../lib/relationships/traversal";
import { groupEventsByLane, positionEvents, type PositionedEvent } from "../../lib/timeline/layout";
import { getTrustDisplay } from "../../lib/privacy/trust";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";

export function TimelineView({ mode }: { mode: "timeline" | "flow" }) {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const view = useMoriSessionStore(selectSessionView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const selectedEventId = useMoriAppStore((state) => state.selectedEventId);
  const hoveredEventId = useMoriAppStore((state) => state.hoveredEventId);
  const activeFilters = useMoriAppStore((state) => state.activeFilters);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const setHoveredEventId = useMoriAppStore((state) => state.setHoveredEventId);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const toggleFilter = useMoriAppStore((state) => state.toggleFilter);

  if (view.events.length === 0) {
    return (
      <>
        <TopSessionBar />
        <SessionModeBanner />
        <div className="timeline-empty">
          <Search size={24} />
          <h2>아직 타임라인에 표시할 이벤트가 없습니다</h2>
          <p>
            Sources / Evidence 화면에서 메모, URL, AI 대화를 가져오면 이벤트로 자동 변환되어 여기에 표시됩니다.
          </p>
          <Button variant="primary" icon={Plus} onClick={() => setCurrentView("sources")}>
            소스 가져오기
          </Button>
        </div>
      </>
    );
  }

  const timelineRange = {
    start: view.session.startedAt,
    end: view.session.endedAt,
  };

  const visibleEvents = activeFilters.length
    ? view.events.filter((event) => activeFilters.includes(event.type))
    : view.events;
  const fallbackEvent = view.events[0];
  const selectedEvent =
    view.events.find((event) => event.id === selectedEventId) ?? fallbackEvent;
  const focusedEntityId = hoveredEventId ?? selectedEvent.id;
  const focusedSet = getFocusedEntitySet(focusedEntityId, view.relationships, mode === "flow" ? 2 : 1);
  const positionedEvents = positionEvents(visibleEvents, laneOrder, timelineRange);

  return (
    <>
      <TopSessionBar />
      <SessionModeBanner />
      <div className={`content-grid ${mode === "flow" ? "flow-grid" : ""}`}>
        <section className="timeline-main">
          {mode === "flow" ? (
            <FlowHeader onShowTimeline={() => setCurrentView("timeline")} />
          ) : (
            <div className="timeline-controls">
              <Button>모든 카테고리</Button>
              <Button icon={Grid2X2} />
              <TimelineLegend activeFilters={activeFilters} onToggle={toggleFilter} />
            </div>
          )}
          <TimelineCanvas
            events={positionedEvents}
            selectedEventId={selectedEvent.id}
            focusedSet={focusedSet}
            relationships={view.relationships}
            mode={mode}
            onSelect={setSelectedEventId}
            onHover={setHoveredEventId}
          />
          <MiniMap events={positionedEvents} focusedEntityId={focusedEntityId} />
        </section>
        {mode === "flow" ? (
          <TracePanel selectedEvent={selectedEvent} session={view} />
        ) : (
          <EventInspector selectedEvent={selectedEvent} session={view} onTrace={() => setCurrentView("flow")} />
        )}
      </div>
    </>
  );
}

function FlowHeader({ onShowTimeline }: { onShowTimeline: () => void }) {
  return (
    <div className="flow-header">
      <div>
        <h2>
          Flow Focus / Trace View <Info size={16} />
        </h2>
        <p>이벤트에 마우스를 올리거나 클릭하여 관련 흐름을 집중해서 확인하세요.</p>
      </div>
      <div className="flow-actions">
        <span>관련 항목만 강조</span>
        <Toggle active label="Highlight related items" />
        <Button icon={Link} onClick={onShowTimeline}>
          전체 흐름 보기
        </Button>
      </div>
      <div className="trace-tabs">
        <Button variant="primary">자동 추적</Button>
        <Button>수동 연결</Button>
        <TimelineLegend activeFilters={[]} onToggle={() => undefined} />
      </div>
    </div>
  );
}

function TimelineLegend({ activeFilters, onToggle }: { activeFilters: EventType[]; onToggle: (eventType: EventType) => void }) {
  return (
    <div className="legend">
      {laneOrder.map((type) => (
        <button
          className={`legend-filter ${activeFilters.includes(type) ? "active" : ""}`}
          key={type}
          onClick={() => onToggle(type)}
          type="button"
        >
          <i className={`legend-dot ${eventTypeTone[type]}`} />
          {eventTypeLabels[type]}
        </button>
      ))}
    </div>
  );
}

function TimelineCanvas({
  events,
  selectedEventId,
  focusedSet,
  relationships,
  mode,
  onSelect,
  onHover,
}: {
  events: PositionedEvent[];
  selectedEventId: string;
  focusedSet: Set<string>;
  relationships: Relationship[];
  mode: "timeline" | "flow";
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
}) {
  const grouped = groupEventsByLane(events, laneOrder);
  const laneHeight = mode === "flow" ? 102 : 122;
  const cardWidth = mode === "flow" ? 184 : 198;
  const frameWidth = 1180;
  const frameHeight = 86 + laneOrder.length * laneHeight;

  if (!events.length) {
    return (
      <div className="timeline-empty">
        <Search size={24} />
        <h2>표시할 이벤트가 없습니다</h2>
        <p>필터를 조정하거나 새 소스를 추가해 타임라인을 다시 구성하세요.</p>
      </div>
    );
  }

  return (
    <div className={`timeline-frame ${mode === "flow" ? "compact" : ""}`}>
      <div className="time-axis">
        {["13:00", "14:00", "15:00", "16:00", "17:00", "18:00"].map((time) => (
          <span key={time} style={{ left: `${timeToAxisPercent(time)}%` }}>
            {time}
          </span>
        ))}
      </div>
      <div className="now-line" style={{ left: "32%" }}>
        <b>14:37</b>
      </div>
      <svg className="connection-layer" viewBox={`0 0 ${frameWidth} ${frameHeight}`} preserveAspectRatio="none">
        {relationships
          .filter((relationship) => isRenderableRelationship(relationship, events))
          .map((relationship) => {
            const from = events.find((event) => event.id === relationship.fromId);
            const to = events.find((event) => event.id === relationship.toId);
            if (!from || !to) return null;
            const active = focusedSet.has(from.id) && focusedSet.has(to.id);
            const x1 = (from.xPercent / 100) * frameWidth + cardWidth / 2;
            const y1 = 84 + from.laneIndex * laneHeight + 48;
            const x2 = (to.xPercent / 100) * frameWidth + cardWidth / 2;
            const y2 = 84 + to.laneIndex * laneHeight + 48;
            const mid = (x1 + x2) / 2;

            return (
              <path
                className={`connector ${active ? "active" : ""} ${eventTypeTone[from.type]}`}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                key={relationship.id}
              />
            );
          })}
      </svg>
      <div className="lanes">
        {laneOrder.map((type) => {
          const Icon = eventTypeIcons[type];
          const laneEvents = grouped[type] ?? [];
          return (
            <div className="lane" key={type} style={{ height: laneHeight }}>
              <div className="lane-label">
                <Icon size={18} />
                <strong>{eventTypeLabels[type]}</strong>
                <span>{laneEvents.length}</span>
              </div>
              {laneEvents.map((event) => (
                <TimelineEventCard
                  cardWidth={cardWidth}
                  event={event}
                  focused={focusedSet.has(event.id)}
                  key={event.id}
                  selected={event.id === selectedEventId}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineEventCard({
  event,
  selected,
  focused,
  cardWidth,
  onSelect,
  onHover,
}: {
  event: PositionedEvent;
  selected: boolean;
  focused: boolean;
  cardWidth: number;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
}) {
  const trust = getTrustDisplay(event.trustLevel);
  const Icon = eventTypeIcons[event.type];
  return (
    <button
      className={`event-card card-${eventTypeTone[event.type]} ${selected ? "selected" : ""} ${focused ? "" : "dimmed"}`}
      onClick={() => onSelect(event.id)}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      style={{ left: `${event.xPercent}%`, width: cardWidth }}
      type="button"
    >
      <span className="event-time">{formatTime(event.start)}</span>
      <strong>{event.title}</strong>
      <small>{event.summary}</small>
      <span className="event-meta">
        <Icon size={14} />
        <Badge tone={trust.tone}>{trust.label}</Badge>
        <span>{Math.round(event.confidence * 100)}%</span>
        {event.linkedIssueIds.length ? <em>{event.linkedIssueIds.length} 이슈</em> : null}
      </span>
    </button>
  );
}

function EventInspector({ selectedEvent, session, onTrace }: { selectedEvent: TimelineEvent; session: MoriMockSession; onTrace: () => void }) {
  const trust = getTrustDisplay(selectedEvent.trustLevel);
  const sources = session.sources.filter((source) => selectedEvent.sourceRefs.includes(source.id));
  const issues = session.issues.filter((issue) => selectedEvent.linkedIssueIds.includes(issue.id));
  const decisions = session.decisions.filter((decision) => selectedEvent.linkedDecisionIds.includes(decision.id));
  const artifacts = session.artifacts.filter((artifact) => selectedEvent.artifactIds?.includes(artifact.id));
  const nextActions = session.nextActions.filter((action) => action.relatedEventIds.includes(selectedEvent.id));

  return (
    <aside className="inspector">
      <div className="panel-title">
        <h2>이벤트 상세</h2>
      </div>
      <Badge tone={eventTypeTone[selectedEvent.type]}>{eventTypeLabels[selectedEvent.type]}</Badge>
      <h3>{selectedEvent.title}</h3>
      <p className="time-range">{formatTimeRange(selectedEvent.start, selectedEvent.end)}</p>
      <section className="panel-section">
        <h4>요약</h4>
        <p>{selectedEvent.summary}</p>
      </section>
      <section className="panel-section">
        <h4>신뢰도</h4>
        <div className="trust-box">
          <Badge tone={trust.tone}>{trust.label}</Badge>
          <span>{Math.round(selectedEvent.confidence * 100)}%</span>
          <p>{trust.description}</p>
        </div>
      </section>
      <section className="panel-section">
        <h4>근거 소스</h4>
        <div className="related-list">
          {sources.map((source) => (
            <button key={source.id} type="button">
              {source.title}
              <b>{source.trustLevel}</b>
            </button>
          ))}
        </div>
      </section>
      <section className="panel-section">
        <h4>연결된 항목</h4>
        <div className="related-list">
          <button type="button">관련 이슈 <b>{issues.length}</b></button>
          <button type="button">관련 결정 <b>{decisions.length}</b></button>
          <button type="button">관련 파일/산출물 <b>{artifacts.length}</b></button>
          <button type="button">다음 액션 <b>{nextActions.length}</b></button>
        </div>
      </section>
      <textarea placeholder="AI 요약이 틀렸거나 보완할 맥락이 있다면 메모를 남기세요." />
      <div className="trace-actions">
        <Button variant="primary" icon={Link} onClick={onTrace}>Trace 보기</Button>
        <Button icon={FileText}>이벤트 수정</Button>
        <Button icon={Archive}>분리/병합</Button>
        <Button icon={Bell}>이슈 만들기</Button>
      </div>
    </aside>
  );
}

function TracePanel({ selectedEvent, session }: { selectedEvent: TimelineEvent; session: MoriMockSession }) {
  const causes = getCauseRelationships(selectedEvent.id, session.relationships);
  const results = getResultRelationships(selectedEvent.id, session.relationships);
  const allRelationships = getRelationshipsForEntity(selectedEvent.id, session.relationships);

  return (
    <aside className="inspector trace">
      <div className="panel-title">
        <h2>흐름 트레이스</h2>
      </div>
      <span className="muted">선택한 이벤트</span>
      <div className="selected-summary">
        <Badge>{formatTime(selectedEvent.start)}</Badge>
        <Badge tone={eventTypeTone[selectedEvent.type]}>{eventTypeLabels[selectedEvent.type]}</Badge>
        <h3>{selectedEvent.title}</h3>
        <p>{selectedEvent.summary}</p>
      </div>
      <TraceSection title={`이 이벤트의 원인 (${causes.length})`} relationships={causes} session={session} reverse />
      <div className="trace-arrow">↓</div>
      <TraceSection title={`이 이벤트의 결과 (${results.length})`} relationships={results} session={session} />
      <section className="panel-section">
        <h4>관계 신뢰도</h4>
        <div className="trace-stack">
          {allRelationships.map((relationship) => (
            <div key={relationship.id}>
              <span>{Math.round(relationship.confidence * 100)}%</span>
              <strong>{relationship.type}</strong>
              <small>{relationship.reason}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="panel-section">
        <h4>작업</h4>
        <div className="trace-actions">
          <Button icon={Link}>연결 편집</Button>
          <Button icon={Plus}>새 연결</Button>
          <Button icon={Archive}>이벤트 분리</Button>
          <Button icon={MessageSquare}>메모 추가</Button>
          <Button icon={Bell}>이슈 만들기</Button>
          <Button icon={Sparkles}>AI 재분석</Button>
        </div>
      </section>
    </aside>
  );
}

function TraceSection({ title, relationships, session, reverse = false }: { title: string; relationships: Relationship[]; session: MoriMockSession; reverse?: boolean }) {
  return (
    <section className="panel-section">
      <h4>{title}</h4>
      <div className="trace-stack">
        {relationships.length ? (
          relationships.map((relationship) => {
            const eventId = reverse ? relationship.fromId : relationship.toId;
            const event = session.events.find((candidate) => candidate.id === eventId);
            return (
              <div key={relationship.id}>
                <span>{event ? formatTime(event.start) : "--:--"}</span>
                <strong>{event?.title ?? eventId}</strong>
                <small>{relationship.reason}</small>
              </div>
            );
          })
        ) : (
          <div>
            <span>-</span>
            <strong>직접 연결 없음</strong>
            <small>새 관계를 추가하거나 AI 재분석을 실행할 수 있습니다.</small>
          </div>
        )}
      </div>
    </section>
  );
}

function MiniMap({ events, focusedEntityId }: { events: PositionedEvent[]; focusedEntityId: string }) {
  return (
    <div className="mini-map">
      <span>13:00</span>
      <div className="mini-track">
        {events.map((event) => (
          <i
            className={`mini-dot ${eventTypeTone[event.type]} ${event.id === focusedEntityId ? "active" : ""}`}
            key={event.id}
            style={{ left: `${event.xPercent}%`, top: `${18 + (event.laneIndex % 4) * 10}px` }}
          />
        ))}
        <div className="mini-window" />
      </div>
      <span>18:00</span>
      <Button icon={Plus} />
    </div>
  );
}

function timeToAxisPercent(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  const axisStart = 13 * 60;
  const axisEnd = 18 * 60;
  const current = hour * 60 + minute;
  return ((current - axisStart) / (axisEnd - axisStart)) * 100;
}

function isRenderableRelationship(relationship: Relationship, events: TimelineEvent[]): boolean {
  return events.some((event) => event.id === relationship.fromId) && events.some((event) => event.id === relationship.toId);
}
