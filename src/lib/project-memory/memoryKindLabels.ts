import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

/**
 * Korean display labels for accepted-memory kinds. Two private copies of this
 * map already exist (reportBuilder, projectMemoryResumePrompt); this exported
 * one is for UI surfaces so a third private copy never appears. Consolidating
 * the older two onto this module is a follow-up cleanup.
 */
export const MEMORY_KIND_LABEL: Record<StoredAcceptedProjectMemory["kind"], string> = {
  promotedDecision: "결정",
  recurringIssue: "반복 이슈",
  keyEvidence: "근거",
  unresolvedRisk: "리스크",
  contradiction: "상충",
  staleMemory: "오래된 메모리",
  nextSessionRecommendation: "다음 세션",
};

export function memoryKindLabel(kind: StoredAcceptedProjectMemory["kind"]): string {
  return MEMORY_KIND_LABEL[kind] ?? kind;
}
