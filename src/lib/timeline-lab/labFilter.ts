import type { MockSession } from "../../domain/types";
import { momentKindForEvent, type NarrativeMomentKind } from "./narrative";

/**
 * Cross-lens filter for the reconstruction surface.
 *
 * Every lens (서사 / 국면 / 인과 / 맥동) derives purely from a `MockSession`, so
 * rather than teach each view to filter, we narrow the session itself into a
 * consistent sub-session and hand that to whichever lens is active. Pruning is
 * referential: when an event drops out, the decisions, issues, artifacts,
 * relationships and next actions that depended on it drop with it, so no lens
 * is ever handed a dangling reference.
 *
 * Pure and deterministic: no clock, no LLM, no side effects.
 */

export type LabFilter = {
  /** Free-text match against event title + summary, case-insensitive. */
  query: string;
  /** Moment kinds to keep. Empty means "all kinds". */
  kinds: NarrativeMomentKind[];
};

export const EMPTY_LAB_FILTER: LabFilter = { query: "", kinds: [] };

export function isLabFilterActive(filter: LabFilter): boolean {
  return filter.query.trim().length > 0 || filter.kinds.length > 0;
}

function intersects(ids: readonly string[], kept: ReadonlySet<string>): boolean {
  for (const id of ids) if (kept.has(id)) return true;
  return false;
}

export function filterSession(view: MockSession, filter: LabFilter): MockSession {
  if (!isLabFilterActive(filter)) return view;

  const query = filter.query.trim().toLowerCase();
  const kinds = new Set(filter.kinds);

  const events = view.events.filter((event) => {
    if (kinds.size > 0 && !kinds.has(momentKindForEvent(event.type))) return false;
    if (query) {
      const haystack = `${event.title} ${event.summary}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const eventIds = new Set(events.map((event) => event.id));
  const decisions = view.decisions.filter((d) => intersects(d.sourceEventIds, eventIds));
  const issues = view.issues.filter((i) => intersects(i.sourceEventIds, eventIds));
  const artifacts = view.artifacts.filter((a) => intersects(a.sourceEventIds, eventIds));

  const decisionIds = new Set(decisions.map((d) => d.id));
  const issueIds = new Set(issues.map((i) => i.id));
  const artifactIds = new Set(artifacts.map((a) => a.id));

  const survives = (type: string, id: string): boolean => {
    switch (type) {
      case "event":
        return eventIds.has(id);
      case "decision":
        return decisionIds.has(id);
      case "issue":
        return issueIds.has(id);
      case "artifact":
        return artifactIds.has(id);
      default:
        return false;
    }
  };

  const relationships = view.relationships.filter(
    (rel) => survives(rel.fromType, rel.fromId) && survives(rel.toType, rel.toId),
  );

  const nextActions = view.nextActions.filter((action) => {
    const unanchored =
      action.relatedEventIds.length === 0 && action.relatedIssueIds.length === 0;
    return (
      unanchored ||
      intersects(action.relatedEventIds, eventIds) ||
      intersects(action.relatedIssueIds, issueIds)
    );
  });

  return { ...view, events, decisions, issues, artifacts, relationships, nextActions };
}
