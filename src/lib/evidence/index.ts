/**
 * Public surface for the evidence module.
 *
 * Three concerns:
 *   - `trust.ts`        — TrustLevel display + confidence buckets.
 *   - `provenance.ts`   — SourceRef → integration / capture method / privacy.
 *   - `sourceLinks.ts`  — Evidence summaries joining events / issues /
 *                          decisions / bundles back to their SourceRefs.
 *
 * New code should import from this barrel; legacy callers continue to use
 * `sources/traceability.ts` which now re-exports the same helpers.
 */
export {
  getTrustDisplay,
  getTrustLabel,
  getTrustTone,
  getConfidenceTone,
  describeConfidence,
  type TrustDisplay,
  type TrustTone,
} from "./trust";

export {
  getSourceDisplayName,
  getCaptureMethodLabel,
  getRawDataPolicyLabel,
  getRawDataPolicyTone,
  getIntegrationStatusLabel,
  getProvenanceDisplay,
  getProvenanceSummary,
  type ProvenanceDisplay,
  type ProvenanceSummary,
  type RawDataTone,
} from "./provenance";

export {
  getEvidenceCountForEvent,
  getEvidenceSourcesForEvent,
  getIssueEvidenceSources,
  getDecisionEvidenceSources,
  getBundleEvidenceSummary,
  getSessionEvidenceSummary,
  type TrustMix,
  type EventEvidenceSummary,
  type IssueEvidenceSummary,
  type DecisionEvidenceSummary,
  type BundleEvidenceSummary,
  type SessionEvidenceSummary,
} from "./sourceLinks";
