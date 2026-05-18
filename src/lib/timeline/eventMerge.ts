/**
 * Pure transforms for the Timeline "merge event" correction.
 *
 * The AI sometimes splits one logical step into two adjacent events. Merge
 * folds the selected event together with its immediate chronological
 * neighbour: the selected (earlier) event survives and absorbs the next
 * one. Because event ids are referenced by the analysis, a merge also
 * remaps the absorbed id so issues / decisions / relationships /
 * next-actions keep pointing at the surviving event rather than dangling.
 *
 * Honesty contract: a merge is never invented. When there is no next
 * event the helpers return their input by reference so callers skip the
 * persistence write.
 */
import type { MoriAnalysisResult } from "../analysis";
import type { TimelineEvent, TrustLevel } from "../../domain/types";
import type { StoredSessionImport } from "../storage/storageTypes";

/** Trust ordering — a merged event is only as trustworthy as its weaker half. */
const TRUST_RANK: Record<TrustLevel, number> = {
  verified: 2,
  observed: 1,
  inferred: 0,
};

function weakerTrust(a: TrustLevel, b: TrustLevel): TrustLevel {
  return TRUST_RANK[a] <= TRUST_RANK[b] ? a : b;
}

function uniqueConcat(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

/**
 * The event immediately after `eventId` in chronological order, or `null`
 * when the selected event is missing or already last.
 */
export function findMergeTarget(
  events: TimelineEvent[],
  eventId: string,
): TimelineEvent | null {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const index = sorted.findIndex((event) => event.id === eventId);
  if (index === -1 || index === sorted.length - 1) return null;
  return sorted[index + 1] ?? null;
}

/** Fold the next event into `base`, keeping `base`'s id and slot. */
function mergeInto(base: TimelineEvent, next: TimelineEvent): TimelineEvent {
  const baseEnd = base.end ?? base.start;
  const nextEnd = next.end ?? next.start;
  const end = baseEnd.localeCompare(nextEnd) >= 0 ? baseEnd : nextEnd;
  const summary =
    base.summary.trim() === next.summary.trim()
      ? base.summary
      : `${base.summary}\n\n${next.summary}`.trim();
  const note = [base.userNote?.trim(), next.userNote?.trim()]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");

  return {
    ...base,
    start: base.start.localeCompare(next.start) <= 0 ? base.start : next.start,
    end,
    summary,
    sourceRefs: uniqueConcat(base.sourceRefs, next.sourceRefs),
    linkedIssueIds: uniqueConcat(base.linkedIssueIds, next.linkedIssueIds),
    linkedDecisionIds: uniqueConcat(base.linkedDecisionIds, next.linkedDecisionIds),
    relationshipIds: uniqueConcat(base.relationshipIds, next.relationshipIds),
    artifactIds:
      base.artifactIds || next.artifactIds
        ? uniqueConcat(base.artifactIds ?? [], next.artifactIds ?? [])
        : undefined,
    trustLevel: weakerTrust(base.trustLevel, next.trustLevel),
    confidence: Math.min(base.confidence, next.confidence),
    userModified: true,
    userNote: note || undefined,
    // A merged event is no longer a faithful single connector event.
    connectorEventId: undefined,
  };
}

/**
 * Merge the event with `eventId` and its immediate chronological neighbour
 * across the session's imports: the selected event survives (its id and
 * import slot are kept) and absorbs the next event, which is removed.
 * Returns the original imports on a no-op (missing event, or no next).
 */
export function mergeEventWithNext(
  imports: StoredSessionImport[],
  eventId: string,
): StoredSessionImport[] {
  const allEvents = imports.flatMap((entry) => entry.events);
  const base = allEvents.find((event) => event.id === eventId);
  if (!base) return imports;
  const next = findMergeTarget(allEvents, eventId);
  if (!next) return imports;

  const merged = mergeInto(base, next);
  return imports.map((entry) => {
    const hasBase = entry.events.some((event) => event.id === base.id);
    const hasNext = entry.events.some((event) => event.id === next.id);
    if (!hasBase && !hasNext) return entry;
    const events = entry.events
      .map((event) => (event.id === base.id ? merged : event))
      .filter((event) => event.id !== next.id);
    return { ...entry, events };
  });
}

/**
 * Remap every reference to `fromId` onto `toId` in the analysis — issue and
 * decision source events, relationship endpoints, and next-action event
 * links — so a merged-away event id never dangles. Self-relationships
 * created by the remap are dropped. Returns the original analysis on a
 * no-op.
 */
export function remapEventIdInAnalysis(
  analysis: MoriAnalysisResult,
  fromId: string,
  toId: string,
): MoriAnalysisResult {
  if (fromId === toId) return analysis;

  const swap = (id: string) => (id === fromId ? toId : id);
  let changed = false;

  const issues = analysis.issues.map((issue) => {
    if (!issue.sourceEventIds.includes(fromId)) return issue;
    changed = true;
    return {
      ...issue,
      sourceEventIds: Array.from(new Set(issue.sourceEventIds.map(swap))),
    };
  });

  const decisions = analysis.decisions.map((decision) => {
    if (!decision.sourceEventIds.includes(fromId)) return decision;
    changed = true;
    return {
      ...decision,
      sourceEventIds: Array.from(new Set(decision.sourceEventIds.map(swap))),
    };
  });

  const nextActions = analysis.nextActions.map((action) => {
    if (!action.relatedEventIds.includes(fromId)) return action;
    changed = true;
    return {
      ...action,
      relatedEventIds: Array.from(new Set(action.relatedEventIds.map(swap))),
    };
  });

  const relationships = analysis.relationships
    .map((relationship) => {
      if (relationship.fromId !== fromId && relationship.toId !== fromId) {
        return relationship;
      }
      changed = true;
      return { ...relationship, fromId: swap(relationship.fromId), toId: swap(relationship.toId) };
    })
    .filter((relationship) => relationship.fromId !== relationship.toId);

  if (!changed) return analysis;
  return { ...analysis, issues, decisions, nextActions, relationships };
}
