import { CheckCircle2, ListChecks } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriObjectRow } from "../../components/ui/MoriObjectRow";
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
  const relatedLabel =
    relatedIssues.length > 0
      ? `관련 이슈: ${relatedIssues
          .slice(0, 2)
          .map((issue) => issue.title)
          .join(", ")}${relatedIssues.length > 2 ? ` 외 ${relatedIssues.length - 2}건` : ""}`
      : "관련된 이슈가 아직 연결되지 않음";

  return (
    <article
      className={`review-next-action-row ${selected ? "is-selected" : ""} ${
        completed ? "is-done" : ""
      }`.trim()}
      aria-current={selected ? "true" : undefined}
    >
      <MoriObjectRow
        leading={
          completed ? (
            <CheckCircle2 size={14} aria-hidden="true" />
          ) : (
            <ListChecks size={14} aria-hidden="true" />
          )
        }
        title={nextAction.title}
        subtitle={relatedLabel}
        status={
          <>
            {completed ? (
              <Badge tone="green">완료됨</Badge>
            ) : (
              <Badge tone={priorityTone(nextAction.priority)}>
                {priorityLabels[nextAction.priority]}
              </Badge>
            )}
            {nextAction.editedByUser ? <Badge tone="blue">수정됨</Badge> : null}
          </>
        }
        meta={<span>{nextAction.relatedEventIds.length} event</span>}
        selected={selected}
        onClick={onSelect}
        ariaLabel={nextAction.title}
        density="compact"
      />
    </article>
  );
}
