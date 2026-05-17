import type { MoriAnalysisStatus } from "./analysisTypes";

/**
 * Display derivation for the Quick Pass analysis status.
 *
 * The Evidence Hub used to colour its analysis-status badge with an inline
 * `status === "running" ? "purple" : …` ternary and carry its own Korean
 * label function. This module makes the badge tone and label a typed
 * function of the `MoriAnalysisStatus` enum so the status renders
 * consistently and can never be derived from a translated label.
 */

/** Badge tone for a Quick Pass analysis status. */
export type AnalysisStatusTone = "gray" | "orange" | "green" | "red";

const ANALYSIS_STATUS_TONE: Record<MoriAnalysisStatus, AnalysisStatusTone> = {
  idle: "gray",
  running: "orange",
  succeeded: "green",
  failed: "red",
};

const ANALYSIS_STATUS_LABEL: Record<MoriAnalysisStatus, string> = {
  idle: "대기 중",
  running: "실행 중",
  succeeded: "완료",
  failed: "실패",
};

export function getAnalysisStatusTone(
  status: MoriAnalysisStatus,
): AnalysisStatusTone {
  return ANALYSIS_STATUS_TONE[status];
}

export function describeAnalysisStatus(status: MoriAnalysisStatus): string {
  return ANALYSIS_STATUS_LABEL[status];
}
