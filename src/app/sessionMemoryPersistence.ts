import type { AnalysisResult } from "../lib/analysis";
import type { DraftRepository } from "../lib/storage/storageTypes";

/**
 * Snapshot a session analysis into the compact durable memory body consumed by
 * cross-session Project Memory. Events and sources stay in session imports;
 * this persists only the reviewed guidance fields.
 */
export function persistMemoryBodyFromAnalysis(
  repository: DraftRepository,
  sessionId: string,
  analysis: AnalysisResult,
): void {
  repository.saveSessionMemoryBody(sessionId, {
    issues: analysis.issues,
    decisions: analysis.decisions,
    nextActions: analysis.nextActions,
    summarySnapshot: {
      sessionSummary: analysis.summary.sessionSummary,
      resumePrompt: analysis.summary.resumePrompt,
      generatedAt: analysis.generatedAt,
    },
  });
}
