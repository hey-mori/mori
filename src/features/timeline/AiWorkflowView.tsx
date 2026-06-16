import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import type { Decision, Issue, NextAction, TimelineEvent } from "../../domain/types";
import type { AnalysisResult } from "../../lib/analysis/analysisTypes";
import {
  buildWorkMoments,
  buildWorkPhases,
  type PhaseMoment,
  type WorkPhase,
} from "../../lib/session/workArc";

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
  onRunQuickPass,
  canRunQuickPass,
  analysisRunning,
}: {
  view: {
    events: TimelineEvent[];
    decisions: Decision[];
    issues: Issue[];
    nextActions: NextAction[];
    summary?: { sessionSummary?: string };
  };
  analysis: AnalysisResult | null;
  selectedItemId: string | null;
  onSelectPhase: (phase: WorkPhase) => void;
  onRunQuickPass: () => void;
  canRunQuickPass: boolean;
  analysisRunning: boolean;
}) {
  // A session has an analysed flow to show when a live analysis produced a
  // summary, OR when the session already carries analysis outputs (a demo
  // session, or a persisted analysed draft reopened without a live run object).
  // An un-analysed draft carries only a placeholder summary and zero outputs,
  // so it still falls through to the honest "분석 전" empty state below.
  const liveSummary = analysis?.summary.sessionSummary?.trim() ?? "";
  const storedSummary = view.summary?.sessionSummary?.trim() ?? "";
  const hasStoredAnalysis =
    view.decisions.length > 0 || view.issues.length > 0 || view.nextActions.length > 0;
  const summary = liveSummary || (hasStoredAnalysis ? storedSummary : "");
  const phases = useMemo(
    () => buildWorkPhases(view.events, view.decisions, view.issues, 6),
    [view.events, view.decisions, view.issues],
  );
  // A steady continuous session has no long pauses to split into phases, but it
  // still has a real progression: the decisions and issues in time order. The
  // collapsed branch below shows that flat arc instead of a bare note.
  const moments = useMemo(
    () => buildWorkMoments(view.events, view.decisions, view.issues, 8),
    [view.events, view.decisions, view.issues],
  );
  const summaryParts = summary.split(/\s*\/\s+/).map((part) => part.trim()).filter(Boolean);
  const summaryLead = summaryParts[0] ?? summary;
  const summaryDetail = summaryParts.slice(1, 4);
  const phaseCount = phases.length >= 2 ? phases.length : moments.length;

  if (!summary) {
    return (
      <div className="ai-workflow ai-workflow-empty" aria-label="AI 흐름 없음">
        <p className="ai-workflow-empty-title">아직 분석 전입니다</p>
        <p>
          분석을 실행하면 AI가 이해한 작업 흐름이 단계별로 정리됩니다. 그 전에도 위의 원본
          보기에서 실제 대화 흐름을 확인할 수 있습니다.
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={Sparkles}
          onClick={onRunQuickPass}
          disabled={!canRunQuickPass}
        >
          {analysisRunning ? "분석 중..." : "분석 실행"}
        </Button>
      </div>
    );
  }

  const selectedAt = phaseTimeForSelection(view.events, selectedItemId);

  return (
    <div className="ai-workflow">
      <header className="ai-workflow-head">
        <div>
          <span>분석 흐름</span>
          <h4>작업의 전개를 시간 순서로 정리했습니다</h4>
        </div>
        <InfoHint label="흐름 설명">
          분석이 이해한 작업 진행 순서입니다. 단계는 실제 이벤트 시간에 맞춰 나뉘며, 선택하면 해당 원본
          대화로 이동합니다.
        </InfoHint>
      </header>

      <section className="ai-workflow-brief" aria-label="분석 흐름 요약">
        <div className="ai-workflow-narrative-block">
          <p className="ai-workflow-narrative">{summaryLead}</p>
          {summaryDetail.length > 0 ? (
            <details className="ai-workflow-more">
              <summary>요약 더 보기</summary>
              {summaryDetail.map((part, i) => (
                <p key={i}>{part}</p>
              ))}
            </details>
          ) : null}
        </div>
        <dl className="ai-workflow-stats">
          <div>
            <dt>단계</dt>
            <dd>{phaseCount || 1}</dd>
          </div>
          <div>
            <dt>결정</dt>
            <dd>{view.decisions.length}</dd>
          </div>
          <div>
            <dt>이슈</dt>
            <dd>{view.issues.length}</dd>
          </div>
        </dl>
      </section>

      {phases.length >= 2 ? (
        <section className="work-arc-section" aria-label="작업 단계">
          <header className="work-arc-section-head">
            <strong>주요 단계</strong>
            <span>{phases.length}개 구간</span>
          </header>
          <ol className="work-arc-steps">
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
                      <PhaseHighlights phase={phase} />
                      <PhaseEvidence phase={phase} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : moments.length > 0 ? (
        <section className="work-arc-section" aria-label="결정과 이슈 흐름">
          <header className="work-arc-section-head">
            <strong>핵심 흐름</strong>
            <span>{moments.length}개 모먼트</span>
          </header>
          <ol className="work-arc-flow">
            {moments.map((moment, index) => (
              <li key={index} className={`work-arc-flow-item is-${moment.kind}`}>
                <span className="work-arc-flow-time">{stamp(new Date(moment.at), false)}</span>
                <span className="work-arc-moment-tag" aria-hidden="true">
                  {moment.kind === "decision" ? "결정" : "이슈"}
                </span>
                <span className="work-arc-flow-text">{moment.title}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="ai-workflow-note">이 세션은 하나의 연속된 흐름입니다.</p>
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
function PhaseHighlights({ phase }: { phase: WorkPhase }) {
  const lead = headlineMoment(phase);
  const rest = phase.moments.filter((moment) => moment !== lead);
  if (rest.length === 0) return null;
  const visible = rest.slice(0, 2);
  const hidden = rest.length - visible.length;
  return (
    <ul className="work-arc-moments">
      {visible.map((moment, index) => (
        <li key={index} className={`work-arc-moment is-${moment.kind}`}>
          <span className="work-arc-moment-tag" aria-hidden="true">
            {moment.kind === "decision" ? "결정" : "이슈"}
          </span>
          <span className="work-arc-moment-text">{moment.title}</span>
        </li>
      ))}
      {hidden > 0 ? (
        <li className="work-arc-moment-more">그 외 {hidden}개 항목</li>
      ) : null}
    </ul>
  );
}

/** Files changed and moment count in the phase's window — what it produced. */
function PhaseEvidence({ phase }: { phase: WorkPhase }) {
  const chips: string[] = [];
  const decisionCount = phase.moments.filter((moment) => moment.kind === "decision").length;
  const issueCount = phase.moments.filter((moment) => moment.kind === "issue").length;
  if (decisionCount > 0) chips.push(`결정 ${decisionCount}`);
  if (issueCount > 0) chips.push(`이슈 ${issueCount}`);
  if (phase.changedFiles > 0) chips.push(`파일 ${phase.changedFiles}개`);
  chips.push(`이벤트 ${phase.eventCount}개`);
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
