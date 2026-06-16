/**
 * Report context — the cross-feature derivation of "what data drives the
 * current Reports view".
 *
 * Before this milestone the Reports page composed its `dataBasisLabel`,
 * `evidenceSummary`, and `analysisProviderLabel` from three different
 * helpers (`sessionStatus`, `sessionEvidence`, the report-builder's
 * internal counts). This module returns one snapshot the Reports view
 * (and any future cross-session summarizer) can consume directly.
 */
import type { MockSession } from "../../domain/types";
import { getSessionEvidenceSummary, type SessionEvidenceSummary } from "../evidence";
import type { AnalysisResult } from "../analysis";
import {
  DEFAULT_PRIVACY,
  DEFAULT_SECTIONS,
  REPORT_TYPE_DEFINITIONS,
  SECTION_DEFINITIONS,
  type ReportPrivacyOptions,
  type ReportSectionId,
  type ReportType,
} from "../report/reportBuilder";

export type ReportDataBasis = "demo" | "imports-only" | "imports-plus-analysis" | "no-data";

export type ReportContext = {
  /** Coarse data basis flag for UI badges. */
  dataBasis: ReportDataBasis;
  /** Sentence-style description (matches existing copy in the Reports view). */
  dataBasisLabel: string;
  /** Tone for the data-basis badge. */
  dataBasisTone: "purple" | "blue" | "green" | "gray";
  /** Underlying evidence summary (counts, integration mix, trust mix). */
  evidence: SessionEvidenceSummary;
  /** Whether a real Quick Pass result is available. */
  hasAnalysis: boolean;
  /** Analysis provider label when available. */
  analysisProviderLabel: string | null;
  /** Resume prompt to render alongside the report. */
  resumePrompt: string | null;
};

/**
 * Build the report context. Accepts the optional Quick Pass result so the
 * provider label and resume prompt are accurate when analysis ran.
 */
export function deriveReportContext(args: {
  view: MockSession;
  analysis?: AnalysisResult | null;
  isDemoSession: boolean;
}): ReportContext {
  const evidence = getSessionEvidenceSummary(args.view);
  const analysis = args.analysis ?? null;

  let dataBasis: ReportDataBasis = "no-data";
  let dataBasisLabel = evidence.dataBasis;
  let dataBasisTone: ReportContext["dataBasisTone"] = "gray";

  if (args.isDemoSession) {
    dataBasis = "demo";
    dataBasisLabel = "Demo data";
    dataBasisTone = "purple";
  } else if (analysis) {
    dataBasis = "imports-plus-analysis";
    dataBasisLabel = `${analysis.providerLabel ?? "분석"} analysis`;
    dataBasisTone = "green";
  } else if (evidence.sourceCount > 0) {
    dataBasis = "imports-only";
    dataBasisLabel = "Imported data (no analysis)";
    dataBasisTone = "blue";
  }

  const hasAnalysis = Boolean(analysis);

  return {
    dataBasis,
    dataBasisLabel,
    dataBasisTone,
    evidence,
    hasAnalysis,
    analysisProviderLabel: analysis?.providerLabel ?? null,
    resumePrompt: analysis?.summary.resumePrompt ?? args.view.summary?.resumePrompt ?? null,
  };
}

export type ReportSelectionState = {
  type: ReportType;
  audience: string;
  defaultSections: ReadonlySet<ReportSectionId>;
  defaultPrivacy: ReportPrivacyOptions;
  /** Full list of toggleable sections (id + label + description). */
  availableSections: typeof SECTION_DEFINITIONS;
  /** Full list of report types for the type picker. */
  availableTypes: typeof REPORT_TYPE_DEFINITIONS;
};

export function getReportSelectionDefaults(type: ReportType): ReportSelectionState {
  const definition =
    REPORT_TYPE_DEFINITIONS.find((entry) => entry.id === type) ?? REPORT_TYPE_DEFINITIONS[0];
  return {
    type: definition.id,
    audience: definition.audience,
    defaultSections: new Set(definition.defaultSections),
    defaultPrivacy: { ...definition.defaultPrivacy },
    availableSections: SECTION_DEFINITIONS,
    availableTypes: REPORT_TYPE_DEFINITIONS,
  };
}

export { DEFAULT_PRIVACY, DEFAULT_SECTIONS };
