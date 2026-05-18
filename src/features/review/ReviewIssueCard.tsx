import { Calendar, Link2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
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
      <button type="button" className="review-issue-card-body" onClick={onSelect}>
        <header className="review-issue-card-head">
          <strong title={issue.title}>{issue.title}</strong>
          <Badge tone={priorityTone(issue.priority)}>{priorityLabels[issue.priority]}</Badge>
        </header>
        <p className="review-issue-card-summary">{issue.description}</p>
        <footer className="review-issue-card-footer">
          <span className="review-issue-card-meta">
            <Calendar size={11} aria-hidden="true" /> {formatDate(issue.createdAt)}
          </span>
          <span className="review-issue-card-meta">
            <Link2 size={11} aria-hidden="true" /> {evidence.eventCount}E · {evidence.sourceCount}S
            {issue.relatedDecisionIds.length ? ` · ${issue.relatedDecisionIds.length}D` : ""}
          </span>
          <Badge tone={trust.tone}>
            {isInferred ? `${trust.label} ${confidencePct}%` : trust.label}
          </Badge>
          {issue.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : null}
        </footer>
      </button>
    </article>
  );
}
