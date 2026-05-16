/**
 * Evidence linking — pure derivations that join a TimelineEvent / Issue /
 * Decision / Bundle back to the SourceRefs that justify it.
 *
 * Previously these helpers lived in `sources/traceability.ts` mixed with
 * trust / status labels. We split them so JSX never has to import both
 * "display" code and "join" code from the same file.
 *
 * Backward compatibility: `sources/traceability.ts` re-exports each helper
 * by its original name so existing callers continue to work unchanged.
 */
import type {
  Decision,
  Issue,
  MoriMockSession,
  SourceRef,
  TimelineEvent,
  TrustLevel,
} from "../../domain/types";
import type { TimelineDisplayItem } from "../timeline/displayItems";
import { getIntegration } from "../sources/sourceRegistry";

export type TrustMix = { verified: number; observed: number; inferred: number };

function emptyTrustMix(): TrustMix {
  return { verified: 0, observed: 0, inferred: 0 };
}

function trustMixFromSources(sources: SourceRef[]): TrustMix {
  return sources.reduce<TrustMix>((acc, source) => {
    acc[source.trustLevel as TrustLevel] = (acc[source.trustLevel as TrustLevel] ?? 0) + 1;
    return acc;
  }, emptyTrustMix());
}

export function getEvidenceCountForEvent(event: TimelineEvent): number {
  return event.sourceRefs.length;
}

export type EventEvidenceSummary = {
  sourceCount: number;
  sources: SourceRef[];
  trustLevels: TrustMix;
  integrations: string[];
};

export function getEvidenceSourcesForEvent(event: TimelineEvent, allSources: SourceRef[]): EventEvidenceSummary {
  const sources = allSources.filter((source) => event.sourceRefs.includes(source.id));
  return {
    sourceCount: sources.length,
    sources,
    trustLevels: trustMixFromSources(sources),
    integrations: Array.from(new Set(sources.map((source) => source.kind))),
  };
}

export type IssueEvidenceSummary = {
  eventCount: number;
  sourceCount: number;
  events: TimelineEvent[];
  sources: SourceRef[];
  trustLevels: TrustMix;
};

export function getIssueEvidenceSources(
  issue: Issue,
  allEvents: TimelineEvent[],
  allSources: SourceRef[],
): IssueEvidenceSummary {
  const events = allEvents.filter((event) => issue.sourceEventIds.includes(event.id));
  const sourceIds = new Set(events.flatMap((event) => event.sourceRefs));
  const sources = allSources.filter((source) => sourceIds.has(source.id));
  return {
    eventCount: events.length,
    sourceCount: sources.length,
    events,
    sources,
    trustLevels: trustMixFromSources(sources),
  };
}

export type DecisionEvidenceSummary = {
  eventCount: number;
  sourceCount: number;
  directSourceCount: number;
  events: TimelineEvent[];
  sources: SourceRef[];
  directSources: SourceRef[];
  trustLevels: TrustMix;
};

export function getDecisionEvidenceSources(
  decision: Decision,
  allEvents: TimelineEvent[],
  allSources: SourceRef[],
): DecisionEvidenceSummary {
  const events = allEvents.filter((event) => decision.sourceEventIds.includes(event.id));
  const sourceIds = new Set(events.flatMap((event) => event.sourceRefs));
  const directSources = allSources.filter((source) => decision.relatedSourceIds.includes(source.id));
  for (const source of directSources) {
    sourceIds.add(source.id);
  }
  const sources = allSources.filter((source) => sourceIds.has(source.id));
  return {
    eventCount: events.length,
    sourceCount: sources.length,
    directSourceCount: directSources.length,
    events,
    sources,
    directSources,
    trustLevels: trustMixFromSources(sources),
  };
}

export type BundleEvidenceSummary = {
  memberCount: number;
  sourceCount: number;
  sources: SourceRef[];
  integrationMix: Record<string, number>;
  trustMix: TrustMix;
};

export function getBundleEvidenceSummary(
  bundle: TimelineDisplayItem,
  allEvents: TimelineEvent[],
  allSources: SourceRef[],
): BundleEvidenceSummary | null {
  if (bundle.kind !== "bundle") return null;
  const memberEvents = allEvents.filter((event) => bundle.memberEventIds.includes(event.id));
  const sourceIds = new Set(memberEvents.flatMap((event) => event.sourceRefs));
  const sources = allSources.filter((source) => sourceIds.has(source.id));

  const integrationMix = sources.reduce<Record<string, number>>((acc, source) => {
    const integration = getIntegration(source.kind);
    const label = integration?.label ?? source.kind;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  return {
    memberCount: memberEvents.length,
    sourceCount: sources.length,
    sources,
    integrationMix,
    trustMix: trustMixFromSources(sources),
  };
}

export type SessionEvidenceSummary = {
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  integrationBreakdown: Record<string, number>;
  trustBreakdown: TrustMix;
  hasAnalysis: boolean;
  analysisProvider: string | null;
  dataBasis: string;
};

/**
 * Session-wide evidence summary. The previous name
 * (`getReportEvidenceSummary`) is kept as a re-export in
 * `sources/traceability.ts`; new code should call this.
 */
export function getSessionEvidenceSummary(sessionView: MoriMockSession): SessionEvidenceSummary {
  const sources = sessionView.sources;
  const events = sessionView.events;
  const issues = sessionView.issues;
  const decisions = sessionView.decisions;

  const integrationBreakdown = sources.reduce<Record<string, number>>((acc, source) => {
    const integration = getIntegration(source.kind);
    const label = integration?.label ?? source.kind;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  const trustBreakdown = trustMixFromSources(sources);
  const hasAnalysis = issues.length > 0 || decisions.length > 0;

  let dataBasis = "데이터 없음";
  if (sources.length === 0 && events.length === 0) {
    dataBasis = "데이터 없음";
  } else if (hasAnalysis) {
    dataBasis = "가져온 소스 + Quick Pass 분석";
  } else if (sources.length > 0) {
    dataBasis = "가져온 소스만 (분석 전)";
  }

  return {
    sourceCount: sources.length,
    eventCount: events.length,
    issueCount: issues.length,
    decisionCount: decisions.length,
    integrationBreakdown,
    trustBreakdown,
    hasAnalysis,
    analysisProvider: null,
    dataBasis,
  };
}
