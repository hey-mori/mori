import { CheckCircle2, ListChecks } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { priorityLabels } from "../../domain/constants";
import type { Issue, NextAction } from "../../domain/types";
import { isNextActionCompleted } from "../../lib/session/nextActionCompletion";
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
  const completed = isNextActionCompleted(nextAction);
  return (
    <article
      className={`review-next-action-row ${selected ? "is-selected" : ""} ${
        completed ? "is-done" : ""
      }`.trim()}
      aria-current={selected ? "true" : undefined}
    >
      <button type="button" onClick={onSelect}>
        <span className="review-next-action-icon">
          {completed ? (
            <CheckCircle2 size={14} aria-hidden="true" />
          ) : (
            <ListChecks size={14} aria-hidden="true" />
          )}
        </span>
        <div className="review-next-action-titles">
          <strong>{nextAction.title}</strong>
          <span>
            {relatedIssues.length > 0
              ? `관련 이슈: ${relatedIssues
                  .slice(0, 2)
                  .map((issue) => issue.title)
                  .join(", ")}${relatedIssues.length > 2 ? ` 외 ${relatedIssues.length - 2}건` : ""}`
              : "관련된 이슈가 아직 연결되지 않음"}
          </span>
        </div>
        <div className="review-next-action-meta">
          {completed ? (
            <Badge tone="green">완료됨</Badge>
          ) : (
            <Badge tone={priorityTone(nextAction.priority)}>
              {priorityLabels[nextAction.priority]}
            </Badge>
          )}
          {nextAction.editedByUser ? <Badge tone="blue">수정됨</Badge> : null}
          <span>{nextAction.relatedEventIds.length} event</span>
        </div>
      </button>
    </article>
  );
}
