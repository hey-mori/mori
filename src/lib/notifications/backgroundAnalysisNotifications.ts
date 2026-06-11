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
  const title =
    total > 0
      ? `백그라운드 분석 완료 · ${label} · ${total}건 발견`
      : `백그라운드 분석 완료 · ${label}`;

  return {
    id: `background-analysis:${result.sessionId}`,
    kind: "background_analysis_ready",
    severity: "info",
    title,
    message:
      total > 0
        ? `이슈 ${result.analysis.issues.length} · 결정 ${result.analysis.decisions.length} · 다음 액션 ${result.analysis.nextActions.length}. 자료 탭에서 결과를 검토하세요.`
        : "분석이 완료됐지만 주목할 항목이 없습니다. 자료 탭에서 직접 확인하세요.",
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
