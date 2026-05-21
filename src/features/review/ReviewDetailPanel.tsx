import { CalendarClock, CheckCircle2, Layers, ListPlus, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/ui/SectionHeader";
import {
  eventTypeLabels,
  issueStatusLabels,
  priorityLabels,
} from "../../domain/constants";
import type {
  Decision,
  Issue,
  IssueStatus,
  MoriMockSession,
  NextAction,
  Priority,
} from "../../domain/types";
import { formatDate, formatTime } from "../../lib/formatting/time";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
import {
  getDecisionEvidenceSources,
  getIssueEvidenceSources,
  getSourceDisplayStatus,
} from "../../lib/sources/traceability";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import {
  ISSUE_STATUS_ORDER,
  findEvents,
  issueStatusTone,
  priorityTone,
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];
import { getTrustDisplay, getTrustLabel } from "../../lib/evidence/trust";
import { InlineEditForm } from "./InlineEditForm";
import type {
  DecisionEditFields,
  IssueEditFields,
  NextActionEditFields,
} from "../../lib/session/reviewItemEdit";

export function ReviewDetailPanel({
  selection,
  view,
  onShowTimeline,
  onToggleNextActionComplete,
  onSetIssueStatus,
  onEditIssue,
  onPromoteIssueToNextAction,
  onSetDecisionConfirmed,
  onEditDecision,
  onEditNextAction,
  canEditReview,
}: {
  selection: ReviewSelection;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
  onToggleNextActionComplete: (nextActionId: string, completed: boolean) => void;
  onSetIssueStatus: (issueId: string, status: IssueStatus) => void;
  onEditIssue: (issueId: string, fields: IssueEditFields) => boolean;
  onPromoteIssueToNextAction: (issueId: string) => NextAction | null;
  onSetDecisionConfirmed: (decisionId: string, confirmed: boolean) => void;
  onEditDecision: (decisionId: string, fields: DecisionEditFields) => boolean;
  onEditNextAction: (nextActionId: string, fields: NextActionEditFields) => boolean;
  /** False in demo mode — Review writes cannot be persisted there. */
  canEditReview: boolean;
}) {
  if (selection.kind === "none") {
    return (
      <aside className="review-detail" aria-label="Review detail">
        <header className="review-detail-header">
          <Badge tone="gray">선택된 항목 없음</Badge>
          <h3>검토 상세</h3>
          <p>왼쪽 목록에서 이슈, 결정, 또는 다음 액션을 선택하면 출처, 신뢰도, 관련 이벤트가 여기 표시됩니다.</p>
        </header>
        <section className="review-detail-section">
          <SectionHeader title="이 화면에서 가능한 것" />
          <ul className="review-detail-bullets">
            <li>Quick Pass가 만든 이슈와 결정의 근거를 확인합니다.</li>
            <li>관련 Timeline 이벤트로 이동합니다.</li>
            <li>다음 액션 후보를 검토합니다.</li>
          </ul>
        </section>
      </aside>
    );
  }

  if (selection.kind === "issue") {
    const issue = view.issues.find((entry) => entry.id === selection.issueId);
    if (!issue) return <MissingItem label="이슈" />;
    return (
      <IssueDetail
        issue={issue}
        view={view}
        onShowTimeline={onShowTimeline}
        onSetStatus={onSetIssueStatus}
        onEditIssue={onEditIssue}
        onPromoteIssueToNextAction={onPromoteIssueToNextAction}
        canEditStatus={canEditReview}
      />
    );
  }

  if (selection.kind === "decision") {
    const decision = view.decisions.find((entry) => entry.id === selection.decisionId);
    if (!decision) return <MissingItem label="결정" />;
    return (
      <DecisionDetail
        decision={decision}
        view={view}
        onShowTimeline={onShowTimeline}
        onSetConfirmed={onSetDecisionConfirmed}
        onEditDecision={onEditDecision}
        canEditConfirm={canEditReview}
      />
    );
  }

  const nextAction = view.nextActions.find((entry) => entry.id === selection.nextActionId);
  if (!nextAction) return <MissingItem label="다음 액션" />;
  return (
    <NextActionDetail
      nextAction={nextAction}
      view={view}
      onShowTimeline={onShowTimeline}
      onToggleComplete={onToggleNextActionComplete}
      onEditNextAction={onEditNextAction}
      canEditCompletion={canEditReview}
    />
  );
}

function MissingItem({ label }: { label: string }) {
  return (
    <aside className="review-detail" aria-label="Review detail">
      <header className="review-detail-header">
        <Badge tone="gray">선택된 {label}을 찾을 수 없음</Badge>
        <p>이 세션에는 이 ID에 해당하는 {label}이 더 이상 없습니다.</p>
      </header>
    </aside>
  );
}

function IssueDetail({
  issue,
  view,
  onShowTimeline,
  onSetStatus,
  onEditIssue,
  onPromoteIssueToNextAction,
  canEditStatus,
}: {
  issue: Issue;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
  onSetStatus: (issueId: string, status: IssueStatus) => void;
  onEditIssue: (issueId: string, fields: IssueEditFields) => boolean;
  onPromoteIssueToNextAction: (issueId: string) => NextAction | null;
  canEditStatus: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const evidence = getIssueEvidenceSources(issue, view.events, view.sources);
  const relatedEvents = findEvents(view.events, issue.sourceEventIds);
  const relatedDecisions = view.decisions.filter((decision) =>
    issue.relatedDecisionIds.includes(decision.id),
  );
  const confidencePct = Math.round(issue.confidence * 100);
  const issueTrust = getTrustDisplay(issue.trustLevel);
  const canEditText = canEditStatus;
  const existingNextAction = view.nextActions.find((action) =>
    action.relatedIssueIds.includes(issue.id),
  );

  return (
    <aside className="review-detail" aria-label="Issue detail">
      <header className="review-detail-header">
        <div className="review-detail-badges">
          <Badge tone={issueStatusTone(issue.status)}>{issueStatusLabels[issue.status]}</Badge>
          <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
          <Badge tone={issueTrust.tone} title={issueTrust.description}>{issueTrust.label}</Badge>
          {issue.trustLevel === "inferred" ? (
            <Badge tone={confidenceTone(confidencePct)}>{confidencePct}%</Badge>
          ) : null}
          {issue.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : null}
        </div>
        {isEditing ? (
          <InlineEditForm
            fields={[
              { id: "title", label: "제목", value: issue.title, required: true },
              { id: "description", label: "설명", value: issue.description, multiline: true },
            ]}
            onSave={(values) => {
              if (onEditIssue(issue.id, values)) setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <h3>{issue.title}</h3>
            <p className="review-detail-detail">{issue.description}</p>
            {issue.editedByUser && issue.editedAt ? (
              <p className="review-detail-time">
                <CalendarClock size={11} aria-hidden="true" /> 마지막 수정 {formatDate(issue.editedAt)}
              </p>
            ) : null}
          </>
        )}
      </header>

      <section className="review-detail-section">
        <SectionHeader title="제안된 다음 액션" />
        <p className="review-detail-suggestion">
          <Sparkles size={12} aria-hidden="true" />
          <span>{issue.suggestedNextAction || "(제안된 액션 없음)"}</span>
        </p>
      </section>

      <section className="review-detail-section">
        <SectionHeader title="근거" hint={`출처 ${evidence.sourceCount}개 · 이벤트 ${evidence.eventCount}건`} />
        <EvidenceList view={view} sourceIds={evidence.sources.map((source) => source.id)} />
      </section>

      <section className="review-detail-section">
        <SectionHeader title="관련 Timeline 이벤트" hint={`${relatedEvents.length}건`} />
        <RelatedEventList events={relatedEvents} onShowTimeline={onShowTimeline} />
      </section>

      {relatedDecisions.length > 0 ? (
        <section className="review-detail-section">
          <SectionHeader title="관련 결정" hint={`${relatedDecisions.length}건`} />
          <ul className="review-detail-links">
            {relatedDecisions.map((decision) => (
              <li key={decision.id}>
                <Badge tone="green">결정</Badge>
                <span>{decision.title}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="review-detail-section">
        <SectionHeader
          title="상태"
          hint={
            canEditStatus
              ? "이슈 상태를 바꾸면 세션에 저장됩니다."
              : "데모 세션에서는 상태가 저장되지 않습니다."
          }
        />
        <SegmentedControl
          ariaLabel="이슈 상태"
          role="radiogroup"
          value={issue.status}
          onChange={(status) => onSetStatus(issue.id, status)}
          options={ISSUE_STATUS_ORDER.map((status) => ({
            id: status,
            label: issueStatusLabels[status],
            disabled: !canEditStatus,
            title: canEditStatus
              ? undefined
              : "데모 세션에서는 상태가 저장되지 않습니다.",
          }))}
        />
      </section>

      <section className="review-detail-section">
        <SectionHeader
          title="우선순위"
          hint={
            canEditStatus
              ? "우선순위를 바꾸면 세션에 저장됩니다."
              : "데모 세션에서는 변경이 저장되지 않습니다."
          }
        />
        <SegmentedControl
          ariaLabel="이슈 우선순위"
          role="radiogroup"
          value={issue.priority}
          onChange={(priority) => onEditIssue(issue.id, { priority })}
          options={PRIORITY_ORDER.map((p) => ({
            id: p,
            label: priorityLabels[p],
            disabled: !canEditStatus,
            title: canEditStatus ? undefined : "데모 세션에서는 저장되지 않습니다.",
          }))}
        />
      </section>

      <section className="review-detail-section">
        <SectionHeader title="액션" />
        <div className="review-detail-actions">
          <Button
            variant="secondary"
            icon={Pencil}
            disabled={!canEditText || isEditing}
            title={
              canEditText
                ? "이슈 제목과 설명을 사용자 수정으로 저장합니다."
                : "데모 또는 읽기 전용 세션에서는 편집을 저장할 수 없습니다."
            }
            onClick={() => setIsEditing(true)}
          >
            편집
          </Button>
          <Button
            variant={existingNextAction ? "ghost" : "secondary"}
            icon={ListPlus}
            disabled={!canEditStatus}
            title={
              canEditStatus
                ? existingNextAction
                  ? "이미 이 이슈와 연결된 다음 액션이 있습니다."
                  : "이 이슈를 연결된 다음 액션으로 추가합니다."
                : "데모 또는 읽기 전용 세션에서는 다음 액션으로 승격할 수 없습니다."
            }
            onClick={() => onPromoteIssueToNextAction(issue.id)}
          >
            {existingNextAction ? "액션 보기" : "액션으로 승격"}
          </Button>
        </div>
        {!canEditText ? (
          <p className="review-detail-empty">
            데모 또는 읽기 전용 세션에서는 편집을 저장할 수 없습니다.
          </p>
        ) : null}
      </section>
    </aside>
  );
}

function DecisionDetail({
  decision,
  view,
  onShowTimeline,
  onSetConfirmed,
  onEditDecision,
  canEditConfirm,
}: {
  decision: Decision;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
  onSetConfirmed: (decisionId: string, confirmed: boolean) => void;
  onEditDecision: (decisionId: string, fields: DecisionEditFields) => boolean;
  canEditConfirm: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const evidence = getDecisionEvidenceSources(decision, view.events, view.sources);
  const relatedEvents = findEvents(view.events, decision.sourceEventIds);
  const relatedIssues = view.issues.filter((issue) =>
    decision.relatedIssueIds.includes(issue.id),
  );
  const decisionTrust = getTrustDisplay(decision.trustLevel);
  const canEditText = canEditConfirm;

  return (
    <aside className="review-detail" aria-label="Decision detail">
      <header className="review-detail-header">
        <div className="review-detail-badges">
          <Badge tone={decision.confirmed ? "green" : "orange"}>
            {decision.confirmed ? "확정됨" : "미확정"}
          </Badge>
          <Badge tone={priorityTone(decision.importance)}>{priorityLabels[decision.importance]}</Badge>
          <Badge tone={decisionTrust.tone} title={decisionTrust.description}>
            {decisionTrust.label}
          </Badge>
          {decision.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : null}
        </div>
        {isEditing ? (
          <InlineEditForm
            fields={[
              { id: "title", label: "제목", value: decision.title, required: true },
              { id: "decision", label: "결정 내용", value: decision.decision, multiline: true },
              { id: "rationale", label: "이유", value: decision.rationale, multiline: true },
            ]}
            onSave={(values) => {
              if (onEditDecision(decision.id, values)) setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <h3>{decision.title}</h3>
            <p className="review-detail-detail">{decision.decision}</p>
            <p className="review-detail-time">
              <CalendarClock size={11} aria-hidden="true" /> {formatTime(decision.createdAt)}
            </p>
            {decision.editedByUser && decision.editedAt ? (
              <p className="review-detail-time">
                <CalendarClock size={11} aria-hidden="true" /> 마지막 수정 {formatDate(decision.editedAt)}
              </p>
            ) : null}
          </>
        )}
      </header>

      {!isEditing ? (
        <section className="review-detail-section">
          <SectionHeader title="이유" />
          <p className="review-detail-rationale">{decision.rationale || "(이유 기록 없음)"}</p>
        </section>
      ) : null}

      {decision.rejectedOptions.length > 0 ? (
        <section className="review-detail-section">
          <SectionHeader title="폐기한 대안" hint={`${decision.rejectedOptions.length}건`} />
          <ul className="review-detail-bullets">
            {decision.rejectedOptions.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {decision.impact.length > 0 ? (
        <section className="review-detail-section">
          <SectionHeader title="영향" />
          <ul className="review-detail-bullets">
            {decision.impact.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="review-detail-section">
        <SectionHeader title="근거" hint={`출처 ${evidence.sourceCount}개 · 이벤트 ${evidence.eventCount}건`} />
        <EvidenceList view={view} sourceIds={evidence.sources.map((source) => source.id)} />
      </section>

      <section className="review-detail-section">
        <SectionHeader title="관련 Timeline 이벤트" hint={`${relatedEvents.length}건`} />
        <RelatedEventList events={relatedEvents} onShowTimeline={onShowTimeline} />
      </section>

      {relatedIssues.length > 0 ? (
        <section className="review-detail-section">
          <SectionHeader title="관련 이슈" hint={`${relatedIssues.length}건`} />
          <ul className="review-detail-links">
            {relatedIssues.map((issue) => (
              <li key={issue.id}>
                <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
                <span>{issue.title}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="review-detail-section">
        <SectionHeader
          title="중요도"
          hint={
            canEditConfirm
              ? "중요도를 바꾸면 세션에 저장됩니다."
              : "데모 세션에서는 변경이 저장되지 않습니다."
          }
        />
        <SegmentedControl
          ariaLabel="결정 중요도"
          role="radiogroup"
          value={decision.importance}
          onChange={(importance) => onEditDecision(decision.id, { importance })}
          options={PRIORITY_ORDER.map((p) => ({
            id: p,
            label: priorityLabels[p],
            disabled: !canEditConfirm,
            title: canEditConfirm ? undefined : "데모 세션에서는 저장되지 않습니다.",
          }))}
        />
      </section>

      <section className="review-detail-section">
        <SectionHeader
          title="액션"
          hint={
            canEditConfirm
              ? decision.confirmed
                ? "확정된 결정입니다. 다시 검토가 필요하면 반려할 수 있습니다."
                : "검토를 마쳤다면 이 결정을 확정 처리하세요."
              : "데모 세션에서는 확정 상태가 저장되지 않습니다."
          }
        />
        <div className="review-detail-actions">
          <Button
            variant={decision.confirmed ? "ghost" : "primary"}
            disabled={!canEditConfirm}
            title={
              canEditConfirm
                ? undefined
                : "데모 세션에서는 확정 상태가 저장되지 않습니다."
            }
            onClick={() => onSetConfirmed(decision.id, !decision.confirmed)}
          >
            {decision.confirmed ? "확정 반려" : "확정 처리"}
          </Button>
          <Button
            variant="secondary"
            icon={Pencil}
            disabled={!canEditText || isEditing}
            title={
              canEditText
                ? "결정 제목, 내용, 이유를 사용자 수정으로 저장합니다."
                : "데모 또는 읽기 전용 세션에서는 편집을 저장할 수 없습니다."
            }
            onClick={() => setIsEditing(true)}
          >
            편집
          </Button>
        </div>
        {!canEditText ? (
          <p className="review-detail-empty">
            데모 또는 읽기 전용 세션에서는 편집을 저장할 수 없습니다.
          </p>
        ) : null}
      </section>
    </aside>
  );
}

function NextActionDetail({
  nextAction,
  view,
  onShowTimeline,
  onToggleComplete,
  onEditNextAction,
  canEditCompletion,
}: {
  nextAction: NextAction;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
  onToggleComplete: (nextActionId: string, completed: boolean) => void;
  onEditNextAction: (nextActionId: string, fields: NextActionEditFields) => boolean;
  canEditCompletion: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const relatedIssues = view.issues.filter((issue) =>
    nextAction.relatedIssueIds.includes(issue.id),
  );
  const relatedEvents = view.events.filter((event) => nextAction.relatedEventIds.includes(event.id));
  const completed = isNextActionCompleted(nextAction);
  const canEditText = canEditCompletion;

  return (
    <aside className="review-detail" aria-label="Next action detail">
      <header className="review-detail-header">
        <div className="review-detail-badges">
          <Badge tone={priorityTone(nextAction.priority)}>{priorityLabels[nextAction.priority]}</Badge>
          <Badge tone="purple">다음 액션</Badge>
          {completed ? <Badge tone="green">완료됨</Badge> : null}
          {nextAction.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : null}
        </div>
        {isEditing ? (
          <InlineEditForm
            fields={[
              { id: "title", label: "제목", value: nextAction.title, required: true },
            ]}
            onSave={(values) => {
              if (onEditNextAction(nextAction.id, values)) setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <h3>{nextAction.title}</h3>
            {completed && nextAction.completedAt ? (
              <p className="review-detail-completed-at">
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>완료 처리 {formatDate(nextAction.completedAt)}</span>
              </p>
            ) : null}
            {nextAction.editedByUser && nextAction.editedAt ? (
              <p className="review-detail-time">
                <CalendarClock size={11} aria-hidden="true" /> 마지막 수정 {formatDate(nextAction.editedAt)}
              </p>
            ) : null}
          </>
        )}
      </header>

      <section className="review-detail-section">
        <SectionHeader title="근거" hint="이 액션과 직접 연결된 출처 / 이슈 / 이벤트" />
        <ul className="review-detail-links">
          {relatedIssues.length === 0 && relatedEvents.length === 0 ? (
            <li>
              <Badge tone="gray">근거</Badge>
              <span>연결된 이슈나 Timeline 이벤트가 없습니다.</span>
            </li>
          ) : null}
          {relatedIssues.map((issue) => (
            <li key={issue.id}>
              <Badge tone={priorityTone(issue.priority)}>이슈</Badge>
              <span>{issue.title}</span>
            </li>
          ))}
          {relatedEvents.map((event) => (
            <li key={event.id}>
              <Badge tone="purple">{eventTypeLabels[event.type] ?? event.type}</Badge>
              <button
                type="button"
                className="review-detail-event-link"
                onClick={() => onShowTimeline(event.id)}
                title="Timeline에서 이 이벤트 보기"
              >
                {event.title}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="review-detail-section">
        <SectionHeader
          title="우선순위"
          hint={
            canEditCompletion
              ? "우선순위를 바꾸면 세션에 저장됩니다."
              : "데모 세션에서는 변경이 저장되지 않습니다."
          }
        />
        <SegmentedControl
          ariaLabel="다음 액션 우선순위"
          role="radiogroup"
          value={nextAction.priority}
          onChange={(priority) => onEditNextAction(nextAction.id, { priority })}
          options={PRIORITY_ORDER.map((p) => ({
            id: p,
            label: priorityLabels[p],
            disabled: !canEditCompletion,
            title: canEditCompletion ? undefined : "데모 세션에서는 저장되지 않습니다.",
          }))}
        />
      </section>

      <section className="review-detail-section">
        <SectionHeader
          title="액션"
          hint={
            canEditCompletion
              ? completed
                ? "완료한 다음 작업입니다. 다시 미완료로 되돌릴 수 있습니다."
                : "이 다음 작업을 완료 처리하면 Resume 프롬프트에서 제외됩니다."
              : "데모 세션에서는 변경이 저장되지 않습니다."
          }
        />
        <div className="review-detail-actions">
          <Button
            variant={completed ? "ghost" : "primary"}
            disabled={!canEditCompletion}
            title={
              canEditCompletion
                ? undefined
                : "데모 세션에서는 완료 상태가 저장되지 않습니다."
            }
            onClick={() => onToggleComplete(nextAction.id, !completed)}
          >
            {completed ? "다시 미완료로" : "완료 처리"}
          </Button>
          <Button
            variant="secondary"
            icon={Pencil}
            disabled={!canEditText || isEditing}
            title={
              canEditText
                ? "다음 액션 제목을 사용자 수정으로 저장합니다."
                : "데모 또는 읽기 전용 세션에서는 편집을 저장할 수 없습니다."
            }
            onClick={() => setIsEditing(true)}
          >
            편집
          </Button>
        </div>
        {!canEditText ? (
          <p className="review-detail-empty">
            데모 또는 읽기 전용 세션에서는 편집을 저장할 수 없습니다.
          </p>
        ) : null}
      </section>
    </aside>
  );
}

function EvidenceList({ view, sourceIds }: { view: MoriMockSession; sourceIds: string[] }) {
  const sources = view.sources.filter((source) => sourceIds.includes(source.id));
  if (sources.length === 0) {
    return <p className="review-detail-empty">연결된 출처가 없습니다.</p>;
  }
  return (
    <ul className="review-detail-evidence">
      {sources.slice(0, 5).map((source) => {
        const display = getSourceDisplayStatus(source);
        return (
          <li key={source.id}>
            <Layers size={11} aria-hidden="true" />
            <span className="review-detail-evidence-title" title={source.title}>
              {source.title}
            </span>
            <Badge tone={display.trustTone}>{display.trustLabel}</Badge>
            <small>{display.integrationLabel}</small>
          </li>
        );
      })}
      {sources.length > 5 ? (
        <li className="review-detail-evidence-more">+ {sources.length - 5}건 더</li>
      ) : null}
    </ul>
  );
}

function RelatedEventList({
  events,
  onShowTimeline,
}: {
  events: ReturnType<typeof findEvents>;
  onShowTimeline: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return <p className="review-detail-empty">연결된 Timeline 이벤트가 없습니다.</p>;
  }
  return (
    <ul className="review-detail-events">
      {events.slice(0, 5).map((event) => (
        <li key={event.id}>
          <Badge tone="purple">{eventTypeLabels[event.type] ?? event.type}</Badge>
          <button
            type="button"
            className="review-detail-event-link"
            onClick={() => onShowTimeline(event.id)}
            title="Timeline에서 이 이벤트 보기"
          >
            {event.title}
          </button>
          <small>
            <ShieldCheck size={10} aria-hidden="true" /> {getTrustLabel(event.trustLevel)}
          </small>
        </li>
      ))}
      {events.length > 5 ? (
        <li className="review-detail-event-more">+ {events.length - 5}건 더</li>
      ) : null}
    </ul>
  );
}

function confidenceTone(pct: number): "green" | "blue" | "orange" | "red" {
  if (pct >= 85) return "green";
  if (pct >= 60) return "blue";
  if (pct >= 40) return "orange";
  return "red";
}
