import { Badge } from "../../components/ui/Badge";
import { priorityLabels } from "../../domain/constants";
import type { Decision, SourceRef, TimelineEvent } from "../../domain/types";
import { formatTime } from "../../lib/formatting/time";
import { getDecisionEvidenceSources } from "../../lib/sources/traceability";
import { priorityTone, trustTone } from "../../lib/review-workspace/reviewWorkspace";

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

  return (
    <tr
      className={`review-decision-row ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
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
        <Badge tone={decision.confirmed ? "green" : trustTone(decision.trustLevel)}>
          {decision.confirmed ? "Confirmed" : decision.trustLevel}
        </Badge>
      </td>
    </tr>
  );
}
