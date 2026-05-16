/**
 * Backward-compat barrel.
 *
 * This file used to own ~330 lines of source-display + evidence-aggregation
 * logic. As part of the Modular Architecture Foundation milestone the body
 * moved to `src/lib/evidence/` so the two concerns can live independently:
 *
 *   - Trust + provenance display    → `src/lib/evidence/{trust,provenance}.ts`
 *   - Evidence joins / aggregation  → `src/lib/evidence/sourceLinks.ts`
 *
 * Every previously-exported name continues to work. New code should import
 * directly from `src/lib/evidence`.
 */
import type { SourceRef } from "../../domain/types";
import {
  getProvenanceDisplay,
  getTrustDisplay,
  getRawDataPolicyLabel,
} from "../evidence";

export type {
  EventEvidenceSummary,
  IssueEvidenceSummary,
  DecisionEvidenceSummary,
  BundleEvidenceSummary,
  SessionEvidenceSummary as ReportEvidenceSummary,
} from "../evidence";

export {
  getEvidenceSourcesForEvent as getEventEvidenceSources,
  getIssueEvidenceSources,
  getDecisionEvidenceSources,
  getBundleEvidenceSummary,
  getSessionEvidenceSummary as getReportEvidenceSummary,
} from "../evidence";

/**
 * Display-status row preserved for existing callers.
 */
export type SourceDisplayStatus = {
  integration: string | null;
  integrationLabel: string;
  status: ReturnType<typeof getProvenanceDisplay>["status"];
  statusLabel: string;
  captureMethod: string;
  trustLabel: string;
  trustTone: "green" | "blue" | "purple";
  rawDataLabel: string;
  rawDataTone: "blue" | "orange" | "purple" | "gray";
  privacyNote: string;
};

export function getSourceDisplayStatus(source: SourceRef): SourceDisplayStatus {
  return getProvenanceDisplay(source);
}

/** Legacy short-form helpers retained for compatibility. */
export function getSourceTrustLabel(trustLevel: string): { label: string; tone: "green" | "blue" | "purple" } {
  // For valid trust levels, return the canonical label + tone.
  if (trustLevel === "verified" || trustLevel === "observed" || trustLevel === "inferred") {
    const display = getTrustDisplay(trustLevel);
    return { label: display.label, tone: display.tone };
  }
  // Legacy contract: unknown strings echo through with purple as the fallback tone.
  return { label: trustLevel, tone: "purple" };
}

export function getSourceRawDataLabel(policy: string): string {
  return getRawDataPolicyLabel(policy as never);
}
