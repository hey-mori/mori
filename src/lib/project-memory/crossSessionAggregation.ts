/**
 * Cross-session aggregation helpers.
 *
 * Pure derivations consumed by `buildProjectMemoryViewModel` when the
 * caller hands in `loadedSessions`. Splitting these out keeps the
 * view-model builder readable and gives tests a tight surface to
 * exercise — the aggregation logic is the bulk of the milestone, and
 * it deserves its own unit-tested module.
 *
 * Conventions:
 *   - Inputs are `ProjectMemoryLoadedSession[]` (active first, then
 *     saved). Demo / failed / metadata-only sessions are filtered out
 *     before this module sees them — the helpers assume `loadStatus`
 *     is `"loaded"` and `events`/`sources`/`issues`/`decisions` are
 *     real.
 *   - Outputs are typed `ProjectMemory*` rows from
 *     `projectMemoryModel.ts`. Every row carries `sessionId` +
 *     `sessionTitle` + `sessionIsActive` for honest attribution.
 *   - Helpers never fabricate data when none exists — empty inputs
 *     return empty arrays, never placeholder rows.
 */
import type {
  Issue,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import type {
  ProjectMemoryKeyDecision,
  ProjectMemoryKeyEvidence,
  ProjectMemoryLoadedSession,
  ProjectMemoryRecurringIssue,
  ProjectMemorySessionRef,
  ProjectMemoryUnresolvedRisk,
} from "./projectMemoryModel";

// ─── public entry points ───────────────────────────────────────────────

export function aggregateKeyDecisions(
  loaded: ProjectMemoryLoadedSession[],
  limit = 6,
): ProjectMemoryKeyDecision[] {
  const rows: ProjectMemoryKeyDecision[] = [];
  for (const session of loaded) {
    if (session.loadStatus !== "loaded") continue;
    for (const decision of session.decisions) {
      rows.push({
        decisionId: decision.id,
        sessionId: session.sessionId,
        sessionTitle: session.title,
        sessionIsActive: session.isActive,
        title: decision.title,
        detail: decision.decision,
        importance: decision.importance,
        confirmed: decision.confirmed,
        createdAt: decision.createdAt,
      });
    }
  }
  return rows
    .sort((a, b) => {
      const importanceDiff = priorityRank(b.importance) - priorityRank(a.importance);
      if (importanceDiff !== 0) return importanceDiff;
      // Active session decisions win ties so the live work surfaces first.
      if (a.sessionIsActive !== b.sessionIsActive) return a.sessionIsActive ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, limit);
}

export function aggregateRecurringIssues(
  loaded: ProjectMemoryLoadedSession[],
  limit = 5,
): ProjectMemoryRecurringIssue[] {
  // 1) Walk every loaded session, group issues by normalized title.
  const buckets = new Map<string, IssueBucket>();
  for (const session of loaded) {
    if (session.loadStatus !== "loaded") continue;
    for (const issue of session.issues) {
      const key = normalizeIssueTitle(issue.title);
      if (!key) continue;
      const bucket = buckets.get(key) ?? {
        normalizedTitle: key,
        members: [],
      };
      bucket.members.push({
        issue,
        sessionRef: {
          sessionId: session.sessionId,
          sessionTitle: session.title,
          isActive: session.isActive,
        },
      });
      buckets.set(key, bucket);
    }
  }

  // 2) Project each bucket onto a single row. Prefer the highest-priority
  //    open issue as the representative member so the row's status /
  //    priority match the most actionable instance.
  const rows: ProjectMemoryRecurringIssue[] = [];
  for (const bucket of buckets.values()) {
    const sortedMembers = [...bucket.members].sort((a, b) =>
      issuePriorityRank(b.issue) - issuePriorityRank(a.issue),
    );
    const lead = sortedMembers[0];
    const affectedSessions = uniqueSessionRefs(bucket.members.map((m) => m.sessionRef));
    const signalScore = aggregateSignalScore(bucket.members, affectedSessions.length);
    rows.push({
      issueId: lead.issue.id,
      sessionId: lead.sessionRef.sessionId,
      sessionTitle: lead.sessionRef.sessionTitle,
      sessionIsActive: lead.sessionRef.isActive,
      title: lead.issue.title,
      description: lead.issue.description,
      signalScore,
      affectedSessionCount: affectedSessions.length,
      affectedSessions,
      status: lead.issue.status,
      priority: lead.issue.priority,
      crossSession: affectedSessions.length > 1,
    });
  }

  return rows
    .filter((row) => row.signalScore > 0 || row.priority === "high" || row.crossSession)
    .sort((a, b) => {
      if (a.crossSession !== b.crossSession) return a.crossSession ? -1 : 1;
      if (a.affectedSessionCount !== b.affectedSessionCount) {
        return b.affectedSessionCount - a.affectedSessionCount;
      }
      return b.signalScore - a.signalScore;
    })
    .slice(0, limit);
}

export function aggregateKeyEvidence(
  loaded: ProjectMemoryLoadedSession[],
  limit = 6,
): ProjectMemoryKeyEvidence[] {
  const rows: ProjectMemoryKeyEvidence[] = [];
  const seenSourceIds = new Set<string>();

  for (const session of loaded) {
    if (session.loadStatus !== "loaded") continue;
    const eventsBySourceId = indexEventsBySource(session.events);
    for (const source of session.sources) {
      if (seenSourceIds.has(source.id)) continue;
      seenSourceIds.add(source.id);
      const linkedEvents = eventsBySourceId.get(source.id) ?? [];
      const linkedEventIds = new Set(linkedEvents.map((event) => event.id));
      const linkedIssueCount = session.issues.filter((issue) =>
        issue.sourceEventIds.some((id) => linkedEventIds.has(id)),
      ).length;
      const linkedDecisionCount = session.decisions.filter(
        (decision) =>
          decision.relatedSourceIds.includes(source.id) ||
          decision.sourceEventIds.some((id) => linkedEventIds.has(id)),
      ).length;
      rows.push({
        source,
        sessionId: session.sessionId,
        sessionTitle: session.title,
        sessionIsActive: session.isActive,
        relatedEventCount: linkedEvents.length,
        relatedIssueCount: linkedIssueCount,
        relatedDecisionCount: linkedDecisionCount,
      });
    }
  }

  return rows
    .sort((a, b) => {
      if (a.relatedEventCount !== b.relatedEventCount) {
        return b.relatedEventCount - a.relatedEventCount;
      }
      if (a.sessionIsActive !== b.sessionIsActive) return a.sessionIsActive ? -1 : 1;
      return new Date(b.source.capturedAt).getTime() - new Date(a.source.capturedAt).getTime();
    })
    .slice(0, limit);
}

export function aggregateUnresolvedRisks(
  loaded: ProjectMemoryLoadedSession[],
  limit = 4,
): ProjectMemoryUnresolvedRisk[] {
  const rows: ProjectMemoryUnresolvedRisk[] = [];
  for (const session of loaded) {
    if (session.loadStatus !== "loaded") continue;
    for (const issue of session.issues) {
      if (issue.status !== "open") continue;
      if (issue.priority !== "high" && !(issue.trustLevel === "inferred" && issue.confidence < 0.6)) {
        continue;
      }
      rows.push({
        issueId: issue.id,
        title: issue.title,
        priority: issue.priority,
        status: issue.status,
        trustLevel: issue.trustLevel,
        confidence: issue.confidence,
        reason:
          issue.priority === "high"
            ? "High priority"
            : `Low confidence · ${Math.round(issue.confidence * 100)}%`,
        sessionId: session.sessionId,
        sessionTitle: session.title,
        sessionIsActive: session.isActive,
      });
    }
  }
  return rows
    .sort((a, b) => {
      const priorityDiff = priorityRank(b.priority) - priorityRank(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      if (a.sessionIsActive !== b.sessionIsActive) return a.sessionIsActive ? -1 : 1;
      return 0;
    })
    .slice(0, limit);
}

/**
 * Cross-session counters consumed by the summary stats. Always
 * de-duplicates timeline events and sources by id so an active session
 * that's also persisted does not double-count.
 */
export function aggregateCounters(loaded: ProjectMemoryLoadedSession[]) {
  let timelineEventCount = 0;
  let evidenceSourceCount = 0;
  let issueCount = 0;
  let openIssueCount = 0;
  let decisionCount = 0;
  let nextActionCount = 0;

  const seenEventIds = new Set<string>();
  const seenSourceIds = new Set<string>();

  for (const session of loaded) {
    if (session.loadStatus !== "loaded") continue;
    for (const event of session.events) {
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      timelineEventCount += 1;
    }
    for (const source of session.sources) {
      if (seenSourceIds.has(source.id)) continue;
      seenSourceIds.add(source.id);
      evidenceSourceCount += 1;
    }
    issueCount += session.issues.length;
    openIssueCount += session.issues.filter((issue) => issue.status !== "resolved").length;
    decisionCount += session.decisions.length;
    nextActionCount += session.nextActions.length;
  }

  return {
    timelineEventCount,
    evidenceSourceCount,
    issueCount,
    openIssueCount,
    decisionCount,
    nextActionCount,
  };
}

/**
 * Pick the recommended next-session topic using cross-session signal.
 * Falls back to active-session-only logic when no cross-session data
 * is available.
 */
export function pickRecommendedNextSession({
  recurring,
  risks,
  loaded,
}: {
  recurring: ProjectMemoryRecurringIssue[];
  risks: ProjectMemoryUnresolvedRisk[];
  loaded: ProjectMemoryLoadedSession[];
}): string {
  const recurringCross = recurring.find((row) => row.crossSession);
  if (recurringCross) {
    return `반복 이슈 해소: ${recurringCross.title} (${recurringCross.affectedSessionCount}개 세션)`;
  }
  if (risks.length > 0) {
    const lead = risks[0];
    return lead.sessionIsActive
      ? `Open risk 해소: ${lead.title}`
      : `Open risk 해소: ${lead.title} (${lead.sessionTitle})`;
  }
  const activeSession = loaded.find((s) => s.isActive && s.loadStatus === "loaded");
  if (activeSession) {
    const inProgress = activeSession.issues.find((issue) => issue.status === "inProgress");
    if (inProgress) return `진행 중 이슈 마무리: ${inProgress.title}`;
    const next = activeSession.nextActions[0];
    if (next) return `다음 액션 추진: ${next.title}`;
  }
  return "현재 세션 메모리를 검토하고 다음 작업 범위를 결정";
}

// ─── internal helpers ──────────────────────────────────────────────────

type IssueBucketMember = {
  issue: Issue;
  sessionRef: ProjectMemorySessionRef;
};

type IssueBucket = {
  normalizedTitle: string;
  members: IssueBucketMember[];
};

function normalizeIssueTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[\s ]+/g, " ").replace(/[.!?。…]+$/u, "");
}

function priorityRank(priority: "high" | "medium" | "low"): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function issuePriorityRank(issue: Issue): number {
  const open = issue.status === "open" ? 1 : 0;
  return priorityRank(issue.priority) * 10 + open;
}

function aggregateSignalScore(members: IssueBucketMember[], affectedSessionCount: number): number {
  let score = 0;
  for (const { issue } of members) {
    score += issue.sourceEventIds.length * 2 + issue.relatedDecisionIds.length * 3;
    if (issue.status === "open") score += 1;
    if (issue.priority === "high") score += 3;
    if (issue.priority === "medium") score += 1;
  }
  // Recurrence amplifies the score so cross-session issues bubble up.
  if (affectedSessionCount > 1) score *= affectedSessionCount;
  return score;
}

function uniqueSessionRefs(refs: ProjectMemorySessionRef[]): ProjectMemorySessionRef[] {
  const seen = new Map<string, ProjectMemorySessionRef>();
  for (const ref of refs) {
    if (!seen.has(ref.sessionId)) seen.set(ref.sessionId, ref);
  }
  return Array.from(seen.values());
}

function indexEventsBySource(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const out = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    for (const sourceId of event.sourceRefs) {
      const bucket = out.get(sourceId);
      if (bucket) bucket.push(event);
      else out.set(sourceId, [event]);
    }
  }
  return out;
}

/**
 * Tiny helper so callers can ask "does this loaded session carry usable
 * decisions/issues?" without re-deriving the predicate inline.
 */
export function loadedSessionHasBody(session: ProjectMemoryLoadedSession): boolean {
  if (session.loadStatus !== "loaded") return false;
  return (
    session.events.length > 0 ||
    session.sources.length > 0 ||
    session.issues.length > 0 ||
    session.decisions.length > 0
  );
}

// re-export helpful type to avoid extra imports at call sites
export type { SourceRef };
