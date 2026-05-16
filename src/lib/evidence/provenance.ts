/**
 * Provenance — how a piece of evidence reached Mori, with what privacy
 * policy, and from which integration. This module is the single answer to
 * "show me the display labels for a SourceRef".
 *
 * Previously every surface (`EventInspector`, `SourceDetailPanel`,
 * `ImportedSourceRow`, `SourceSummaryCard`, `ExtractedEventCard`, …) had its
 * own labels. Those callers still go through `getSourceDisplayStatus` which
 * now lives here; we kept the re-export in `sources/traceability.ts` to
 * avoid touching the import paths.
 */
import type { SourceRef } from "../../domain/types";
import {
  getIntegration,
  type IntegrationStatus,
  type CaptureMode,
  type RawDataPolicy,
} from "../sources/sourceRegistry";
import { getTrustDisplay, type TrustTone } from "./trust";

export type ProvenanceDisplay = {
  /** Integration id (e.g. `claudeTranscript`) or null when unknown. */
  integration: string | null;
  /** Display name for the integration (e.g. "Claude Transcript"). */
  integrationLabel: string;
  /** Integration status taxonomy (Available / Partial / Planned / Demo only / Unavailable). */
  status: IntegrationStatus;
  statusLabel: string;
  /** Capture method label (e.g. "Manual input", "Desktop command"). */
  captureMethod: string;
  /** Trust display fields. */
  trustLabel: string;
  trustTone: TrustTone;
  /** Raw data policy label (e.g. "Summary only"). */
  rawDataLabel: string;
  /** Verbatim privacy note from the integration row. */
  privacyNote: string;
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  implemented: "Available",
  partial: "Partial",
  planned: "Planned",
  mockOnly: "Demo only",
  unavailable: "Unavailable",
};

const CAPTURE_METHOD_LABEL: Record<CaptureMode, string> = {
  manual: "수동 입력",
  explicitImport: "명시적 가져오기",
  desktopCommand: "데스크톱 명령",
  plannedConnector: "예정된 커넥터",
  mock: "데모 데이터",
};

const RAW_DATA_LABEL: Record<RawDataPolicy, string> = {
  retained: "원본 전체 보관",
  summaryOnly: "요약만 보관",
  redacted: "민감정보 제거됨",
  notCaptured: "원본 미보관",
};

export function getSourceDisplayName(source: SourceRef): string {
  const integration = getIntegration(source.kind);
  return integration?.label ?? source.kind;
}

export function getCaptureMethodLabel(mode: CaptureMode): string {
  return CAPTURE_METHOD_LABEL[mode] ?? mode;
}

export function getRawDataPolicyLabel(policy: RawDataPolicy): string {
  return RAW_DATA_LABEL[policy] ?? policy;
}

export function getIntegrationStatusLabel(status: IntegrationStatus): string {
  return STATUS_LABEL[status] ?? status;
}

/**
 * Build the canonical display row for a SourceRef. Consumers downstream
 * never read `getIntegration(source.kind)` directly — they call this.
 */
export function getProvenanceDisplay(source: SourceRef): ProvenanceDisplay {
  const integration = getIntegration(source.kind);
  const trust = getTrustDisplay(source.trustLevel);
  return {
    integration: integration?.id ?? null,
    integrationLabel: integration?.label ?? source.kind,
    status: integration?.status ?? "unavailable",
    statusLabel: integration ? STATUS_LABEL[integration.status] : "Unknown",
    captureMethod: integration ? CAPTURE_METHOD_LABEL[integration.captureMode] ?? integration.captureMode : "Unknown",
    trustLabel: trust.label,
    trustTone: trust.tone,
    rawDataLabel: integration ? RAW_DATA_LABEL[integration.rawDataPolicy] ?? integration.rawDataPolicy : "Unknown",
    privacyNote: integration?.privacyNote ?? "개인정보 정책 정보가 없습니다.",
  };
}

export type ProvenanceSummary = {
  sourceId: string;
  title: string;
  detail: string;
  integrationLabel: string;
  captureMethod: string;
  trustLabel: string;
  rawDataLabel: string;
  capturedAt: string;
};

/**
 * One-line provenance row, useful for compact inspector lists. Distinct from
 * `getProvenanceDisplay`: this returns the data points the UI usually
 * concatenates ("Claude Transcript · Manual input · Summary only"), so we
 * never repeat that formatting logic in JSX.
 */
export function getProvenanceSummary(source: SourceRef): ProvenanceSummary {
  const display = getProvenanceDisplay(source);
  return {
    sourceId: source.id,
    title: source.title,
    detail: source.detail,
    integrationLabel: display.integrationLabel,
    captureMethod: display.captureMethod,
    trustLabel: display.trustLabel,
    rawDataLabel: display.rawDataLabel,
    capturedAt: source.capturedAt,
  };
}
