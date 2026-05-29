import { BrainCircuit, Layers } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseSection } from "../../components/ui/BaseSection";
import {
  describeProjectMemoryDataBasis,
  getProjectMemoryDataBasisTone,
} from "../../lib/project-memory/projectMemoryModel";
import {
  describeProposalKind,
  type ProjectMemoryConsolidationState,
} from "../../lib/project-memory/projectMemoryConsolidationState";

/**
 * Consolidation Preview Card.
 *
 * Reads the typed `ProjectMemoryConsolidationState` and renders a
 * compact, honest summary of what the Consolidation Review Surface
 * proposes. When proposals exist the "제안 검토" button opens the
 * Consolidation Review surface, where the user accepts / edits /
 * discards each proposal before deliberately applying local memory writes.
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
    <BaseSection
      className="memory-consolidation"
      ariaLabel="프로젝트 메모리 통합 미리보기"
      title={
        <span className="memory-consolidation-title">
          <BrainCircuit size={14} aria-hidden="true" /> 메모리 통합
        </span>
      }
      hint={
        <span>
          누적된 프로젝트 메모리에서 승격할 항목을 미리 보여줍니다. ‘제안 검토’를 누르면 통합 검토에서
          각 제안을 살펴볼 수 있고, ‘메모리 적용’을 누르기 전까지는 아무 것도 저장되지 않습니다.
        </span>
      }
    >
      <header className="memory-consolidation-head">
        <div>
          <strong>{headline}</strong>
          {state.emptyReason ? <span className="memory-consolidation-empty">{state.emptyReason}</span> : null}
        </div>
        <Badge tone={dataBasisTone}>{describeProjectMemoryDataBasis(state.dataBasis)}</Badge>
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
              ? "통합 검토를 엽니다. 메모리 적용을 누르면 승인 / 편집한 항목과 감사 로그가 로컬에 저장됩니다."
              : "검토할 제안이 없습니다."
          }
        >
          {reviewable ? "제안 검토" : "검토할 제안 없음"}
        </Button>
        <small>{state.nextStepLabel}</small>
      </footer>
    </BaseSection>
  );
}

function headlineFor(state: ProjectMemoryConsolidationState): string {
  switch (state.status) {
    case "ready":
      return `검토 대기 중인 제안 ${state.proposalCount}건`;
    case "partial":
      return `부분 데이터 기반 제안 ${state.proposalCount}건`;
    case "empty":
      return "아직 제안이 없습니다";
    case "unavailable":
    default:
      return "Consolidation을 사용할 수 없습니다";
  }
}

function sumTop(state: ProjectMemoryConsolidationState, kinds: ProjectMemoryConsolidationState["topProposalKinds"]): number {
  let total = 0;
  for (const kind of kinds) total += state.proposalCounts[kind] ?? 0;
  return total;
}
