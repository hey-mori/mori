import type { Decision, Issue, MoriMockSession, SourceRef, TimelineEvent } from "../../domain/types";
import type { TimelineDisplayItem } from "../timeline/displayItems";
import { getIntegration, type IntegrationStatus, type RawDataPolicy } from "./sourceRegistry";

/**
 * Source display status with user-friendly labels
 */
export type SourceDisplayStatus = {
  integration: string | null;
  integrationLabel: string;
  status: IntegrationStatus;
  statusLabel: string;
  captureMethod: string;
  trustLabel: string;
  trustTone: "green" | "blue" | "purple";
  rawDataLabel: string;
  privacyNote: string;
};

/**
 * Get display-friendly status information for a source
 */
export function getSourceDisplayStatus(source: SourceRef): SourceDisplayStatus {
  const integration = getIntegration(source.kind);
  
  const statusLabels: Record<IntegrationStatus, string> = {
    implemented: "Available",
    partial: "Partial",
    planned: "Planned",
    mockOnly: "Demo only",
    unavailable: "Unavailable",
  };

  const captureMethods: Record<string, string> = {
    manual: "Manual input",
    explicitImport: "Explicit import",
    desktopCommand: "Desktop command",
    plannedConnector: "Planned connector",
    mock: "Demo data",
  };

  const trustLabels: Record<string, { label: string; tone: "green" | "blue" | "purple" }> = {
    verified: { label: "Verified", tone: "green" },
    observed: { label: "Observed", tone: "blue" },
    inferred: { label: "Inferred", tone: "purple" },
  };

  const rawDataLabels: Record<RawDataPolicy, string> = {
    retained: "Full data retained",
    summaryOnly: "Summary only",
    redacted: "Redacted",
    notCaptured: "Not captured",
  };

  const trustInfo = trustLabels[source.trustLevel] || { label: source.trustLevel, tone: "purple" as const };

  return {
    integration: integration?.id ?? null,
    integrationLabel: integration?.label ?? source.kind,
    status: integration?.status ?? "unavailable",
    statusLabel: integration ? statusLabels[integration.status] : "Unknown",
    captureMethod: integration ? captureMethods[integration.captureMode] ?? integration.captureMode : "Unknown",
    trustLabel: trustInfo.label,
    trustTone: trustInfo.tone,
    rawDataLabel: integration ? rawDataLabels[integration.rawDataPolicy] : "Unknown",
    privacyNote: integration?.privacyNote ?? "No privacy information available.",
  };
}

/**
 * Get trust level label with tone
 */
export function getSourceTrustLabel(trustLevel: string): { label: string; tone: "green" | "blue" | "purple" } {
  const labels: Record<string, { label: string; tone: "green" | "blue" | "purple" }> = {
    verified: { label: "Verified", tone: "green" },
    observed: { label: "Observed", tone: "blue" },
    inferred: { label: "Inferred", tone: "purple" },
  };
  return labels[trustLevel] || { label: trustLevel, tone: "purple" };
}

/**
 * Get raw data policy label
 */
export function getSourceRawDataLabel(policy: string): string {
  const labels: Record<string, string> = {
    retained: "Full data retained",
    summaryOnly: "Summary only",
    redacted: "Redacted",
    notCaptured: "Not captured",
  };
  return labels[policy] ?? policy;
}

/**
 * Evidence source summary for an event
 */
export type EventEvidenceSummary = {
  sourceCount: number;
  sources: SourceRef[];
  trustLevels: { verified: number; observed: number; inferred: number };
  integrations: string[];
};

/**
 * Get evidence sources for a timeline event
 */
export function getEventEvidenceSources(event: TimelineEvent, allSources: SourceRef[]): EventEvidenceSummary {
  const sources = allSources.filter((source) => event.sourceRefs.includes(source.id));
  
  const trustLevels = sources.reduce(
    (acc, source) => {
      acc[source.trustLevel] = (acc[source.trustLevel] || 0) + 1;
      return acc;
    },
    { verified: 0, observed: 0, inferred: 0 } as { verified: number; observed: number; inferred: number },
  );

  const integrations = Array.from(new Set(sources.map((s) => s.kind)));

  return {
    sourceCount: sources.length,
    sources,
    trustLevels,
    integrations,
  };
}

/**
 * Evidence source summary for an issue
 */
export type IssueEvidenceSummary = {
  eventCount: number;
  sourceCount: number;
  events: TimelineEvent[];
  sources: SourceRef[];
  trustLevels: { verified: number; observed: number; inferred: number };
};

/**
 * Get evidence sources for an issue through its source events
 */
export function getIssueEvidenceSources(
  issue: Issue,
  allEvents: TimelineEvent[],
  allSources: SourceRef[],
): IssueEvidenceSummary {
  const events = allEvents.filter((event) => issue.sourceEventIds.includes(event.id));
  const sourceIds = new Set(events.flatMap((event) => event.sourceRefs));
  const sources = allSources.filter((source) => sourceIds.has(source.id));

  const trustLevels = sources.reduce(
    (acc, source) => {
      acc[source.trustLevel] = (acc[source.trustLevel] || 0) + 1;
      return acc;
    },
    { verified: 0, observed: 0, inferred: 0 } as { verified: number; observed: number; inferred: number },
  );

  return {
    eventCount: events.length,
    sourceCount: sources.length,
    events,
    sources,
    trustLevels,
  };
}

