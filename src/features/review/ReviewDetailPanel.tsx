import { CalendarClock, Layers, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriPlannedAction } from "../../components/ui/MoriPlannedAction";
import { SectionHeader } from "../../components/ui/SectionHeader";
import {
  eventTypeLabels,
  issueStatusLabels,
  priorityLabels,
} from "../../domain/constants";
import type { Decision, Issue, MoriMockSession, NextAction } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import {
  getDecisionEvidenceSources,
  getIssueEvidenceSources,
  getSourceDisplayStatus,
} from "../../lib/sources/traceability";
import {
  findEvents,
  issueStatusTone,
  priorityTone,
  type ReviewSelection,
} from "../../lib/review-workspace/reviewWorkspace";
import { getTrustDisplay, getTrustLabel } from "../../lib/evidence/trust";

export function ReviewDetailPanel({
  selection,
  view,
  onShowTimeline,
}: {
  selection: ReviewSelection;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
}) {
  if (selection.kind === "none") {
    return (
      <aside className="review-detail" aria-label="Review detail">
        <header className="review-detail-header">
          <Badge tone="gray">선택된 항목 없음</Badge>
          <h3>Review detail</h3>
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
    return <IssueDetail issue={issue} view={view} onShowTimeline={onShowTimeline} />;
  }

  if (selection.kind === "decision") {
    const decision = view.decisions.find((entry) => entry.id === selection.decisionId);
    if (!decision) return <MissingItem label="결정" />;
    return <DecisionDetail decision={decision} view={view} onShowTimeline={onShowTimeline} />;
  }

  const nextAction = view.nextActions.find((entry) => entry.id === selection.nextActionId);
  if (!nextAction) return <MissingItem label="다음 액션" />;
  return <NextActionDetail nextAction={nextAction} view={view} onShowTimeline={onShowTimeline} />;
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
}: {
  issue: Issue;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
}) {
  const evidence = getIssueEvidenceSources(issue, view.events, view.sources);
  const relatedEvents = findEvents(view.events, issue.sourceEventIds);
  const relatedDecisions = view.decisions.filter((decision) =>
    issue.relatedDecisionIds.includes(decision.id),
  );
  const confidencePct = Math.round(issue.confidence * 100);
  const issueTrust = getTrustDisplay(issue.trustLevel);

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
        </div>
        <h3>{issue.title}</h3>
        <p className="review-detail-detail">{issue.description}</p>
      </header>

      <section className="review-detail-section">
        <SectionHeader title="제안된 다음 액션" />
        <p className="review-detail-suggestion">
          <Sparkles size={12} aria-hidden="true" />
          <span>{issue.suggestedNextAction || "(제안된 액션 없음)"}</span>
        </p>
      </section>

      <section className="review-detail-section">
        <SectionHeader title="근거" hint={`${evidence.sourceCount} source · ${evidence.eventCount} event`} />
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
        <SectionHeader title="액션" />
        <div className="review-detail-actions">
          <MoriPlannedAction
            label="상태 변경"
            title="이슈 상태 변경은 다음 마일스톤에서 활성화됩니다."
          />
          <MoriPlannedAction
            label="편집"
            title="이슈 편집은 다음 마일스톤에서 활성화됩니다."
          />
          <MoriPlannedAction
            label="액션으로 승격"
            title="이슈를 다음 액션으로 승격하는 기능은 다음 마일스톤입니다."
          />
        </div>
      </section>
    </aside>
  );
}

function DecisionDetail({
  decision,
  view,
  onShowTimeline,
}: {
  decision: Decision;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
}) {
  const evidence = getDecisionEvidenceSources(decision, view.events, view.sources);
  const relatedEvents = findEvents(view.events, decision.sourceEventIds);
  const relatedIssues = view.issues.filter((issue) =>
    decision.relatedIssueIds.includes(issue.id),
  );
  const decisionTrust = getTrustDisplay(decision.trustLevel);

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
        </div>
        <h3>{decision.title}</h3>
        <p className="review-detail-detail">{decision.decision}</p>
        <p className="review-detail-time">
          <CalendarClock size={11} aria-hidden="true" /> {formatTime(decision.createdAt)}
        </p>
      </header>

      <section className="review-detail-section">
        <SectionHeader title="이유" />
        <p className="review-detail-rationale">{decision.rationale || "(이유 기록 없음)"}</p>
      </section>

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
        <SectionHeader title="근거" hint={`${evidence.sourceCount} source · ${evidence.eventCount} event`} />
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
        <SectionHeader title="액션" />
        <div className="review-detail-actions">
          <MoriPlannedAction
            label="확정 / 반려"
            title="결정 확정 토글은 다음 마일스톤에서 활성화됩니다."
          />
          <MoriPlannedAction
            label="편집"
            title="결정 편집은 다음 마일스톤에서 활성화됩니다."
          />
        </div>
      </section>
    </aside>
  );
}

function NextActionDetail({
  nextAction,
  view,
  onShowTimeline,
}: {
  nextAction: NextAction;
  view: MoriMockSession;
  onShowTimeline: (eventId: string) => void;
}) {
  const relatedIssues = view.issues.filter((issue) =>
    nextAction.relatedIssueIds.includes(issue.id),
  );
  const relatedEvents = view.events.filter((event) => nextAction.relatedEventIds.includes(event.id));

  return (
    <aside className="review-detail" aria-label="Next action detail">
      <header className="review-detail-header">
        <div className="review-detail-badges">
          <Badge tone={priorityTone(nextAction.priority)}>{priorityLabels[nextAction.priority]}</Badge>
          <Badge tone="purple">Next action</Badge>
        </div>
        <h3>{nextAction.title}</h3>
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
        <SectionHeader title="액션" />
        <div className="review-detail-actions">
          <MoriPlannedAction
            label="완료 처리"
            title="다음 액션 완료 처리는 다음 마일스톤에서 활성화됩니다."
          />
          <MoriPlannedAction
            label="편집"
            title="다음 액션 편집은 다음 마일스톤에서 활성화됩니다."
          />
        </div>
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
