import type {
  Decision,
  EventType,
  Issue,
  IssueStatus,
  MockSession,
  NextAction,
  Priority,
  TimelineEvent,
  TrustLevel,
} from "../../domain/types";
import {
  buildSourceIndex,
  getEventEvidenceRefs,
  getEventImportance,
  type ActivityTone,
  type EventImportance,
} from "../timeline/activityModel";
import { isNextActionCompleted } from "../session/nextActionCompletion";

/**
 * Narrative reconstruction model.
 *
 * The swimlane timeline answers "what happened, by category, on a clock". It is
 * a dense scan surface, not a story. This model rebuilds the same session as a
 * single linear *story* the eye can read top to bottom: ordered moments, with
 * decisions and issues elevated, the causal link that led into each moment, and
 * a closing "carry forward" block. It is the data behind the 서사 view.
 *
 * Pure and deterministic: it derives only from the already-reviewed session
 * (events / decisions / issues / relationships / next actions). No clock, no
 * LLM, no side effects.
 */

export type NarrativeMomentKind =
  | "conversation"
  | "decision"
  | "issue"
  | "code"
  | "research"
  | "note"
  | "other";

export type NarrativeEvidence = {
  label: string;
  tone: string;
};

export type NarrativeDecisionRef = {
  id: string;
  title: string;
  rationale: string;
  importance: Priority;
};

export type NarrativeIssueRef = {
  id: string;
  title: string;
  status: IssueStatus;
  priority: Priority;
};

export type NarrativeMoment = {
  id: string;
  eventId: string;
  kind: NarrativeMomentKind;
  tone: ActivityTone;
  /** HH:MM, local time. Empty when the timestamp is unparseable. */
  timeLabel: string;
  start: string;
  title: string;
  summary: string;
  importance: EventImportance;
  trustLevel: TrustLevel;
  evidence: NarrativeEvidence[];
  decisions: NarrativeDecisionRef[];
  issues: NarrativeIssueRef[];
  /** The causal reason that led into this moment, when a relationship records one. */
  connection: string | null;
};

export type NarrativeContinuation = {
  openIssues: NarrativeIssueRef[];
  nextActions: { id: string; title: string; priority: Priority }[];
  resumePrompt: string | null;
};

export type Narrative = {
  moments: NarrativeMoment[];
  continuation: NarrativeContinuation;
};

const KIND_TONE: Record<NarrativeMomentKind, ActivityTone> = {
  conversation: "purple",
  decision: "blue",
  issue: "red",
  code: "cyan",
  research: "cyan",
  note: "gray",
  other: "gray",
};

const TRUST_TONE: Record<TrustLevel, string> = {
  verified: "green",
  observed: "blue",
  inferred: "purple",
};

export function momentKindForEvent(type: EventType): NarrativeMomentKind {
  switch (type) {
    case "aiConversation":
      return "conversation";
    case "decision":
      return "decision";
    case "issue":
      return "issue";
    case "fileCode":
    case "artifact":
      return "code";
    case "webResearch":
      return "research";
    case "documentNote":
      return "note";
    default:
      return "other";
  }
}

export function narrativeMomentTone(kind: NarrativeMomentKind): ActivityTone {
  return KIND_TONE[kind];
}

/**
 * How strongly the 서사 lens should weight a moment: pivotal moments are
 * emphasized, routine ones can be folded. Pure and deterministic; it reads only
 * the moment's own already-resolved fields.
 */
export type MomentTier = "pivotal" | "notable" | "routine";

export function momentTier(moment: NarrativeMoment): MomentTier {
  if (
    moment.decisions.length > 0 ||
    moment.issues.length > 0 ||
    moment.importance === "high"
  ) {
    return "pivotal";
  }
  if (moment.importance === "medium" || (moment.connection?.trim().length ?? 0) > 0) {
    return "notable";
  }
  return "routine";
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sortByStart<T extends { start: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.start);
    const tb = Date.parse(b.start);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return ta - tb;
  });
}

