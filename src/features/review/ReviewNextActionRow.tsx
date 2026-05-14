import { ListChecks } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { priorityLabels } from "../../domain/constants";
import type { Issue, NextAction } from "../../domain/types";
import { priorityTone } from "../../lib/review-workspace/reviewWorkspace";

export function ReviewNextActionRow({
  nextAction,
  relatedIssues,
  selected,
  onSelect,
}: {
  nextAction: NextAction;
  relatedIssues: Issue[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`review-next-action-row ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <button type="button" onClick={onSelect}>
        <span className="review-next-action-icon">
          <ListChecks size={14} aria-hidden="true" />
        </span>
        <div className="review-next-action-titles">
          <strong>{nextAction.title}</strong>
          <span>
            {relatedIssues.length > 0
              ? `Related to: ${relatedIssues
                  .slice(0, 2)
                  .map((issue) => issue.title)
                  .join(", ")}${relatedIssues.length > 2 ? ` 외 ${relatedIssues.length - 2}건` : ""}`
              : "관련된 이슈가 아직 연결되지 않음"}
          </span>
        </div>
        <div className="review-next-action-meta">
          <Badge tone={priorityTone(nextAction.priority)}>{priorityLabels[nextAction.priority]}</Badge>
          <span>{nextAction.relatedEventIds.length} event</span>
        </div>
      </button>
    </article>
  );
}
