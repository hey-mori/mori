import { CheckCircle2, Layers, ListPlus, Pencil, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  BaseInspectorPanel,
  InspectorSection,
  InspectorRows,
  InspectorRow,
  InspectorActions,
  InspectorDisclosure,
  InspectorNote,
  InspectorEmpty,
} from "../../components/ui/BaseInspectorPanel";
import {
  eventTypeLabels,
  issueStatusLabels,
  priorityLabels,
} from "../../domain/constants";
import type {
  Decision,
  Issue,
  IssueStatus,
  MockSession,
  NextAction,
  Priority,
  SourceRef,
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
  priorityTone,
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";
import { InlineEditForm } from "./InlineEditForm";
import { useDisclosedView } from "../../app/useDisclosedView";
import type {
  DecisionEditFields,
  IssueEditFields,
  NextActionEditFields,
} from "../../lib/session/reviewItemEdit";

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];

export function ReviewDetailPanel({
  selection,
  view: storedView,
  onClose,
  onShowTimeline,
  onOpenEvidenceSource,
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
  view: MockSession;
  /** Close the panel from within (renders the X). */
  onClose?: () => void;
  onShowTimeline: (eventId: string) => void;
  /** Jump into 자료 focused on the source an item's analysis was drawn from. */
  onOpenEvidenceSource?: (sourceId: string) => void;
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
  // Linked events read as the request disclosure level shows them: an issue
  // lifted from a request must not reveal that request at 숨김.
  const view = useDisclosedView(storedView);
  if (selection.kind === "none") {
    return (
      <BaseInspectorPanel
        className="inspector"
        ariaLabel="항목 상세"
        onClose={onClose}
        eyebrow={<Badge tone="gray">선택된 항목 없음</Badge>}
        title="항목 상세"
        description="왼쪽 목록에서 이슈, 결정, 또는 다음 액션을 선택하면 근거 출처와 관련 이벤트가 여기 표시됩니다."
      >
        <InspectorSection title="이 화면에서 가능한 것">
          <ul className="ins-bullets">
            <li>분석이 만든 이슈와 결정의 근거를 확인합니다.</li>
            <li>관련 Timeline 이벤트로 이동합니다.</li>
            <li>다음 액션 후보를 검토합니다.</li>
          </ul>
        </InspectorSection>
      </BaseInspectorPanel>
    );
  }

  if (selection.kind === "issue") {
    const issue = view.issues.find((entry) => entry.id === selection.issueId);
    if (!issue) return <MissingItem label="이슈" onClose={onClose} />;
    return (
      <IssueDetail
        issue={issue}
        view={view}
        onClose={onClose}
        onShowTimeline={onShowTimeline}
        onOpenEvidenceSource={onOpenEvidenceSource}
        onSetStatus={onSetIssueStatus}
        onEditIssue={onEditIssue}
        onPromoteIssueToNextAction={onPromoteIssueToNextAction}
        canEditStatus={canEditReview}
      />
    );
  }

  if (selection.kind === "decision") {
    const decision = view.decisions.find((entry) => entry.id === selection.decisionId);
    if (!decision) return <MissingItem label="결정" onClose={onClose} />;
    return (
      <DecisionDetail
        decision={decision}
        view={view}
        onClose={onClose}
        onShowTimeline={onShowTimeline}
        onOpenEvidenceSource={onOpenEvidenceSource}
        onSetConfirmed={onSetDecisionConfirmed}
        onEditDecision={onEditDecision}
        canEditConfirm={canEditReview}
      />
    );
  }

  const nextAction = view.nextActions.find((entry) => entry.id === selection.nextActionId);
  if (!nextAction) return <MissingItem label="다음 액션" onClose={onClose} />;
  return (
    <NextActionDetail
      nextAction={nextAction}
      view={view}
      onClose={onClose}
      onShowTimeline={onShowTimeline}
      onToggleComplete={onToggleNextActionComplete}
      onEditNextAction={onEditNextAction}
      canEditCompletion={canEditReview}
    />
  );
}

function MissingItem({ label, onClose }: { label: string; onClose?: () => void }) {
  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="항목 상세"
      onClose={onClose}
      eyebrow={<Badge tone="gray">선택된 {label}을 찾을 수 없음</Badge>}
      title={`이 ${label}을 찾을 수 없습니다`}
      description={`이 세션에는 이 ID에 해당하는 ${label}이 더 이상 없습니다.`}
    >
      {null}
    </BaseInspectorPanel>
  );
}