function resolveDecisions(
  event: TimelineEvent,
  decisionsById: ReadonlyMap<string, Decision>,
  decisionsByEvent: ReadonlyMap<string, Decision[]>,
): NarrativeDecisionRef[] {
  const seen = new Set<string>();
  const out: NarrativeDecisionRef[] = [];
  const push = (decision: Decision | undefined) => {
    if (!decision || seen.has(decision.id)) return;
    seen.add(decision.id);
    out.push({
      id: decision.id,
      title: decision.title,
      rationale: decision.rationale,
      importance: decision.importance,
    });
  };
  for (const id of event.linkedDecisionIds) push(decisionsById.get(id));
  for (const decision of decisionsByEvent.get(event.id) ?? []) push(decision);
  return out;
}

function resolveIssues(
  event: TimelineEvent,
  issuesById: ReadonlyMap<string, Issue>,
  issuesByEvent: ReadonlyMap<string, Issue[]>,
): NarrativeIssueRef[] {
  const seen = new Set<string>();
  const out: NarrativeIssueRef[] = [];
  const push = (issue: Issue | undefined) => {
    if (!issue || seen.has(issue.id)) return;
    seen.add(issue.id);
    out.push({
      id: issue.id,
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
    });
  };
  for (const id of event.linkedIssueIds) push(issuesById.get(id));
  for (const issue of issuesByEvent.get(event.id) ?? []) push(issue);
  return out;
}

export function buildNarrative(view: MockSession): Narrative {
  const sourceIndex = buildSourceIndex(view.sources);
  const decisionsById = new Map(view.decisions.map((d) => [d.id, d]));
  const issuesById = new Map(view.issues.map((i) => [i.id, i]));

  const decisionsByEvent = groupBySourceEvent(view.decisions);
  const issuesByEvent = groupBySourceEvent(view.issues);

  // Causal reason that lands ON an event: the first relationship whose target is
  // this event. Surfacing it inline turns a flat list into a narrative thread.
  const incomingReason = new Map<string, string>();
  for (const rel of view.relationships) {
    if (rel.toType !== "event") continue;
    if (!incomingReason.has(rel.toId) && rel.reason.trim()) {
      incomingReason.set(rel.toId, rel.reason.trim());
    }
  }

  const moments = sortByStart(view.events).map((event): NarrativeMoment => {
    const kind = momentKindForEvent(event.type);
    const evidence = getEventEvidenceRefs({ event, sources: sourceIndex, max: 3 }).map(
      (chip): NarrativeEvidence => ({
        label: chip.shortLabel,
        tone: chip.trustLevel ? TRUST_TONE[chip.trustLevel] : "gray",
      }),
    );
    return {
      id: `moment:${event.id}`,
      eventId: event.id,
      kind,
      tone: KIND_TONE[kind],
      timeLabel: timeLabel(event.start),
      start: event.start,
      title: event.title,
      summary: event.summary,
      importance: getEventImportance({ event, sources: sourceIndex }),
      trustLevel: event.trustLevel,
      evidence,
      decisions: resolveDecisions(event, decisionsById, decisionsByEvent),
      issues: resolveIssues(event, issuesById, issuesByEvent),
      connection: incomingReason.get(event.id) ?? null,
    };
  });

  return {
    moments,
    continuation: buildContinuation(view),
  };
}

function buildContinuation(view: MockSession): NarrativeContinuation {
  const openIssues = view.issues
    .filter((issue) => issue.status !== "resolved")
    .map(
      (issue): NarrativeIssueRef => ({
        id: issue.id,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
      }),
    );
  const nextActions = view.nextActions
    .filter((action: NextAction) => !isNextActionCompleted(action))
    .map((action) => ({ id: action.id, title: action.title, priority: action.priority }));
  const resumePrompt = view.summary?.resumePrompt?.trim() || null;
  return { openIssues, nextActions, resumePrompt };
}

function groupBySourceEvent<T extends { sourceEventIds: string[] }>(
  items: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    for (const eventId of item.sourceEventIds) {
      const list = map.get(eventId);
      if (list) list.push(item);
      else map.set(eventId, [item]);
    }
  }
  return map;
}