/**
 * Evidence source summary for a decision
 */
export type DecisionEvidenceSummary = {
  eventCount: number;
  sourceCount: number;
  directSourceCount: number;
  events: TimelineEvent[];
  sources: SourceRef[];
  directSources: SourceRef[];
  trustLevels: { verified: number; observed: number; inferred: number };
};

/**
 * Get evidence sources for a decision through its source events and direct source references
 */
export function getDecisionEvidenceSources(
  decision: Decision,
  allEvents: TimelineEvent[],
  allSources: SourceRef[],
): DecisionEvidenceSummary {
  const events = allEvents.filter((event) => decision.sourceEventIds.includes(event.id));
  const sourceIds = new Set(events.flatMap((event) => event.sourceRefs));
  const directSources = allSources.filter((source) => decision.relatedSourceIds.includes(source.id));
  
  // Combine sources from events and direct references
  directSources.forEach((source) => sourceIds.add(source.id));
  const sources = allSources.filter((source) => sourceIds.has(source.id));

  const trustLevels = sources.reduce(
    (acc, source) => {
      acc[source.trustLevel] = (acc[source.trustLevel] || 0) + 1;
      return acc;
    },
    { verified: 0, observed: 0, inferred: 0 } as { verified: number; observed: number; inferred: number },
  );

  return {
    eventCount: events.length,
    sourceCount: sources.length,
    directSourceCount: directSources.length,
    events,
    sources,
    directSources,
    trustLevels,
  };
}

/**
 * Bundle evidence summary
 */
export type BundleEvidenceSummary = {
  memberCount: number;
  sourceCount: number;
  sources: SourceRef[];
  integrationMix: Record<string, number>;
  trustMix: { verified: number; observed: number; inferred: number };
};

/**
 * Get evidence summary for a workflow bundle
 */
export function getBundleEvidenceSummary(
  bundle: TimelineDisplayItem,
  allEvents: TimelineEvent[],
  allSources: SourceRef[],
): BundleEvidenceSummary | null {
  if (bundle.kind !== "bundle") return null;

  const memberEvents = allEvents.filter((event) => bundle.memberEventIds.includes(event.id));
  const sourceIds = new Set(memberEvents.flatMap((event) => event.sourceRefs));
  const sources = allSources.filter((source) => sourceIds.has(source.id));

  const integrationMix = sources.reduce(
    (acc, source) => {
      const integration = getIntegration(source.kind);
      const label = integration?.label ?? source.kind;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const trustMix = sources.reduce(
    (acc, source) => {
      acc[source.trustLevel] = (acc[source.trustLevel] || 0) + 1;
      return acc;
    },
    { verified: 0, observed: 0, inferred: 0 } as { verified: number; observed: number; inferred: number },
  );

  return {
    memberCount: memberEvents.length,
    sourceCount: sources.length,
    sources,
    integrationMix,
    trustMix,
  };
}

/**
 * Report evidence summary for the entire session
 */
export type ReportEvidenceSummary = {
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  integrationBreakdown: Record<string, number>;
  trustBreakdown: { verified: number; observed: number; inferred: number };
  hasAnalysis: boolean;
  analysisProvider: string | null;
  dataBasis: string;
};

/**
 * Get evidence summary for report generation
 */
export function getReportEvidenceSummary(sessionView: MoriMockSession): ReportEvidenceSummary {
  const sources = sessionView.sources;
  const events = sessionView.events;
  const issues = sessionView.issues;
  const decisions = sessionView.decisions;

  const integrationBreakdown = sources.reduce(
    (acc, source) => {
      const integration = getIntegration(source.kind);
      const label = integration?.label ?? source.kind;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const trustBreakdown = sources.reduce(
    (acc, source) => {
      acc[source.trustLevel] = (acc[source.trustLevel] || 0) + 1;
      return acc;
    },
    { verified: 0, observed: 0, inferred: 0 } as { verified: number; observed: number; inferred: number },
  );

  const hasAnalysis = issues.length > 0 || decisions.length > 0;
  
  // Determine data basis
  let dataBasis = "No data";
  if (sources.length === 0 && events.length === 0) {
    dataBasis = "No data";
  } else if (hasAnalysis) {
    dataBasis = "Imported sources + Quick Pass analysis";
  } else if (sources.length > 0) {
    dataBasis = "Imported sources only (no analysis yet)";
  }

  return {
    sourceCount: sources.length,
    eventCount: events.length,
    issueCount: issues.length,
    decisionCount: decisions.length,
    integrationBreakdown,
    trustBreakdown,
    hasAnalysis,
    analysisProvider: null, // Will be set by caller if analysis exists
    dataBasis,
  };
}