function IssueDetail({
  issue,
  view,
  onClose,
  onShowTimeline,
  onOpenEvidenceSource,
  onSetStatus,
  onEditIssue,
  onPromoteIssueToNextAction,
  canEditStatus,
}: {
  issue: Issue;
  view: MockSession;
  onClose?: () => void;
  onShowTimeline: (eventId: string) => void;
  onOpenEvidenceSource?: (sourceId: string) => void;
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
  const existingNextAction = view.nextActions.find((action) =>
    action.relatedIssueIds.includes(issue.id),
  );

  if (isEditing) {
    return (
      <EditPanel ariaLabel="이슈 편집" title="이슈 편집" onClose={onClose}>
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
      </EditPanel>
    );
  }

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="이슈 상세"
      onClose={onClose}
      eyebrow={issue.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : undefined}
      title={issue.title}
      description={issue.description}
      meta={
        issue.editedByUser && issue.editedAt
          ? `마지막 수정 ${formatDate(issue.editedAt)}`
          : undefined
      }
    >
      <InspectorSection title="제안된 다음 액션">
        <InspectorNote icon={<Sparkles size={12} aria-hidden="true" />}>
          {issue.suggestedNextAction || "(제안된 액션 없음)"}
        </InspectorNote>
      </InspectorSection>

      <InspectorSection
        title="근거"
        hint={`출처 ${evidence.sourceCount} · 이벤트 ${evidence.eventCount}`}
      >
        <EvidenceList
          view={view}
          sourceIds={evidence.sources.map((source) => source.id)}
          onOpenEvidenceSource={onOpenEvidenceSource}
        />
      </InspectorSection>

      <InspectorSection title="관련 Timeline 이벤트" hint={`${relatedEvents.length}건`}>
        <RelatedEventList events={relatedEvents} onShowTimeline={onShowTimeline} />
      </InspectorSection>

      {relatedDecisions.length > 0 ? (
        <InspectorSection title="관련 결정" hint={`${relatedDecisions.length}건`}>
          <InspectorRows>
            {relatedDecisions.map((decision) => (
              <InspectorRow
                key={decision.id}
                leading={<Badge tone="green">결정</Badge>}
                title={decision.title}
              />
            ))}
          </InspectorRows>
        </InspectorSection>
      ) : null}

      {canEditStatus ? (
        <>
          <InspectorSection title="상태" hint="바꾸면 세션에 저장됩니다">
            <SegmentedControl
              ariaLabel="이슈 상태"
              role="radiogroup"
              value={issue.status}
              onChange={(status) => onSetStatus(issue.id, status)}
              options={ISSUE_STATUS_ORDER.map((status) => ({
                id: status,
                label: issueStatusLabels[status],
              }))}
            />
          </InspectorSection>

          <InspectorSection title="우선순위" hint="바꾸면 세션에 저장됩니다">
            <SegmentedControl
              ariaLabel="이슈 우선순위"
              role="radiogroup"
              value={issue.priority}
              onChange={(priority) => onEditIssue(issue.id, { priority })}
              options={PRIORITY_ORDER.map((p) => ({ id: p, label: priorityLabels[p] }))}
            />
          </InspectorSection>

          <InspectorSection title="액션">
            <InspectorActions>
              <Button
                variant="secondary"
                icon={Pencil}
                disabled={isEditing}
                title="이슈 제목과 설명을 사용자 수정으로 저장합니다."
                onClick={() => setIsEditing(true)}
              >
                편집
              </Button>
              <Button
                variant={existingNextAction ? "ghost" : "secondary"}
                icon={ListPlus}
                title={
                  existingNextAction
                    ? "이미 이 이슈와 연결된 다음 액션이 있습니다."
                    : "이 이슈를 연결된 다음 액션으로 추가합니다."
                }
                onClick={() => onPromoteIssueToNextAction(issue.id)}
              >
                {existingNextAction ? "액션 보기" : "액션으로 승격"}
              </Button>
            </InspectorActions>
          </InspectorSection>
        </>
      ) : null}
    </BaseInspectorPanel>
  );
}

