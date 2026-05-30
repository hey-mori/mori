import { ListChecks } from "lucide-react";
import type { MockSession, Priority } from "../../domain/types";
import {
  buildDecisionLineage,
  type LineageDecisionCard,
  type LineageRef,
} from "../../lib/timeline-lab/decisionLineage";
import { InfoHint } from "../../components/ui/InfoHint";

const IMPORTANCE_LABEL: Record<Priority, string> = {
  high: "중요",
  medium: "보통",
  low: "낮음",
};

/**
 * 계보 · the session read through its decisions.
 *
 * The other lenses walk moments; this one steps to the durable unit of value and
 * answers "why did we decide what we decided, and what followed". Each decision
 * is an ADR-shaped card: the chosen path, what motivated it, the alternatives
 * that were rejected, and its consequences. When a decision stated an expected
 * impact and the session later produced downstream events, a quiet 예상 vs 실제
 * block sets the two side by side without claiming a verdict.
 *
 * Pure derivation from the reviewed session (decisions + relationships).
 */
export function DecisionLineageView({ view }: { view: MockSession }) {
  const { cards } = buildDecisionLineage(view);

  if (cards.length === 0) {
    return <div className="lab-empty">이 세션에는 아직 기록된 결정이 없습니다.</div>;
  }

  return (
    <div className="lab-lineage">
      <header className="lab-lineage-headbar">
        <h4>결정 계보</h4>
        <InfoHint label="결정 계보 설명">
          각 결정을 근거·기각된 대안·결과와 함께 봅니다. 무엇이 그 결정을 이끌었고,
          무엇으로 이어졌는지입니다. 예상한 영향과 실제로 이어진 결과가 모두 있을 때만
          예상 vs 실제를 나란히 보여 줍니다.
        </InfoHint>
      </header>
      <ol className="lab-lineage-list">
        {cards.map((card) => (
          <LineageCard key={card.id} card={card} />
        ))}
      </ol>
    </div>
  );
}

function LineageCard({ card }: { card: LineageDecisionCard }) {
  return (
    <li className="lab-lineage-card" data-status={card.status} data-trust={card.trustLevel}>
      <header className="lab-lineage-head">
        <span className="lab-lineage-dot" aria-hidden="true" />
        <h5 className="lab-lineage-title">{card.title}</h5>
        {card.status === "contradicted" ? (
          <span className="lab-lineage-tension">상충</span>
        ) : null}
        <span className="lab-lineage-importance">{IMPORTANCE_LABEL[card.importance]}</span>
      </header>

      {card.motivations.length > 0 ? (
        <p className="lab-lineage-context">
          <span className="lab-lineage-key">맥락</span>
          {motivationSummary(card.motivations)}
        </p>
      ) : null}

      <p className="lab-lineage-decision">{card.decision}</p>
      {card.rationale ? <p className="lab-lineage-rationale">{card.rationale}</p> : null}

      {card.rejectedOptions.length > 0 ? (
        <div className="lab-lineage-rejected">
          {card.rejectedOptions.map((option, index) => (
            <span key={index} className="lab-lineage-reject">
              <span className="lab-lineage-reject-tag">기각</span>
              {option}
            </span>
          ))}
        </div>
      ) : null}

      {card.predictedVsActual ? (
        <div className="lab-lineage-pva">
          <div className="lab-lineage-pva-col">
            <span className="lab-lineage-key">예상</span>
            <ul>
              {card.predictedVsActual.predicted.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="lab-lineage-pva-col">
            <span className="lab-lineage-key">실제</span>
            <ul>
              {card.predictedVsActual.actual.map((ref) => (
                <li key={ref.id}>{ref.label}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : card.impact.length > 0 ? (
        <div className="lab-lineage-impact">
          <span className="lab-lineage-key">영향</span>
          <ul>
            {card.impact.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {card.consequences.length > 0 ? (
        <p className="lab-lineage-led">
          <ListChecks size={11} aria-hidden="true" />
          이어짐 {card.consequences.length}
        </p>
      ) : null}
    </li>
  );
}

function motivationSummary(motivations: LineageRef[]): string {
  const first = motivations[0]!;
  if (motivations.length === 1) return first.label;
  return `${first.label} 외 ${motivations.length - 1}건`;
}
