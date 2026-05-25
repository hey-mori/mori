import { Badge } from "../../components/ui/Badge";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
import { MoriMetadataLine } from "../../components/ui/MoriMetadataLine";
import { priorityLabels } from "../../domain/constants";
import type { Issue, SourceRef, TimelineEvent } from "../../domain/types";
import { formatDate } from "../../lib/formatting/time";
import { getIssueEvidenceSources } from "../../lib/sources/traceability";
import { getTrustDisplay } from "../../lib/evidence/trust";
import { priorityTone } from "../../lib/review-workspace/reviewWorkspace";

export function ReviewIssueCard({
  issue,
  events,
  sources,
  selected,
  onSelect,
}: {
  issue: Issue;
  events: TimelineEvent[];
  sources: SourceRef[];
  selected: boolean;
  onSelect: () => void;
}) {
  const evidence = getIssueEvidenceSources(issue, events, sources);
  const confidencePct = Math.round(issue.confidence * 100);
  const trust = getTrustDisplay(issue.trustLevel);
  const isInferred = issue.trustLevel === "inferred";

  return (
    <article
      className={`review-issue-card ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <MoriObjectRow
        title={issue.title}
        subtitle={issue.description}
        meta={
          <MoriMetadataLine
            items={[
              formatDate(issue.createdAt),
              <span
                title={`이벤트 ${evidence.eventCount}개 · 소스 ${evidence.sourceCount}개`}
              >
                {evidence.eventCount}E · {evidence.sourceCount}S
                {issue.relatedDecisionIds.length
                  ? ` · ${issue.relatedDecisionIds.length}D`
                  : ""}
              </span>,
            ]}
          />
        }
        status={
          <>
            <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
            <Badge
              tone={trust.tone}
              title={
                isInferred
                  ? `AI가 추론한 항목입니다. 신뢰도 ${confidencePct}% — 원본 근거에서 확인 후 수락하세요.`
                  : trust.label
              }
            >
              {isInferred ? `${trust.label} ${confidencePct}%` : trust.label}
            </Badge>
            {issue.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : null}
          </>
        }
        selected={selected}
        onClick={onSelect}
        ariaLabel={issue.title}
      />
    </article>
  );
}
