import { Link, PlusCircle, Sparkles, StickyNote } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriPlannedAction } from "../../components/ui/MoriPlannedAction";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { InlineEditForm } from "../review/InlineEditForm";
import type { MoriMockSession, TimelineEvent } from "../../domain/types";
import type { TimelineEventEdits } from "../../lib/timeline/eventEdits";
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
  canWrite = false,
  issueCreated = false,
  onCreateIssue,
  onEditEvent,
}: {
  selectedEvent: TimelineEvent;
  session: MoriMockSession;
  onClearFocus?: () => void;
  /** True when the active session can persist Timeline writes (real draft). */
  canWrite?: boolean;
  /** True once this event already has a derived issue. */
  issueCreated?: boolean;
  /** Promote this event to a Review issue. Absent ⇒ control hidden. */
  onCreateIssue?: () => void;
  /** Correct this event / attach a note. Absent ⇒ control hidden. */
  onEditEvent?: (edits: TimelineEventEdits) => void;
}) {
  const graph = buildFocusGraph(selectedEvent.id, session.relationships);
  const [noteEditing, setNoteEditing] = useState(false);

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
        <SectionHeader title="메모" />
        {noteEditing && onEditEvent ? (
          <InlineEditForm
            fields={[
              {
                id: "note",
                label: "메모",
                value: selectedEvent.userNote ?? "",
                multiline: true,
              },
            ]}
            onSave={(values) => {
              onEditEvent({ note: values.note });
              setNoteEditing(false);
            }}
            onCancel={() => setNoteEditing(false)}
          />
        ) : (
          <>
            {selectedEvent.userNote ? (
              <div className="inspector-summary-card">
                <span>메모</span>
                <p>{selectedEvent.userNote}</p>
              </div>
            ) : (
              <p className="muted">메모가 없습니다.</p>
            )}
          </>
        )}
      </section>
      <section className="panel-section">
        <SectionHeader title="액션" />
        <div className="trace-actions">
          {onEditEvent ? (
            <Button
              icon={StickyNote}
              onClick={() => setNoteEditing(true)}
              disabled={!canWrite || noteEditing}
              title={
                canWrite
                  ? "이 이벤트에 메모를 작성합니다."
                  : "실제 세션에서 사용할 수 있습니다."
              }
            >
              {selectedEvent.userNote ? "메모 편집" : "메모 추가"}
            </Button>
          ) : null}
          {onCreateIssue ? (
            <Button
              icon={PlusCircle}
              onClick={onCreateIssue}
              disabled={!canWrite || issueCreated}
              title={
                issueCreated
                  ? "이 이벤트는 이미 이슈로 만들어졌습니다."
                  : canWrite
                    ? "이 이벤트를 Review 이슈로 만듭니다."
                    : "실제 세션에서 사용할 수 있습니다."
              }
            >
              {issueCreated ? "이슈 생성됨" : "이슈 생성"}
            </Button>
          ) : null}
        </div>
      </section>
      <section className="panel-section">
        <SectionHeader title="예정된 액션" hint="Planned" />
        <div className="trace-actions trace-actions-planned">
          <MoriPlannedAction
            icon={Link}
            label="관계 편집"
            title="관계 추가 / 삭제는 다음 마일스톤에서 제공됩니다."
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