function DecisionDetail({
  decision,
  view,
  onClose,
  onShowTimeline,
  onOpenEvidenceSource,
  onSetConfirmed,
  onEditDecision,
  canEditConfirm,
}: {
  decision: Decision;
  view: MockSession;
  onClose?: () => void;
  onShowTimeline: (eventId: string) => void;
  onOpenEvidenceSource?: (sourceId: string) => void;
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

  if (isEditing) {
    return (
      <EditPanel ariaLabel="결정 편집" title="결정 편집" onClose={onClose}>
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
      </EditPanel>
    );
  }

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="결정 상세"
      onClose={onClose}
      eyebrow={decision.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : undefined}
      title={decision.title}
      description={decision.decision}
      meta={formatTime(decision.createdAt)}
    >
      <InspectorSection title="이유">
        <InspectorNote>{decision.rationale || "(이유 기록 없음)"}</InspectorNote>
      </InspectorSection>

      {decision.rejectedOptions.length > 0 ? (
        <InspectorSection title="폐기한 대안" hint={`${decision.rejectedOptions.length}건`}>
          <ul className="ins-bullets is-muted">
            {decision.rejectedOptions.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      {decision.impact.length > 0 ? (
        <InspectorSection title="영향">
          <ul className="ins-bullets">
            {decision.impact.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}

      <InspectorSection
        title="근거"
        hint={`출처 ${evidence.sourceCount} · 이벤트 ${evidence.eventCount}`}
      >
        <EvidenceList
          view={view}
          sourceIds={evidence.sources.map((source) => source.id)}
          onOpenEvidenceSource={onOpenEvidenceSource}
        />
      </InspectorSection>

      <InspectorSection title="관련 Timeline 이벤트" hint={`${relatedEvents.length}건`}>
        <RelatedEventList events={relatedEvents} onShowTimeline={onShowTimeline} />
      </InspectorSection>

      {relatedIssues.length > 0 ? (
        <InspectorSection title="관련 이슈" hint={`${relatedIssues.length}건`}>
          <InspectorRows>
            {relatedIssues.map((issue) => (
              <InspectorRow
                key={issue.id}
                leading={<Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>}
                title={issue.title}
              />
            ))}
          </InspectorRows>
        </InspectorSection>
      ) : null}

      {canEditConfirm ? (
        <>
          <InspectorSection title="중요도" hint="바꾸면 세션에 저장됩니다">
            <SegmentedControl
              ariaLabel="결정 중요도"
              role="radiogroup"
              value={decision.importance}
              onChange={(importance) => onEditDecision(decision.id, { importance })}
              options={PRIORITY_ORDER.map((p) => ({ id: p, label: priorityLabels[p] }))}
            />
          </InspectorSection>

          <InspectorSection
            title="액션"
            hint={decision.confirmed ? "확정됨 · 반려 가능" : "검토를 마쳤다면 확정하세요"}
          >
            <InspectorActions>
              <Button
                variant={decision.confirmed ? "ghost" : "primary"}
                onClick={() => onSetConfirmed(decision.id, !decision.confirmed)}
              >
                {decision.confirmed ? "확정 반려" : "확정 처리"}
              </Button>
              <Button
                variant="secondary"
                icon={Pencil}
                disabled={isEditing}
                title="결정 제목, 내용, 이유를 사용자 수정으로 저장합니다."
                onClick={() => setIsEditing(true)}
              >
                편집
              </Button>
            </InspectorActions>
          </InspectorSection>
        </>
      ) : null}
    </BaseInspectorPanel>
  );
}

function NextActionDetail({
  nextAction,
  view,
  onClose,
  onShowTimeline,
  onToggleComplete,
  onEditNextAction,
  canEditCompletion,
}: {
  nextAction: NextAction;
  view: MockSession;
  onClose?: () => void;
  onShowTimeline: (eventId: string) => void;
  onToggleComplete: (nextActionId: string, completed: boolean) => void;
  onEditNextAction: (nextActionId: string, fields: NextActionEditFields) => boolean;
  canEditCompletion: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const relatedIssues = view.issues.filter((issue) =>
    nextAction.relatedIssueIds.includes(issue.id),
  );
  const relatedEvents = view.events.filter((event) =>
    nextAction.relatedEventIds.includes(event.id),
  );
  const completed = isNextActionCompleted(nextAction);

  if (isEditing) {
    return (
      <EditPanel ariaLabel="다음 액션 편집" title="다음 액션 편집" onClose={onClose}>
        <InlineEditForm
          fields={[{ id: "title", label: "제목", value: nextAction.title, required: true }]}
          onSave={(values) => {
            if (onEditNextAction(nextAction.id, values)) setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      </EditPanel>
    );
  }

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="다음 액션 상세"
      onClose={onClose}
      eyebrow={
        <>
          {nextAction.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : null}
          {completed ? <Badge tone="green">완료</Badge> : null}
        </>
      }
      title={nextAction.title}
      meta={
        completed && nextAction.completedAt
          ? `완료 처리 ${formatDate(nextAction.completedAt)}`
          : nextAction.editedByUser && nextAction.editedAt
            ? `마지막 수정 ${formatDate(nextAction.editedAt)}`
            : undefined
      }
    >
      <InspectorSection title="근거" hint="연결된 출처 · 이슈 · 이벤트">
        {relatedIssues.length === 0 && relatedEvents.length === 0 ? (
          <InspectorEmpty>연결된 이슈나 Timeline 이벤트가 없습니다.</InspectorEmpty>
        ) : (
          <InspectorRows>
            {relatedIssues.map((issue) => (
              <InspectorRow
                key={issue.id}
                leading={<Badge tone={priorityTone(issue.priority)}>이슈</Badge>}
                title={issue.title}
              />
            ))}
            {relatedEvents.map((event) => (
              <InspectorRow
                key={event.id}
                leading={<Badge tone="purple">{eventTypeLabels[event.type] ?? event.type}</Badge>}
                title={event.title}
                onClick={() => onShowTimeline(event.id)}
              />
            ))}
          </InspectorRows>
        )}
      </InspectorSection>

      {completed ? (
        <InspectorNote icon={<CheckCircle2 size={13} aria-hidden="true" />}>
          이 액션은 완료 처리되어 Resume 프롬프트에서 제외됩니다.
        </InspectorNote>
      ) : null}

      {canEditCompletion ? (
        <>
          <InspectorSection title="우선순위" hint="바꾸면 세션에 저장됩니다">
            <SegmentedControl
              ariaLabel="다음 액션 우선순위"
              role="radiogroup"
              value={nextAction.priority}
              onChange={(priority) => onEditNextAction(nextAction.id, { priority })}
              options={PRIORITY_ORDER.map((p) => ({ id: p, label: priorityLabels[p] }))}
            />
          </InspectorSection>

          <InspectorSection
            title="액션"
            hint={completed ? "완료됨 · 되돌릴 수 있습니다" : "완료하면 Resume에서 제외됩니다"}
          >
            <InspectorActions>
              <Button
                variant={completed ? "ghost" : "primary"}
                onClick={() => onToggleComplete(nextAction.id, !completed)}
              >
                {completed ? "다시 미완료로" : "완료 처리"}
              </Button>
              <Button
                variant="secondary"
                icon={Pencil}
                disabled={isEditing}
                title="다음 액션 제목을 사용자 수정으로 저장합니다."
                onClick={() => setIsEditing(true)}
              >
                편집
              </Button>
            </InspectorActions>
          </InspectorSection>
        </>
      ) : null}
    </BaseInspectorPanel>
  );
}

/** A minimal panel shell for the inline edit form — just the kit header + the
 *  form, so editing reads as a focused mode of the same surface. */
function EditPanel({
  ariaLabel,
  title,
  onClose,
  children,
}: {
  ariaLabel: string;
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel={ariaLabel}
      onClose={onClose}
      title={title}
    >
      <InspectorSection>{children}</InspectorSection>
    </BaseInspectorPanel>
  );
}

function EvidenceList({
  view,
  sourceIds,
  onOpenEvidenceSource,
}: {
  view: MockSession;
  sourceIds: string[];
  onOpenEvidenceSource?: (sourceId: string) => void;
}) {
  const sources = view.sources.filter((source) => sourceIds.includes(source.id));
  if (sources.length === 0) {
    return <InspectorEmpty>연결된 출처가 없습니다.</InspectorEmpty>;
  }
  return (
    <>
      <InspectorRows>
        {sources.slice(0, 5).map((source) => (
          <EvidenceSourceRow
            key={source.id}
            source={source}
            onOpen={onOpenEvidenceSource}
          />
        ))}
      </InspectorRows>
      {sources.length > 5 ? (
        <InspectorDisclosure summary="나머지 출처" count={sources.length - 5}>
          <InspectorRows>
            {sources.slice(5).map((source) => (
              <EvidenceSourceRow
                key={source.id}
                source={source}
                onOpen={onOpenEvidenceSource}
              />
            ))}
          </InspectorRows>
        </InspectorDisclosure>
      ) : null}
    </>
  );
}

function EvidenceSourceRow({
  source,
  onOpen,
}: {
  source: SourceRef;
  onOpen?: (sourceId: string) => void;
}) {
  const display = getSourceDisplayStatus(source);
  return (
    <InspectorRow
      leading={<Layers size={13} aria-hidden="true" />}
      title={source.title}
      meta={display.integrationLabel}
      onClick={onOpen ? () => onOpen(source.id) : undefined}
    />
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
    return <InspectorEmpty>연결된 Timeline 이벤트가 없습니다.</InspectorEmpty>;
  }
  return (
    <>
      <InspectorRows>
        {events.slice(0, 5).map((event) => (
          <InspectorRow
            key={event.id}
            leading={<Badge tone="purple">{eventTypeLabels[event.type] ?? event.type}</Badge>}
            title={event.title}
            onClick={() => onShowTimeline(event.id)}
          />
        ))}
      </InspectorRows>
      {events.length > 5 ? (
        <InspectorDisclosure summary="나머지 이벤트" count={events.length - 5}>
          <InspectorRows>
            {events.slice(5).map((event) => (
              <InspectorRow
                key={event.id}
                leading={<Badge tone="purple">{eventTypeLabels[event.type] ?? event.type}</Badge>}
                title={event.title}
                onClick={() => onShowTimeline(event.id)}
              />
            ))}
          </InspectorRows>
        </InspectorDisclosure>
      ) : null}
    </>
  );
}
