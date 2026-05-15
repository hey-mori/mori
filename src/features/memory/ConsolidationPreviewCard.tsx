import { BrainCircuit, Layers } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriSection } from "../../components/ui/MoriSection";
import { getProjectMemoryDataBasisTone } from "../../lib/project-memory/projectMemoryModel";
import {
  describeProposalKind,
  type ProjectMemoryConsolidationState,
} from "../../lib/project-memory/projectMemoryConsolidationModel";

/**
 * Phase 2.1 preview card. Reads the typed
 * `ProjectMemoryConsolidationState` and renders a compact, honest
 * summary of what a future Consolidation Review surface would
 * propose. The button is labelled "Planned" and disabled because the
 * Review UI does not yet exist (Phase 2.2). No persistence happens
 * here; no memory is written.
 */
export function ConsolidationPreviewCard({
  state,
}: {
  state: ProjectMemoryConsolidationState;
}) {
  const dataBasisTone = getProjectMemoryDataBasisTone(state.dataBasis);
  const headline = headlineFor(state);

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
        <Button icon={Layers} disabled title="Consolidation Review UI is planned (Phase 2.2).">
          Review proposals (Planned)
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
