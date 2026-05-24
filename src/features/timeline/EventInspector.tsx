import {
  ClipboardCopy,
  Link as LinkIcon,
  Pencil,
  Split,
  Combine,
  PlusCircle,
  StickyNote,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { InlineEditForm } from "../review/InlineEditForm";
import type { TimelineEventEdits } from "../../lib/timeline/eventEdits";
import { canSplitEvent } from "../../lib/timeline/eventSplit";
import { findMergeTarget } from "../../lib/timeline/eventMerge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { eventTypeLabels, eventTypeTone } from "../../domain/constants";
import type {
  Artifact,
  Decision,
  Issue,
  MoriMockSession,
  NextAction,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import { formatTime, formatTimeRange } from "../../lib/formatting/time";
import { describeTrustLevel } from "../../lib/relationships/relationshipDisplay";
import { getSourceDisplayStatus } from "../../lib/sources/traceability";
import {
  getTimelineInspectorReviewLinks,
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";
import { buildInspectorViewModel } from "../../lib/timeline/timelineViewModel";

export function EventInspector({
  selectedEvent,
  session,
  onTrace,
  onOpenReviewItem,
  onCreateIssue,
  issueCreated = false,
  canWrite = false,
  onEditEvent,
  onSplitEvent,
  onMergeEvent,
}: {
  selectedEvent: TimelineEvent;
  session: MoriMockSession;
  onTrace: () => void;
  /** Deep-link a linked issue / decision / next action into the Review surface. */
  onOpenReviewItem?: (selection: ReviewSelection) => void;
  /** Promote this event to a Review issue. Absent ⇒ control hidden. */
  onCreateIssue?: () => void;
  /** True once this event already has a derived issue. */
  issueCreated?: boolean;
  /** True when the active session can persist Timeline writes (real draft). */
  canWrite?: boolean;
  /** Correct this event's title / summary. Absent ⇒ control hidden. */
  onEditEvent?: (edits: TimelineEventEdits) => void;
  /** Split this event at its temporal midpoint. Absent ⇒ control hidden. */
  onSplitEvent?: () => void;
  /** Merge this event with its next neighbour. Absent ⇒ control hidden. */
  onMergeEvent?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const mergeTarget = findMergeTarget(session.events, selectedEvent.id);
  const inspector = buildInspectorViewModel({
    event: selectedEvent,
    view: session,
  });
  const trust = describeTrustLevel(selectedEvent.trustLevel);

  function handleCopy() {
    const text = `${formatTimeRange(selectedEvent.start, selectedEvent.end)}\n${selectedEvent.title}\n\n${selectedEvent.summary}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }

  return (
    <aside className="inspector" aria-label="Event inspector">
      <header className="inspector-header">
        <div className="inspector-badges">
          <Badge tone={eventTypeTone[selectedEvent.type]}>{eventTypeLabels[selectedEvent.type]}</Badge>
          {selectedEvent.userModified ? <Badge tone="orange">사용자 수정</Badge> : null}
        </div>
        {editing ? null : (
          <h3 className="inspector-title">{selectedEvent.title}</h3>
        )}
        <p className="inspector-time">{formatTimeRange(selectedEvent.start, selectedEvent.end)}</p>
        <InspectorMetaStrip event={selectedEvent} />
      </header>

      <section className="inspector-section">
        {editing && onEditEvent ? (
          <InlineEditForm
            fields={[
              { id: "title", label: "제목", value: selectedEvent.title, required: true },
              { id: "summary", label: "요약", value: selectedEvent.summary, multiline: true },
            ]}
            onSave={(values) => {
              onEditEvent({ title: values.title, summary: values.summary });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="inspector-summary-card">
            <span>요약</span>
            <p>{selectedEvent.summary}</p>
          </div>
        )}
      </section>

      <section className="inspector-section">
        <SectionHeader
          title="근거 / 신뢰도"
          hint={`${inspector.sources.length}개 출처`}
        />
        <div className="inspector-trust-card">
          <strong>{trust.label}</strong>
          <span>{trustCopy(selectedEvent.trustLevel)}</span>
          <small>
            작성 주체: {selectedEvent.createdBy}
            {selectedEvent.userModified ? " · 사용자 수정함" : ""}
          </small>
        </div>
        <SourcesList sources={inspector.sources} />
      </section>

      <section className="inspector-section">
        <SectionHeader
          title="연결된 항목"
          hint={inspector.hiddenRelationshipCount > 0 ? `+${inspector.hiddenRelationshipCount}개 숨김` : undefined}
        />
        <LinkedRows
          issues={inspector.issues}
          decisions={inspector.decisions}
          artifacts={inspector.artifacts}
          nextActions={inspector.nextActions}
          onOpenReviewItem={onOpenReviewItem}
        />
        {inspector.hiddenRelationshipCount > 0 ? (
          <p className="inspector-hidden-note">
            연결된 이벤트 {inspector.hiddenRelationshipCount}건이 현재 포커스
            범위 밖에 있습니다. <strong>흐름 추적</strong>을 열면 전체
            관계 그래프를 볼 수 있습니다.
          </p>
        ) : null}
      </section>

      {inspector.decisions.length > 0 ? (
        <section className="inspector-section">
          <SectionHeader title="영향" />
          <ul className="inspector-impact-list">
            {inspector.decisions
              .flatMap((decision) => decision.impact)
              .slice(0, 3)
              .map((impact) => (
                <li key={impact}>{impact}</li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="inspector-section">
        <SectionHeader title="액션" hint="구현됨" />
        <div className="inspector-actions-row">
          <Button variant="primary" icon={LinkIcon} onClick={onTrace}>
            흐름 추적
          </Button>
          <Button icon={ClipboardCopy} onClick={handleCopy}>
            요약 복사
          </Button>
        </div>
        {onEditEvent || onCreateIssue || onSplitEvent || onMergeEvent ? (
          <div className="inspector-actions-row">
            {onEditEvent ? (
              <Button
                icon={Pencil}
                onClick={() => setEditing(true)}
                disabled={!canWrite || editing}
                title={
                  canWrite
                    ? "이 이벤트의 제목과 요약을 수정합니다."
                    : "실제 세션에서 사용할 수 있습니다."
                }
              >
                이벤트 편집
              </Button>
            ) : null}
            {onSplitEvent ? (
              <Button
                icon={Split}
                onClick={onSplitEvent}
                disabled={!canWrite || !canSplitEvent(selectedEvent)}
                title={
                  !canSplitEvent(selectedEvent)
                    ? "끝 시각이 없는 이벤트는 분할할 수 없습니다."
                    : canWrite
                      ? "이 이벤트를 시간 중점에서 둘로 나눕니다."
                      : "실제 세션에서 사용할 수 있습니다."
                }
              >
                이벤트 분할
              </Button>
            ) : null}
            {onMergeEvent ? (
              <Button
                icon={Combine}
                onClick={onMergeEvent}
                disabled={!canWrite || !mergeTarget}
                title={
                  !mergeTarget
                    ? "다음 이벤트가 없어 병합할 수 없습니다."
                    : canWrite
                      ? `다음 이벤트 '${mergeTarget.title}'와 병합합니다.`
                      : "실제 세션에서 사용할 수 있습니다."
                }
              >
                이벤트 병합
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
        ) : null}
      </section>

      <section className="inspector-section">
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
              <p className="inspector-empty">메모가 없습니다.</p>
            )}
            {onEditEvent ? (
              <div className="inspector-actions-row">
                <Button
                  icon={StickyNote}
                  onClick={() => setNoteEditing(true)}
                  disabled={!canWrite}
                  title={
                    canWrite
                      ? "이 이벤트에 메모를 작성합니다."
                      : "실제 세션에서 사용할 수 있습니다."
                  }
                >
                  {selectedEvent.userNote ? "메모 편집" : "메모 추가"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </aside>
  );
}

function InspectorMetaStrip({ event }: { event: TimelineEvent }) {
  const items = [
    { label: "근거", value: event.sourceRefs.length },
    { label: "결정", value: event.linkedDecisionIds.length },
    { label: "이슈", value: event.linkedIssueIds.length },
    { label: "산출", value: event.artifactIds?.length ?? 0 },
  ];
  const usage = event.tokenUsage;
  return (
    <div className="inspector-meta-strip" aria-label="Event metadata">
      {items.map((item) => (
        <span key={item.label} className={item.value > 0 ? "has-value" : ""}>
          <strong>{item.value}</strong>
          {item.label}
        </span>
      ))}
      {usage ? (
        <span className="has-value" title={usage.model}>
          <strong>{formatTokenCount(usage.total)}</strong>
          토큰
        </span>
      ) : null}
    </div>
  );
}

function formatTokenCount(total: number): string {
  if (total < 1000) return String(total);
  return `${(total / 1000).toFixed(1)}k`;
}

function SourcesList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) {
    return <p className="inspector-empty">연결된 출처가 없습니다.</p>;
  }
  return (
    <ul className="inspector-source-list">
      {sources.map((source) => {
        const displayStatus = getSourceDisplayStatus(source);
        return (
          <li key={source.id}>
            <div>
              <strong>{source.title}</strong>
              <small>
                {displayStatus.integrationLabel} · {displayStatus.captureMethod} ·{" "}
                {displayStatus.rawDataLabel}
              </small>
            </div>
            <Badge tone={describeTrustLevel(source.trustLevel).tone}>
              {describeTrustLevel(source.trustLevel).label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** How many linked items to list per group before collapsing to "+N개 더". */
const LINKED_ITEMS_VISIBLE = 4;

function LinkedRows({
  issues,
  decisions,
  artifacts,
  nextActions,
  onOpenReviewItem,
}: {
  issues: Issue[];
  decisions: Decision[];
  artifacts: Artifact[];
  nextActions: NextAction[];
  onOpenReviewItem?: (selection: ReviewSelection) => void;
}) {
  // Each linked record carries its own Review target — a click deep-links to
  // that exact issue / decision / next action, not just the first of a group.
  // Artifacts have no Review home, so they render as plain context.
  const groups = getTimelineInspectorReviewLinks({ issues, decisions, nextActions, artifacts });
  return (
    <ul className="inspector-linked-rows">
      {groups.map((group) => {
        const visible = group.items.slice(0, LINKED_ITEMS_VISIBLE);
        const overflow = group.items.length - visible.length;
        return (
          <li key={group.kind} className="inspector-linked-group">
            <div className="inspector-linked-group-head">
              <Badge tone={group.tone}>{group.label}</Badge>
              <span className="inspector-linked-count">{group.items.length}</span>
            </div>
            {group.items.length === 0 ? (
              <span className="inspector-linked-empty">없음</span>
            ) : (
              <div className="inspector-linked-items">
                {visible.map((item) =>
                  item.selection && onOpenReviewItem ? (
                    <button
                      key={item.id}
                      type="button"
                      className="inspector-linked-item is-linkable"
                      onClick={() => onOpenReviewItem(item.selection as ReviewSelection)}
                      title="Review에서 이 항목 열기"
                    >
                      {item.title}
                    </button>
                  ) : (
                    <span key={item.id} className="inspector-linked-item" title={item.title}>
                      {item.title}
                    </span>
                  ),
                )}
                {overflow > 0 ? (
                  <span className="inspector-linked-more">+{overflow}개 더</span>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function trustCopy(trustLevel: TimelineEvent["trustLevel"]): string {
  if (trustLevel === "verified") return "캡처된 원본 근거로 뒷받침되는 이벤트입니다.";
  if (trustLevel === "observed") return "관찰된 작업 맥락에서 도출된 이벤트입니다.";
  return "분석이 추론한 이벤트로, 사용자가 언제든 수정할 수 있습니다.";
}

export { formatTime };
