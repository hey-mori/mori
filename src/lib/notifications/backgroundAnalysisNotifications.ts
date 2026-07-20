import type { CompanionNotification } from "./notification";
import type { BackgroundAnalysisResult } from "../background-watch/backgroundAnalysis";

/**
 * Build "백그라운드 분석 완료" notifications from completed background analyses.
 *
 * Each completed analysis becomes a feed event pointing at the 자료 surface
 * (evidence tab), where the analysis result can be reviewed. The user still
 * decides what to do with it — nothing was written to memory. Id is stable
 * per sessionId so dedupe never doubles a result between ticks.
 */
export function buildBackgroundAnalysisNotifications(
  results: readonly BackgroundAnalysisResult[],
): CompanionNotification[] {
  return [...results].map(toNotification);
}

function toNotification(result: BackgroundAnalysisResult): CompanionNotification {
  const total =
    result.analysis.issues.length +
    result.analysis.decisions.length +
    result.analysis.nextActions.length;

  const label = basename(result.path);
  // The title is a status a person would say, not a log line: no internal
  // "백그라운드" wording and no `·`-chained fragments.
  const title = total > 0 ? `분석 완료 · ${total}건 발견` : "분석 완료";

  return {
    id: `background-analysis:${result.sessionId}`,
    kind: "background_analysis_ready",
    severity: "info",
    title,
    message:
      total > 0
        ? `${label}에서 이슈 ${result.analysis.issues.length}건, 결정 ${result.analysis.decisions.length}건, 다음 할 일 ${result.analysis.nextActions.length}건을 찾았습니다.`
        : `${label} 분석을 마쳤습니다. 주목할 항목은 없었습니다.`,
    basis: "inferred",
    linkedItemIds: [],
    evidenceRefs: [],
    actionLabel: "자료 열기",
    actionTarget: { kind: "view", view: "evidence" },
    createdAt: result.producedAt,
  };
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
