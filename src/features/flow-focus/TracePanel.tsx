import { Bell, Link, MessageSquare, Plus, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriPlannedAction } from "../../components/ui/MoriPlannedAction";
import { SectionHeader } from "../../components/ui/SectionHeader";
import type { MoriMockSession, TimelineEvent } from "../../domain/types";
import { buildFocusGraph } from "../../lib/relationships/focusGraph";
import {
  describeRelationshipConfidence,
  getRelationshipDisplay,
} from "../../lib/relationships/relationshipDisplay";
import { FocusPathSummary } from "./FocusPathSummary";
import { TraceRelationshipList } from "./TraceRelationshipList";

export function TracePanel({
  selectedEvent,
  session,
  onClearFocus,
}: {
  selectedEvent: TimelineEvent;
  session: MoriMockSession;
  onClearFocus?: () => void;
}) {
  const graph = buildFocusGraph(selectedEvent.id, session.relationships);

  return (
    <aside className="inspector trace">
      <SectionHeader
        title="흐름 추적"
        hint="이벤트에 마우스를 올리면 관련 흐름을 미리 봅니다. 클릭하면 포커스를 고정합니다."
      />
      <FocusPathSummary
        selectedEvent={selectedEvent}
        causeCount={graph.causes.length}
        resultCount={graph.results.length}
        onClearFocus={onClearFocus}
      />
      <TraceRelationshipList
        title={`원인 (${graph.causes.length})`}
        emptyHint="이 이벤트의 직접적인 원인은 추론되지 않았습니다."
        relationships={graph.causes}
        session={session}
        direction="upstream"
      />
      <TraceRelationshipList
        title={`결과 (${graph.results.length})`}
        emptyHint="이 이벤트에서 이어진 결과가 아직 없습니다."
        relationships={graph.results}
        session={session}
        direction="downstream"
      />
      <section className="panel-section">
        <SectionHeader title="연결된 모든 관계" hint="원인과 결과 방향의 링크를 모두 포함합니다." />
        {graph.causes.length + graph.results.length === 0 ? (
          <p className="muted">이 이벤트에는 추론된 관계가 없습니다.</p>
        ) : (
          <ul className="trace-stack">
            {[...graph.causes, ...graph.results].map((relationship) => {
              const display = getRelationshipDisplay(relationship.type);
              const confidence = describeRelationshipConfidence(relationship.confidence);
              return (
                <li key={`${relationship.id}-confidence`}>
                  <div>
                    <Badge tone={display.tone}>{display.label}</Badge>
                    <Badge tone={confidence.tone}>{confidence.label}</Badge>
                  </div>
                  {relationship.reason ? <small>{relationship.reason}</small> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="panel-section">
        <SectionHeader title="액션" hint="자리표시자입니다. 흐름 편집은 다음 마일스톤에서 제공됩니다." />
        <div className="trace-actions">
          <MoriPlannedAction
            icon={Link}
            label="링크 편집"
            title="관계 편집은 아직 구현되지 않았습니다."
          />
          <MoriPlannedAction
            icon={Plus}
            label="링크 추가"
            title="관계 추가는 아직 구현되지 않았습니다."
          />
          <MoriPlannedAction
            icon={MessageSquare}
            label="메모 추가"
            title="메모 기능은 예정되어 있습니다."
          />
          <MoriPlannedAction
            icon={Bell}
            label="이슈 생성"
            title="수동 이슈 생성은 예정되어 있습니다."
          />
          <MoriPlannedAction
            icon={Sparkles}
            label="재분석"
            title="Flow Focus에서의 재분석은 예정되어 있습니다."
          />
        </div>
      </section>
    </aside>
  );
}
