import { Badge } from "../../components/ui/Badge";
import { priorityLabels } from "../../domain/constants";
import type { Decision, SourceRef, TimelineEvent } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import { getDecisionEvidenceSources } from "../../lib/sources/traceability";
import { getTrustDisplay } from "../../lib/evidence/trust";
import { priorityTone } from "../../lib/review-workspace/reviewWorkspace";

export function ReviewDecisionRow({
  decision,
  events,
  sources,
  selected,
  onSelect,
}: {
  decision: Decision;
  events: TimelineEvent[];
  sources: SourceRef[];
  selected: boolean;
  onSelect: () => void;
}) {
  const evidence = getDecisionEvidenceSources(decision, events, sources);
  const trust = getTrustDisplay(decision.trustLevel);

  return (
    <tr
      className={`review-decision-row ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
    >
      <td>
        <strong>{decision.title}</strong>
        <small>{decision.decision}</small>
      </td>
      <td>{formatTime(decision.createdAt)}</td>
      <td>
        <Badge tone={priorityTone(decision.importance)}>{priorityLabels[decision.importance]}</Badge>
      </td>
      <td>
        <span className="review-decision-evidence">
          {evidence.eventCount}E · {evidence.sourceCount}S
          {decision.relatedIssueIds.length ? ` · ${decision.relatedIssueIds.length}I` : ""}
        </span>
      </td>
      <td>
        <Badge tone={decision.confirmed ? "green" : trust.tone}>
          {decision.confirmed ? "확정됨" : trust.label}
        </Badge>
        {decision.editedByUser ? <Badge tone="blue">사용자 수정됨</Badge> : null}
      </td>
    </tr>
  );
}
