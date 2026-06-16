import type {
  Decision,
  Issue,
  IssueStatus,
  MockSession,
  Priority,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import { eventTypeLabels } from "../../domain/constants";
import { getReportEvidenceSummary, getSourceDisplayStatus } from "../sources/traceability";

/**
 * Pure derivations for the Project Memory workspace.
 *
 * Project Memory has two honest data sources today:
 *   - the *current* session view (issues / decisions / events / sources / next-actions),
 *   - a flat list of saved-session summaries (browser draft + SQLite).
 *
 * We do NOT load every saved session's full payload — that requires
 * persistence work outside this milestone. Helpers below derive everything
 * they can from the current session view and tag results with a data scope
 * so the UI can be transparent about what is / isn't aggregated.
 */

export type ProjectMemoryDataScope =
  | "demo"
  | "current-session"
  | "browser-draft"
  | "sqlite-saved";

export type ProjectMemoryStats = {
  sessionCount: number;
  /** Count of sessions whose payload was actually aggregated; today this is
   *  always 1 (the active session) because cross-session aggregation is not
   *  implemented yet. UI shows this as the "aggregated" subscript. */
  aggregatedSessionCount: number;
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  openIssueCount: number;
  decisionCount: number;
  unconfirmedDecisionCount: number;
  nextActionCount: number;
  reportCount: number;
  dataBasis: string;
};

export type DerivedSession = {
  sessionId: string;
  projectId: string | null;
  title: string;
  projectName: string | null;
  startedAt: string | null;
  savedAt: string | null;
  status: string;
  eventCount: number | null;
  sourceCount: number | null;
  isCurrent: boolean;
  scope: ProjectMemoryDataScope;
  /** Human label used in the UI badge (e.g. "Current · live", "Browser draft"). */
  scopeLabel: string;
};

/**
 * Compose stats for the project hero / overview row.
 *
 * Notes
 *  - `sessionCount` includes the active session + every saved entry (browser
 *    + SQLite), de-duplicated by sessionId.
 *  - `aggregatedSessionCount` is always 1 today — multi-session aggregation
 *    is honestly Planned. UI uses it to render the "1/N aggregated" badge.
 */
export function deriveProjectMemoryStats({
  view,
  savedSessions,
  reportCount,
}: {
  view: MockSession;
  savedSessions: DerivedSession[];
  reportCount: number;
}): ProjectMemoryStats {
  const evidence = getReportEvidenceSummary(view);
  const sessionIds = new Set(savedSessions.map((entry) => entry.sessionId));
  sessionIds.add(view.session.id);
  const openIssueCount = view.issues.filter((issue) => issue.status !== "resolved").length;
  const unconfirmedDecisionCount = view.decisions.filter((decision) => !decision.confirmed).length;
  return {
    sessionCount: sessionIds.size,
    aggregatedSessionCount: 1,
    sourceCount: view.sources.length,
    eventCount: view.events.length,
    issueCount: view.issues.length,
    openIssueCount,
    decisionCount: view.decisions.length,
    unconfirmedDecisionCount,
    nextActionCount: view.nextActions.length,
    reportCount,
    dataBasis: evidence.dataBasis,
  };
}

/**
 * Pick the top decisions ordered by createdAt desc. Used by the "decisions
 * over time" card so we don't need a real chart yet.
 */
export function getRecentDecisions(view: MockSession, limit = 8): Decision[] {
  return [...view.decisions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export type DecisionTimelinePoint = {
  decisionId: string;
  title: string;
  createdAt: string;
  importance: Priority;
  confirmed: boolean;
};

/**
 * Build a chronological list (oldest → newest) for the decision-flow card so
 * the UI can render a simple vertical timeline without a chart library.
 */
export function getDecisionTimeline(view: MockSession): DecisionTimelinePoint[] {
  return [...view.decisions]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((decision) => ({
      decisionId: decision.id,
      title: decision.title,
      createdAt: decision.createdAt,
      importance: decision.importance,
      confirmed: decision.confirmed,
    }));
}

/**
 * "Recurring issues" within a single session is necessarily heuristic — we
 * surface issues that touch the most events / decisions / sources, and tag
 * the scope so the UI never claims cross-session recurrence. When multi-
 * session aggregation lands, we'll keep the shape and add a real frequency
 * counter from the saved-session payloads.
 */
export type RecurringIssueRow = {
  issue: Issue;
  signalScore: number;
  evidenceCount: number;
  relatedEventCount: number;
  relatedDecisionCount: number;
  scope: ProjectMemoryDataScope;
  scopeLabel: string;
};

export function getRecurringIssues(
  view: MockSession,
  scope: ProjectMemoryDataScope,
  limit = 5,
): RecurringIssueRow[] {
  const scopeLabel = scopeLabelFor(scope);
  const rows = view.issues.map<RecurringIssueRow>((issue) => {
    const evidenceCount = issue.sourceEventIds.length;
    const relatedDecisions = issue.relatedDecisionIds.length;
    const signalScore = evidenceCount * 2 + relatedDecisions * 3 + (issue.status === "open" ? 1 : 0);
    return {
      issue,
      signalScore,
      evidenceCount,
      relatedEventCount: issue.sourceEventIds.length,
      relatedDecisionCount: relatedDecisions,
      scope,
      scopeLabel,
    };
  });

  return rows
    .filter((row) => row.signalScore > 0 || row.issue.priority === "high")
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, limit);
}

/**
 * "Key evidence" — sources with the most timeline events linked to them.
 * Falls back to the most recently captured sources when nothing has events.
 */
export type KeyEvidenceRow = {
  source: SourceRef;
  display: ReturnType<typeof getSourceDisplayStatus>;
  relatedEventCount: number;
  relatedIssueCount: number;
  relatedDecisionCount: number;
};

export function getKeyEvidence(view: MockSession, limit = 6): KeyEvidenceRow[] {
  const sourceToEvents = new Map<string, TimelineEvent[]>();
  for (const event of view.events) {
    for (const sourceId of event.sourceRefs) {
      const bucket = sourceToEvents.get(sourceId);
      if (bucket) bucket.push(event);
      else sourceToEvents.set(sourceId, [event]);
    }
  }

  return view.sources
    .map<KeyEvidenceRow>((source) => {
      const events = sourceToEvents.get(source.id) ?? [];
      const eventIds = new Set(events.map((event) => event.id));
      const relatedIssueCount = view.issues.filter((issue) =>
        issue.sourceEventIds.some((id) => eventIds.has(id)),
      ).length;
      const relatedDecisionCount = view.decisions.filter(
        (decision) =>
          decision.relatedSourceIds.includes(source.id) ||
          decision.sourceEventIds.some((id) => eventIds.has(id)),
      ).length;
      return {
        source,
        display: getSourceDisplayStatus(source),
        relatedEventCount: events.length,
        relatedIssueCount,
        relatedDecisionCount,
      };
    })
    .sort((a, b) => {
      if (a.relatedEventCount !== b.relatedEventCount) return b.relatedEventCount - a.relatedEventCount;
      return new Date(b.source.capturedAt).getTime() - new Date(a.source.capturedAt).getTime();
    })
    .slice(0, limit);
}

export type ProjectMemorySummary = {
  latestImportantDecision: Decision | null;
  unresolvedRisks: Issue[];
  nextRecommendedSessionTopic: string;
  dataScope: ProjectMemoryDataScope;
  scopeLabel: string;
  scopeCaveat: string;
};

/**
 * Build the right-side Project Memory summary. The `scopeCaveat` always
 * documents what the summary is *not* aggregating — multi-session SQLite
 * snapshots, Quick Pass re-runs, .mori packages — so the user is never
 * misled.
 */
export function getProjectMemorySummary({
  view,
  scope,
  savedSessionCount,
  reportCount,
  hasAnalysis,
}: {
  view: MockSession;
  scope: ProjectMemoryDataScope;
  savedSessionCount: number;
  reportCount: number;
  hasAnalysis: boolean;
}): ProjectMemorySummary {
  const importantDecisions = [...view.decisions]
    .filter((decision) => decision.importance === "high")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestImportantDecision = importantDecisions[0] ?? view.decisions[0] ?? null;

  const unresolvedRisks = view.issues
    .filter((issue) => issue.status === "open")
    .filter((issue) => issue.priority === "high" || (issue.trustLevel === "inferred" && issue.confidence < 0.6))
    .slice(0, 4);

  const nextRecommendedSessionTopic = pickNextSessionTopic(view, unresolvedRisks);

  return {
    latestImportantDecision,
    unresolvedRisks,
    nextRecommendedSessionTopic,
    dataScope: scope,
    scopeLabel: scopeLabelFor(scope),
    scopeCaveat: scopeCaveatFor({ scope, savedSessionCount, reportCount, hasAnalysis }),
  };
}

function pickNextSessionTopic(view: MockSession, risks: Issue[]): string {
  if (risks.length > 0) {
    return `Open risk 해소: ${risks[0].title}`;
  }
  const inProgress = view.issues.find((issue) => issue.status === "inProgress");
  if (inProgress) return `진행 중 이슈 마무리: ${inProgress.title}`;
  const next = view.nextActions[0];
  if (next) return `다음 액션 추진: ${next.title}`;
  return "현재 세션 메모리를 검토하고 다음 작업 범위를 결정";
}

export function scopeLabelFor(scope: ProjectMemoryDataScope): string {
  if (scope === "demo") return "Demo memory";
  if (scope === "browser-draft") return "Browser draft";
  if (scope === "sqlite-saved") return "Desktop SQLite";
  return "Current session";
}

function scopeCaveatFor({
  scope,
  savedSessionCount,
  reportCount,
  hasAnalysis,
}: {
  scope: ProjectMemoryDataScope;
  savedSessionCount: number;
  reportCount: number;
  hasAnalysis: boolean;
}): string {
  if (scope === "demo") {
    return "Demo memory: 정적 mock 데이터를 보여줍니다. 실제 세션을 시작하면 가져온 자료 기반의 메모리가 표시됩니다.";
  }
  const parts: string[] = ["현재는 활성 세션 1건의 데이터만 집계합니다."];
  if (savedSessionCount > 0) {
    parts.push(`저장된 세션 ${savedSessionCount}건은 목록만 표시되며, 결정 / 이슈 / 출처는 개별 세션에서 확인하세요.`);
  } else {
    parts.push("저장된 세션이 없습니다. Settings 또는 Reports에서 .mori v0로 내보내면 목록에 추가됩니다.");
  }
  if (!hasAnalysis) {
    parts.push("분석을 아직 실행하지 않았습니다. 정리 또는 보고서에서 분석을 실행하면 메모리가 풍부해집니다.");
  }
  if (reportCount === 0) {
    parts.push("저장된 .mori 패키지 / 보고서가 없습니다.");
  }
  return parts.join(" ");
}

/**
 * Build a copyable follow-up session prompt anchored on the project memory.
 * Reuses the existing resume-prompt fallback but adds cross-session framing
 * so a user starting a new session has the right context preloaded.
 */
export function buildFollowUpPrompt({
  view,
  savedSessionCount,
  reportCount,
  hasAnalysis,
}: {
  view: MockSession;
  savedSessionCount: number;
  reportCount: number;
  hasAnalysis: boolean;
}): string {
  const project = view.project.name;
  const openIssues = view.issues
    .filter((issue) => issue.status !== "resolved")
    .slice(0, 5)
    .map((issue, index) => `${index + 1}. ${issue.title}${issue.suggestedNextAction ? ` — ${issue.suggestedNextAction}` : ""}`)
    .join("\n");
  const recentDecisions = [...view.decisions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4)
    .map((decision) => `- ${decision.title}: ${decision.decision}`)
    .join("\n");
  const nextActions = view.nextActions
    .slice(0, 5)
    .map((action) => `- ${action.title}`)
    .join("\n");
  const keyEvidence = getKeyEvidence(view, 4)
    .map(({ source, display, relatedEventCount }) => `- ${display.integrationLabel} · ${source.title} (${relatedEventCount} events)`)
    .join("\n");

  const memoryFooter = [
    `- 저장된 세션 ${savedSessionCount}건 · 보고서 ${reportCount}건`,
    `- 분석: ${hasAnalysis ? "완료된 분석을 메모리에 반영" : "분석을 아직 실행하지 않음"}`,
  ].join("\n");

  return `You are starting a follow-up session for the ${project} project in Mori.

Mori is a local-first AI work memory app. The user already has a running project memory aggregated from prior local work. This follow-up should build on it without re-deriving the same context.

Most recent decisions:
${recentDecisions || "- (no decisions yet)"}

Open issues to address:
${openIssues || "- (no open issues)"}

Next actions on the docket:
${nextActions || "- (no next actions queued)"}

Key evidence Mori is currently relying on:
${keyEvidence || "- (no captured evidence yet)"}

Memory scope:
${memoryFooter}

Continue from this context. Confirm priorities with the user before touching code or producing artifacts.`;
}

/**
 * Tiny helper used when rendering decision titles inside the right summary
 * panel: we like a one-line label that includes the event-type tag if a
 * decision was sourced from a specific event.
 */
export function describeDecisionSource(decision: Decision, events: TimelineEvent[]): string {
  const sourceEvent = events.find((event) => decision.sourceEventIds.includes(event.id));
  if (!sourceEvent) return decision.title;
  return `${decision.title} · ${eventTypeLabels[sourceEvent.type] ?? sourceEvent.type}`;
}

export function issueStatusTone(status: IssueStatus): "red" | "orange" | "green" | "gray" {
  if (status === "open") return "red";
  if (status === "inProgress") return "orange";
  if (status === "resolved") return "green";
  return "gray";
}
