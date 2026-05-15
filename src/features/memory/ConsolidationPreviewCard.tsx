import { BrainCircuit, Layers } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriSection } from "../../components/ui/MoriSection";
import { getProjectMemoryDataBasisTone } from "../../lib/project-memory/projectMemoryModel";
import {
  describeProposalKind,
  type ProjectMemoryConsolidationState,
} from "../../lib/project-memory/projectMemoryConsolidationState";

/**
 * Consolidation Preview Card.
 *
 * Reads the typed `ProjectMemoryConsolidationState` and renders a
 * compact, honest summary of what the Consolidation Review Surface
 * proposes. When proposals exist the "Review proposals" button
 * opens the review surface; durable Accepted Memory Persistence is
 * still planned, so the review actions inside that surface remain
 * local-draft only.
 */
export function ConsolidationPreviewCard({
  state,
  onOpenReview,
}: {
  state: ProjectMemoryConsolidationState;
  onOpenReview?: () => void;
}) {
  const dataBasisTone = getProjectMemoryDataBasisTone(state.dataBasis);
  const headline = headlineFor(state);
  const reviewable = state.proposalCount > 0;

  return (
    <MoriSection
      className="memory-consolidation"
      ariaLabel="Project Memory consolidation preview"
      title={
        <span className="memory-consolidation-title">
          <BrainCircuit size={14} aria-hidden="true" /> Memory Consolidation
        </span>
      }
      hint={
        <span>
          누적된 Project Memory에서 승격할 항목을 미리 보여줍니다. 검토(Review) UI는 다음 단계(Phase
          2.2)에서 도착합니다. 사용자가 승인하기 전까지는 어떤 메모리도 저장되지 않습니다.
        </span>
      }
    >
      <header className="memory-consolidation-head">
        <div>
          <strong>{headline}</strong>
          {state.emptyReason ? <span className="memory-consolidation-empty">{state.emptyReason}</span> : null}
        </div>
        <Badge tone={dataBasisTone}>{state.dataBasis}</Badge>
      </header>

      {state.proposalCount > 0 ? (
        <dl className="memory-consolidation-counts">
          {state.topProposalKinds.map((kind) => (
            <div key={kind} className="memory-consolidation-count">
              <dt>{describeProposalKind(kind)}</dt>
              <dd>{state.proposalCounts[kind]}</dd>
            </div>
          ))}
          {state.proposalCount > sumTop(state, state.topProposalKinds) ? (
            <div className="memory-consolidation-count tone-muted">
              <dt>그 외</dt>
              <dd>{state.proposalCount - sumTop(state, state.topProposalKinds)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <footer className="memory-consolidation-actions">
        <Button
          icon={Layers}
          variant={reviewable ? "primary" : undefined}
          disabled={!reviewable || !onOpenReview}
          onClick={reviewable && onOpenReview ? onOpenReview : undefined}
          title={
            reviewable
              ? "Consolidation Review를 엽니다. Accepted Memory Persistence는 아직 미구현 — 모든 검토 액션은 드래프트로 유지됩니다."
              : "검토할 제안이 없습니다."
          }
        >
          {reviewable ? "Review proposals" : "Review proposals (none yet)"}
        </Button>
        <small>{state.nextStepLabel}</small>
      </footer>
    </MoriSection>
  );
}

function headlineFor(state: ProjectMemoryConsolidationState): string {
  switch (state.status) {
    case "ready":
      return `${state.proposalCount} proposals ready for review`;
    case "partial":
      return `${state.proposalCount} proposals from partial data`;
    case "empty":
      return "No proposals yet";
    case "unavailable":
    default:
      return "Consolidation unavailable";
  }
}

function sumTop(state: ProjectMemoryConsolidationState, kinds: ProjectMemoryConsolidationState["topProposalKinds"]): number {
  let total = 0;
  for (const kind of kinds) total += state.proposalCounts[kind] ?? 0;
  return total;
}
