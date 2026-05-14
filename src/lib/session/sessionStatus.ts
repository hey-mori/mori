import type { MoriSessionState, SessionMode, SessionSource } from "../../app/sessionStore";

/**
 * Derives clear session status labels for consistent display across pages.
 * Centralizes logic for demo/draft/SQLite status, analysis state, and data counts.
 */

export type SessionStatusLabels = {
  // Mode
  isDemoSession: boolean;
  isDraftSession: boolean;
  isDesktopSqliteBacked: boolean;
  
  // Source
  sourceLabel: string;
  sourceDetail: string;
  sourceTone: "purple" | "blue" | "green";
  
  // Analysis
  hasAnalysis: boolean;
  analysisProviderLabel: string | null;
  analysisStatusLabel: string;
  analysisTone: "gray" | "orange" | "green" | "red";
  
  // Counts
  importCount: number;
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  
  // Data basis for reports
  dataBasisLabel: string;
  dataBasisTone: "purple" | "blue" | "green";
};

export function deriveSessionStatus(
  state: MoriSessionState,
  viewCounts?: {
    sourceCount?: number;
    eventCount?: number;
    issueCount?: number;
    decisionCount?: number;
    nextActionCount?: number;
  }
): SessionStatusLabels {
  const isDemoSession = !state.draft;
  const isDraftSession = Boolean(state.draft);
  const isDesktopSqliteBacked = state.source === "desktop-sqlite";
  
  // Source labels
  let sourceLabel: string;
  let sourceDetail: string;
  let sourceTone: "purple" | "blue" | "green";
  
  if (state.source === "demo") {
    sourceLabel = "Demo";
    sourceDetail = "Reference data only";
    sourceTone = "purple";
  } else if (state.source === "browser-draft") {
    sourceLabel = "Browser Draft";
    sourceDetail = "Stored in browser localStorage";
    sourceTone = "blue";
  } else {
    sourceLabel = "Desktop SQLite";
    sourceDetail = "Saved to local database";
    sourceTone = "green";
  }
  
  // Analysis labels
  const hasAnalysis = Boolean(state.draft && state.analysis);
  const analysisProviderLabel = state.analysisProviderLabel;
  
  let analysisStatusLabel: string;
  let analysisTone: "gray" | "orange" | "green" | "red";
  
  switch (state.analysisStatus) {
    case "idle":
      analysisStatusLabel = hasAnalysis ? "Analysis ready" : "No analysis yet";
      analysisTone = hasAnalysis ? "green" : "gray";
      break;
    case "running":
      analysisStatusLabel = "Running Quick Pass...";
      analysisTone = "orange";
      break;
    case "succeeded":
      analysisStatusLabel = "Analysis complete";
      analysisTone = "green";
      break;
    case "failed":
      analysisStatusLabel = "Analysis failed";
      analysisTone = "red";
      break;
  }
  
  // Data basis for reports
  let dataBasisLabel: string;
  let dataBasisTone: "purple" | "blue" | "green";
  
  if (isDemoSession) {
    dataBasisLabel = "Demo data";
    dataBasisTone = "purple";
  } else if (hasAnalysis) {
    dataBasisLabel = `${analysisProviderLabel ?? "Quick Pass"} analysis`;
    dataBasisTone = "green";
  } else {
    dataBasisLabel = "Imported data (no analysis)";
    dataBasisTone = "blue";
  }
  
  return {
    isDemoSession,
    isDraftSession,
    isDesktopSqliteBacked,
    sourceLabel,
    sourceDetail,
    sourceTone,
    hasAnalysis,
    analysisProviderLabel,
    analysisStatusLabel,
    analysisTone,
    importCount: state.imports.length,
    sourceCount: viewCounts?.sourceCount ?? 0,
    eventCount: viewCounts?.eventCount ?? 0,
    issueCount: viewCounts?.issueCount ?? (state.analysis?.issues.length ?? 0),
    decisionCount: viewCounts?.decisionCount ?? (state.analysis?.decisions.length ?? 0),
    nextActionCount: viewCounts?.nextActionCount ?? (state.analysis?.nextActions.length ?? 0),
    dataBasisLabel,
    dataBasisTone,
  };
}
