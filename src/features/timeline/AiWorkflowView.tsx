import { useMemo } from "react";
import { InfoHint } from "../../components/ui/InfoHint";
import type { Decision, Issue, TimelineEvent } from "../../domain/types";
import type { AnalysisResult } from "../../lib/analysis/analysisTypes";
import { buildWorkPhases, type PhaseMoment, type WorkPhase } from "../../lib/session/workArc";

/**
 * AI 흐름 — one of the two primary 흐름-tab views.
 *
 * Where 원본 is the honest raw conversation stream, this is the AI's reading of
 * HOW the work progressed: the analysis narrative leads, then the work is split
 * into time-grounded phases (real event timestamps, via `buildWorkPhases`). Each
 * phase is headlined by the KEY DECISION made in its window — the AI-understood
 * outcome — not the raw user request, and lists the issues and decisions it
 * surfaced in time order plus the files it changed. Clicking a phase drills into
 * 원본 for that moment.
 */
export function AiWorkflowView({
  view,
  analysis,
  selectedItemId,
  onSelectPhase,
  onRunQuickPass: _onRunQuickPass,
  canRunQuickPass: _canRunQuickPass,
}: {
  view: { events: TimelineEvent[]; decisions: Decision[]; issues: Issue[] };
  analysis: AnalysisResult | null;
  selectedItemId: string | null;
  onSelectPhase: (phase: WorkPhase) => void;
  onRunQuickPass: () => void;
  canRunQuickPass: boolean;
}) {
  const summary = analysis?.summary.sessionSummary?.trim() ?? "";
  const phases = useMemo(
    () => buildWorkPhases(view.events, view.decisions, view.issues, 6),
    [view.events, view.decisions, view.issues],
  );

  if (!summary) {
    return (
      <div className="ai-workflow ai-workflow-empty" aria-label="AI 흐름 없음">
        <p className="ai-workflow-empty-title">아직 분석 전입니다</p>
        <p>
          분석을 실행하면 AI가 이해한 작업 흐름이 단계별로 정리됩니다. 그 전에도 위의 원본
          보기에서 실제 대화 흐름을 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  const selectedAt = phaseTimeForSelection(view.events, selectedItemId);

  return (
    <div className="ai-workflow">
      <header className="ai-workflow-head">
        <h4>흐름</h4>
        <InfoHint label="흐름 설명">
          AI가 이해한 작업 진행 순서입니다. 시간 구간별로 무엇을 결정하고 어떤 파일을 바꿨는지 보여주고,
          단계를 누르면 그 구간의 원본 대화로 이동합니다.
        </InfoHint>
      </header>
      {summary.split(/\s*\/\s+/).map((part, i) => (
        <p key={i} className="ai-workflow-narrative">{part.trim()}</p>
      ))}

      {phases.length >= 2 ? (
        <ol className="work-arc-steps" aria-label="작업 단계">
          {phases.map((phase, index) => {
            const headline = phaseHeadline(phase);
            const active =
              selectedAt !== null &&
              selectedAt >= new Date(phase.startIso).getTime() &&
              selectedAt <= new Date(phase.endIso).getTime();
            return (
              <li key={index} className="work-arc-step">
                <button
                  type="button"
                  className={`work-arc-step-btn${active ? " is-active" : ""}`}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelectPhase(phase)}
                >
                  <span className="work-arc-marker" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="work-arc-body">
                    <span className="work-arc-time">{formatPhaseRange(phase)}</span>
                    <span className="work-arc-text">{headline}</span>
                    <PhaseMoments phase={phase} />
                    <PhaseEvidence phase={phase} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="ai-workflow-note">
          이 세션은 하나의 연속된 흐름이라 단계로 나뉘지 않았습니다.
        </p>
      )}
    </div>
  );
}

/**
 * A phase's headline: the KEY DECISION made in its window (the AI-understood
 * outcome) wins over the raw opening request — the request read as mechanical
 * when it was the headline. Falls back to the first moment (an issue, when the
 * phase surfaced one but made no decision), then to the cleaned request.
 */
export function phaseHeadline(phase: Pick<WorkPhase, "moments" | "label">): string {
  return headlineMoment(phase)?.title ?? phase.label;
}

/** The moment that leads the phase: the first decision (the AI-understood
 *  outcome) if any, else the first thing that happened in the window. */
function headlineMoment(phase: Pick<WorkPhase, "moments">): PhaseMoment | null {
  return phase.moments.find((moment) => moment.kind === "decision") ?? phase.moments[0] ?? null;
}

/**
 * The phase's issues and decisions in time order, minus the one already shown
 * as the headline — so the arc lists what issues and decisions there were, each
 * tagged 결정 / 이슈, without repeating the lead.
 */
function PhaseMoments({ phase }: { phase: WorkPhase }) {
  const lead = headlineMoment(phase);
  const rest = phase.moments.filter((moment) => moment !== lead);
  if (rest.length === 0) return null;
  return (
    <ul className="work-arc-moments">
      {rest.map((moment, index) => (
        <li key={index} className={`work-arc-moment is-${moment.kind}`}>
          <span className="work-arc-moment-tag" aria-hidden="true">
            {moment.kind === "decision" ? "결정" : "이슈"}
          </span>
          <span className="work-arc-moment-text">{moment.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** Files changed and moment count in the phase's window — what it produced. */
function PhaseEvidence({ phase }: { phase: WorkPhase }) {
  const chips: string[] = [];
  if (phase.changedFiles > 0) chips.push(`파일 ${phase.changedFiles}개`);
  chips.push(`모먼트 ${phase.eventCount}개`);
  return (
    <span className="work-arc-evidence">
      {chips.map((chip, index) => (
        <span key={index} className="work-arc-ev">
          {chip}
        </span>
      ))}
    </span>
  );
}

/** Start time of the currently-selected event, for highlighting its phase. */
function phaseTimeForSelection(events: TimelineEvent[], selectedItemId: string | null): number | null {
  if (!selectedItemId) return null;
  const event = events.find((candidate) => candidate.id === selectedItemId);
  if (!event?.start) return null;
  const at = new Date(event.start).getTime();
  return Number.isFinite(at) ? at : null;
}

/** "06-01 10:17 → 15:59" (same day) or "06-01 10:17 → 06-02 07:30". */
function formatPhaseRange(phase: WorkPhase): string {
  const start = new Date(phase.startIso);
  const end = new Date(phase.endIso);
  if (!Number.isFinite(start.getTime())) return "";
  const startLabel = stamp(start, true);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) return startLabel;
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  return `${startLabel} → ${stamp(end, !sameDay)}`;
}

function stamp(date: Date, withDate: boolean): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (!withDate) return `${hh}:${mm}`;
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mo}-${dd} ${hh}:${mm}`;
}
