import { ChevronDown, ChevronRight, Radar, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import type { BackgroundAnalysisResult } from "../../lib/background-watch/backgroundAnalysis";
import { useBackgroundWatchStore } from "../../app/backgroundWatchStore";

/**
 * Foldable panel for completed background analyses.
 *
 * Shown above the QuickPass section when there are background results waiting.
 * Each row shows the file name, the analysis summary, and counts, with an
 * "이 세션에 적용" action. Applying copies the analysis result into the active
 * session, dismisses the row from the background results store, and lets the
 * user review and modify it like any manually-run Quick Pass. The review gate
 * is unchanged: no memory write happens here.
 */
export function BackgroundAnalysisResultsPanel({
  results,
  onApply,
}: {
  results: BackgroundAnalysisResult[];
  onApply: (result: BackgroundAnalysisResult) => void;
}) {
  const [open, setOpen] = useState(true);
  const dismissAnalysisResult = useBackgroundWatchStore((state) => state.dismissAnalysisResult);

  if (results.length === 0) return null;

  return (
    <section className="bg-analysis-panel">
      <button
        type="button"
        className="bg-analysis-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="bg-analysis-toggle-icon" aria-hidden="true">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="bg-analysis-toggle-label">
          <Radar size={13} aria-hidden="true" />
          백그라운드 분석 결과
        </span>
        <span className="bg-analysis-badge">{results.length}</span>
      </button>

      {open ? (
        <ul className="bg-analysis-list">
          {results.map((result) => (
            <BackgroundAnalysisResultRow
              key={result.sessionId}
              result={result}
              onApply={() => {
                onApply(result);
                dismissAnalysisResult(result.sessionId);
              }}
              onDismiss={() => dismissAnalysisResult(result.sessionId)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BackgroundAnalysisResultRow({
  result,
  onApply,
  onDismiss,
}: {
  result: BackgroundAnalysisResult;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const total =
    result.analysis.issues.length +
    result.analysis.decisions.length +
    result.analysis.nextActions.length;

  const fileName = result.path.split(/[\\/]/).filter(Boolean).pop() ?? result.path;
  const producedAt = new Date(result.producedAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="bg-analysis-row">
      <div className="bg-analysis-row-main">
        <div className="bg-analysis-row-head">
          <strong className="bg-analysis-filename">{fileName}</strong>
          <span className="bg-analysis-meta">{producedAt} · 이벤트 {result.eventCount}개</span>
        </div>
        {result.analysis.summary.sessionSummary ? (
          <p className="bg-analysis-summary">{result.analysis.summary.sessionSummary}</p>
        ) : null}
        <ul className="bg-analysis-counts" aria-label="분석 결과 집계">
          <li>
            <strong>{result.analysis.issues.length}</strong>
            <span>이슈</span>
          </li>
          <li>
            <strong>{result.analysis.decisions.length}</strong>
            <span>결정</span>
          </li>
          <li>
            <strong>{result.analysis.nextActions.length}</strong>
            <span>다음 액션</span>
          </li>
        </ul>
        {total === 0 ? (
          <p className="bg-analysis-empty-note">주목할 항목이 없습니다.</p>
        ) : null}
      </div>
      <div className="bg-analysis-row-actions">
        <Button
          variant="primary"
          onClick={onApply}
          title="이 분석 결과를 현재 세션에 적용합니다."
        >
          세션에 적용
        </Button>
        <button
          type="button"
          className="bg-analysis-dismiss"
          onClick={onDismiss}
          aria-label={`${fileName} 분석 결과 닫기`}
          title="결과 닫기"
        >
          <X size={13} />
        </button>
      </div>
    </li>
  );
}
