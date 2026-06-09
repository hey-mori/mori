import type { AnalysisRunStatus } from "./analysisTypes";

/**
 * Display derivation for the Quick Pass analysis status.
 *
 * The Evidence Hub used to colour its analysis-status badge with an inline
 * `status === "running" ? "purple" : …` ternary and carry its own Korean
 * label function. This module makes the badge tone and label a typed
 * function of the `AnalysisRunStatus` enum so the status renders
 * consistently and can never be derived from a translated label.
 */

/** Badge tone for a Quick Pass analysis status. */
export type AnalysisStatusTone = "gray" | "orange" | "green" | "red";

const ANALYSIS_STATUS_TONE: Record<AnalysisRunStatus, AnalysisStatusTone> = {
  idle: "gray",
  running: "orange",
  succeeded: "green",
  failed: "red",
};

const ANALYSIS_STATUS_LABEL: Record<AnalysisRunStatus, string> = {
  idle: "대기 중",
  running: "실행 중",
  succeeded: "완료",
  failed: "실패",
};

export function getAnalysisStatusTone(
  status: AnalysisRunStatus,
): AnalysisStatusTone {
  return ANALYSIS_STATUS_TONE[status];
}

export function describeAnalysisStatus(status: AnalysisRunStatus): string {
  return ANALYSIS_STATUS_LABEL[status];
}

/**
 * Detect, from a persisted analysis result's notes, that the run fell back
 * to the heuristic because the local LLM failed, and return a prominent
 * Korean notice (with the failure reason). Returns null when no such
 * fallback happened — the deterministic engine chosen on purpose is not a
 * failure. Returns null when no such fallback happened — the deterministic
 * engine chosen on purpose is not a failure. Reads the note shape the run loop
 * writes (Korean), and the legacy English shape so older persisted results
 * still surface the reason:
 *   `<label> 분석 실패: <reason> · 규칙 기반으로 대체했습니다.`
 *   `<label> failed: <reason>. Fell back to <deterministic>.`
 */
export function getQuickPassFallbackNotice(notes: readonly string[]): string | null {
  for (const note of notes) {
    const match =
      /분석 실패:\s*(.+?)\s*·\s*규칙 기반/.exec(note) ?? /failed:\s*(.+?)\.\s*Fell back to/i.exec(note);
    if (match) {
      const reason = match[1].trim();
      return `로컬 LLM 분석에 실패해 규칙 기반(휴리스틱) 결과를 표시하고 있습니다. 사유: ${reason}. 설정에서 엔진과 모델 이름을 확인하세요.`;
    }
  }
  return null;
}
