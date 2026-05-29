import { useRef, useState } from "react";
import { ChevronRight, Flag, TriangleAlert } from "lucide-react";
import type { MockSession } from "../../domain/types";
import { buildPhases, type Phase, type PhaseId } from "../../lib/timeline-lab/phases";
import { InfoHint } from "../../components/ui/InfoHint";

/**
 * 국면 — the session rebuilt as the work arc it moved through.
 *
 * Where 서사 is one continuous thread, this view answers "what stages did this
 * work pass through?" by folding every moment into the canonical arc
 * 탐색 → 결정 → 구현 → 점검 → 정리. Only the phases that actually happened render,
 * so a six-event session and a six-hundred-event session both stay legible.
 *
 * The composition ribbon up top is the glance layer: one bar whose segments are
 * sized by each phase's share of the session, so "where did the effort go" reads
 * before any detail. Hovering a segment lifts its column; clicking scrolls it
 * into view, which matters once the arc is wider than the stage.
 */
export function PhaseFlowView({ view }: { view: MockSession }) {
  const phases = buildPhases(view);
  const [activePhase, setActivePhase] = useState<PhaseId | null>(null);
  const trackRef = useRef<HTMLOListElement>(null);

  if (phases.length === 0) {
    return <div className="lab-empty">이 세션에는 아직 재구성할 이벤트가 없습니다.</div>;
  }

  const total = phases.reduce((sum, phase) => sum + phase.count, 0);

  const focusColumn = (id: PhaseId) => {
    trackRef.current
      ?.querySelector<HTMLElement>(`[data-phase="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  return (
    <div className="lab-phases">
      <header className="lab-phases-head">
        <h4>작업 국면</h4>
        <InfoHint label="국면 설명">
          같은 순간들을 출처가 아니라 작업 단계로 묶었습니다. 위의 띠는 각 국면이
          세션에서 차지하는 비중이고, 아래 카드가 그 안에서 일어난 순간들입니다.
        </InfoHint>
      </header>

      <div className="lab-phase-ribbon" role="img" aria-label="국면별 비중">
        {phases.map((phase) => {
          const pct = Math.round((phase.count / total) * 100);
          return (
            <button
              key={phase.id}
              type="button"
              className={`lab-phase-ribbon-seg${activePhase === phase.id ? " is-active" : ""}`}
              data-tone={phase.tone}
              style={{ flexGrow: phase.count }}
              onMouseEnter={() => setActivePhase(phase.id)}
              onMouseLeave={() => setActivePhase((prev) => (prev === phase.id ? null : prev))}
              onFocus={() => setActivePhase(phase.id)}
              onBlur={() => setActivePhase((prev) => (prev === phase.id ? null : prev))}
              onClick={() => focusColumn(phase.id)}
              aria-label={`${phase.label}, ${phase.count}개, ${pct}퍼센트`}
            >
              <span className="lab-phase-ribbon-label">{phase.label}</span>
              <span className="lab-phase-ribbon-pct">{pct}%</span>
            </button>
          );
        })}
      </div>

      <ol className="lab-phase-track" ref={trackRef}>
        {phases.map((phase, index) => (
          <li key={phase.id} className="lab-phase-cell">
            <PhaseColumn phase={phase} active={activePhase === phase.id} />
            {index < phases.length - 1 ? (
              <ChevronRight size={18} className="lab-phase-arrow" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PhaseColumn({ phase, active }: { phase: Phase; active: boolean }) {
  return (
    <section
      className={`lab-phase${active ? " is-active" : ""}`}
      data-phase={phase.id}
      data-tone={phase.tone}
      aria-label={phase.label}
    >
      <header className="lab-phase-head">
        <div className="lab-phase-title">
          <span className="lab-phase-dot" aria-hidden="true" />
          <h5>{phase.label}</h5>
          <span className="lab-phase-count">{phase.count}</span>
        </div>
        {phase.startLabel ? (
          <span className="lab-phase-range">
            {phase.startLabel}
            {phase.endLabel ? ` – ${phase.endLabel}` : ""}
          </span>
        ) : null}
      </header>
      {phase.decisionCount > 0 || phase.issueCount > 0 ? (
        <div className="lab-phase-meta">
          {phase.decisionCount > 0 ? (
            <span className="lab-phase-metric" data-kind="decision">
              <Flag size={11} aria-hidden="true" />
              {phase.decisionCount}
            </span>
          ) : null}
          {phase.issueCount > 0 ? (
            <span className="lab-phase-metric" data-kind="issue">
              <TriangleAlert size={11} aria-hidden="true" />
              {phase.issueCount}
            </span>
          ) : null}
        </div>
      ) : null}
      <ul className="lab-phase-moments">
        {phase.moments.map((moment) => (
          <li key={moment.id} className="lab-phase-moment" data-tone={moment.tone}>
            <span className="lab-phase-moment-time">{moment.timeLabel || "·"}</span>
            <span className="lab-phase-moment-title">{moment.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
