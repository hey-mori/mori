import { useEffect, useState } from "react";
import { useSessionStore } from "../../app/sessionStore";
import {
  buildAnalysisRunHistoryViewModel,
  type AnalysisRunHistoryViewModel,
} from "../../lib/analysis";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import { InfoHint } from "../../components/ui/InfoHint";

/**
 * Surfaces the active session's analysis run history on the Analysis status view:
 * the adopted run's reason (model, time, confidence, counts) always, and
 * a disclosure listing every run with the change-versus-previous and an
 * adopt action once a re-analysis has produced more than one run.
 *
 * Re-reads the history whenever `analysis` changes (a new run or an
 * adoption) so the panel stays in step without holding history in store
 * state. Renders nothing when the session has no analysis, so it never
 * competes with the analysis empty state.
 */
/**
 * Drop the legacy "Quick Pass" wording from a stored engine label so the UI
 * reads "규칙 기반 분석" / "Ollama 분석 (…)" — the product no longer uses the
 * "Quick Pass" name on user surfaces. Labels stamped before this change still
 * render cleanly without re-running analysis.
 */
function cleanEngineLabel(label: string): string {
  return label.replace(/\s*Quick Pass/gi, " 분석").replace(/\s{2,}/g, " ").trim();
}

export function AnalysisRunHistoryPanel() {
  const analysis = useSessionStore((state) => state.analysis);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const loadAnalysisRunHistory = useSessionStore((state) => state.loadAnalysisRunHistory);
  const selectAnalysisRun = useSessionStore((state) => state.selectAnalysisRun);
  const [viewModel, setViewModel] = useState<AnalysisRunHistoryViewModel | null>(null);

  useEffect(() => {
    const history = loadAnalysisRunHistory();
    setViewModel(history ? buildAnalysisRunHistoryViewModel(history) : null);
  }, [analysis, analysisStatus, loadAnalysisRunHistory]);

  if (!viewModel || viewModel.runCount === 0) return null;

  const current = viewModel.rows.find((row) => row.isCurrent) ?? viewModel.rows[0];

  const adopt = (runId: string) => {
    if (!selectAnalysisRun(runId)) return;
    const history = loadAnalysisRunHistory();
    setViewModel(history ? buildAnalysisRunHistoryViewModel(history) : null);
  };

  return (
    <section className="analysis-runs" aria-label="분석 실행 기록">
      <div className="analysis-runs-current">
        <span className="analysis-runs-provider">{cleanEngineLabel(current.providerLabel)}</span>
        <span className="analysis-runs-meta">
          이슈 {current.reason.elementCounts.issues} · 결정{" "}
          {current.reason.elementCounts.decisions}
        </span>
        <InfoHint label="분석 기록 설명">
          분석을 다시 실행해도 이전 분석은 사라지지 않고 기록으로 남습니다. 각 실행은 사용한 모델,
          시각, 추출 근거를 함께 보관하므로 다른 모델로 재분석해 결과를 비교하거나 이전 분석으로
          되돌릴 수 있습니다.
        </InfoHint>
      </div>

      {viewModel.hasMultipleRuns ? (
        <details className="analysis-runs-disclosure">
          <summary>실행 {viewModel.runCount}개 · 비교 및 전환</summary>
          <ul className="analysis-runs-list">
            {viewModel.rows.map((row) => (
              <li
                key={row.runId}
                className={`analysis-run-row${row.isCurrent ? " is-current" : ""}`}
              >
                <div className="analysis-run-row-head">
                  <span className="analysis-run-row-provider">{cleanEngineLabel(row.providerLabel)}</span>
                  {row.isCurrent ? (
                    <span className="analysis-run-row-badge">사용 중</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => adopt(row.runId)}
                    >
                      이 분석 사용
                    </button>
                  )}
                </div>
                <div className="analysis-run-row-meta">
                  {formatClaudeRelativeKo(row.generatedAt)}
                </div>
                <div
                  className={`analysis-run-row-change${row.changeSummary ? "" : " is-base"}`}
                >
                  {row.changeSummary ? `이전 대비 ${row.changeSummary}` : "최초 분석"}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
