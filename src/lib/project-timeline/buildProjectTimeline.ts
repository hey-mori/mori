/**
 * Project-aggregate timeline — the pure builder.
 *
 * 흐름 is per-session; a project (every session sharing a source label) has no
 * single timeline. This builds one: every loaded session laid on a shared axis
 * with the empty stretches between sessions collapsed to a marked elision
 * ("3일 후"), so a user sees how a whole project moved over days and weeks
 * without 99% whitespace and without inventing timestamps.
 *
 * Pure and deterministic (no clock, no LLM): it operates on sessions already
 * loaded in memory by the shared memory-loading path, reuses the per-session
 * lane model to aggregate each band, and carries an honest `dataBasis` flag plus
 * a `droppedSessionCount` so it never overclaims its reach. See
 * `docs/design/project-aggregate-timeline-spec.md`.
 */
import type { MockSession } from "../../domain/types";
import type { ActivityLaneId, ActivityTone } from "../timeline/activityModel";
import {
  buildSourceIndex,
  getActivityLaneVisuals,
  getTimelineLaneForEvent,
  resolveTimelineLaneOrder,
} from "../timeline/activityModel";

/** Honesty flag mirroring Project Memory's `dataBasis`. */
export type ProjectTimelineDataBasis =
  | "activePlusSavedSessions"
  | "savedSessionMetadataOnly"
  | "partialSavedSessionLoad"
  | "unavailable";

/** One canonical lane aggregated within a session band. */
export type AggregateLane = {
  lane: ActivityLaneId;
  label: string;
  tone: ActivityTone;
  count: number;
};

/**
 * A session as handed to the builder. `view` is the loaded body; `null` means
 * only metadata is available, in which case the optional counts on `meta` carry
 * the band's numbers and the resulting band is flagged partial.
 */
export type LoadedProjectSession = {
  meta: {
    id: string;
    title: string;
    startedAt: string;
    endedAt: string;
    eventCount?: number;
    decisionCount?: number;
    openIssueCount?: number;
  };
  view: MockSession | null;
};

export type ProjectTimelineSessionSegment = {
  kind: "session";
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  lanes: AggregateLane[];
  eventCount: number;
  decisionCount: number;
  openIssueCount: number;
  /** Body not loaded — render the band dimmed and honest about being partial. */
  partial: boolean;
};

export type ProjectTimelineGapSegment = {
  kind: "gap";
  afterIso: string;
  beforeIso: string;
  /** Relative elision label, e.g. "3일 후". */
  label: string;
};

export type ProjectTimelineSegment = ProjectTimelineSessionSegment | ProjectTimelineGapSegment;

export type ProjectTimelinePulse = {
  sessions: number;
  decisions: number;
  issuesOpen: number;
  issuesResolved: number;
  spanLabel: string | null;
};

export type ProjectTimelineModel = {
  /** Chronological session bands with gap elisions interleaved. */
  segments: ProjectTimelineSegment[];
  pulse: ProjectTimelinePulse;
  dataBasis: ProjectTimelineDataBasis;
  /** Sessions beyond the cap, surfaced honestly rather than silently dropped. */
  droppedSessionCount: number;
};

const DEFAULT_CAP = 20;
/** Only an empty stretch longer than a day collapses to a gap marker. */
const GAP_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildProjectTimeline(input: {
  sessions: readonly LoadedProjectSession[];
  cap?: number;
}): ProjectTimelineModel {
  const cap = Math.max(1, input.cap ?? DEFAULT_CAP);

  // Keep the most recent `cap` sessions; report the rest as dropped.
  const byRecency = [...input.sessions].sort(
    (a, b) => parseTime(b.meta.startedAt) - parseTime(a.meta.startedAt),
  );
  const kept = byRecency.slice(0, cap);
  const droppedSessionCount = input.sessions.length - kept.length;
  const ordered = [...kept].sort(
    (a, b) => parseTime(a.meta.startedAt) - parseTime(b.meta.startedAt),
  );

  const segments: ProjectTimelineSegment[] = [];
  let prevEndMs: number | null = null;
  let prevEndIso: string | null = null;
  for (const session of ordered) {
    const startMs = parseTime(session.meta.startedAt);
    if (prevEndMs !== null && prevEndIso !== null) {
      const gap = startMs - prevEndMs;
      if (gap > GAP_THRESHOLD_MS) {
        segments.push({
          kind: "gap",
          afterIso: prevEndIso,
          beforeIso: session.meta.startedAt,
          label: gapLabel(gap),
        });
      }
    }
    segments.push(buildSessionSegment(session));
    const endMs = parseTime(session.meta.endedAt) || startMs;
    prevEndMs = endMs;
    prevEndIso = session.meta.endedAt || session.meta.startedAt;
  }

  return {
    segments,
    pulse: buildPulse(ordered),
    dataBasis: resolveDataBasis(ordered),
    droppedSessionCount,
  };
}

function buildSessionSegment(session: LoadedProjectSession): ProjectTimelineSessionSegment {
  const { meta, view } = session;
  if (!view) {
    return {
      kind: "session",
      id: meta.id,
      title: meta.title,
      startIso: meta.startedAt,
      endIso: meta.endedAt,
      lanes: [],
      eventCount: meta.eventCount ?? 0,
      decisionCount: meta.decisionCount ?? 0,
      openIssueCount: meta.openIssueCount ?? 0,
      partial: true,
    };
  }

  const sourceIndex = buildSourceIndex(view.sources);
  const counts = new Map<ActivityLaneId, number>();
  for (const event of view.events) {
    const lane = getTimelineLaneForEvent({ event, sources: sourceIndex });
    counts.set(lane, (counts.get(lane) ?? 0) + 1);
  }
  const lanes: AggregateLane[] = resolveTimelineLaneOrder(view.events, sourceIndex)
    .filter((lane) => (counts.get(lane) ?? 0) > 0)
    .map((lane) => {
      const visuals = getActivityLaneVisuals(lane);
      return { lane, label: visuals.label, tone: visuals.tone, count: counts.get(lane) ?? 0 };
    });

  return {
    kind: "session",
    id: meta.id,
    title: meta.title,
    startIso: meta.startedAt,
    endIso: meta.endedAt,
    lanes,
    eventCount: view.events.length,
    decisionCount: view.decisions.length,
    openIssueCount: view.issues.filter((issue) => issue.status !== "resolved").length,
    partial: false,
  };
}

function buildPulse(sessions: readonly LoadedProjectSession[]): ProjectTimelinePulse {
  let decisions = 0;
  let issuesOpen = 0;
  let issuesResolved = 0;
  for (const session of sessions) {
    if (session.view) {
      decisions += session.view.decisions.length;
      for (const issue of session.view.issues) {
        if (issue.status === "resolved") issuesResolved += 1;
        else issuesOpen += 1;
      }
    } else {
      decisions += session.meta.decisionCount ?? 0;
      issuesOpen += session.meta.openIssueCount ?? 0;
    }
  }
  return {
    sessions: sessions.length,
    decisions,
    issuesOpen,
    issuesResolved,
    spanLabel: spanLabel(sessions),
  };
}

function resolveDataBasis(sessions: readonly LoadedProjectSession[]): ProjectTimelineDataBasis {
  if (sessions.length === 0) return "unavailable";
  const loaded = sessions.filter((session) => session.view !== null).length;
  if (loaded === sessions.length) return "activePlusSavedSessions";
  if (loaded === 0) return "savedSessionMetadataOnly";
  return "partialSavedSessionLoad";
}

/** ms → "3일 후" / "2주 후" / "3개월 후", coarsened as the gap grows. */
function gapLabel(ms: number): string {
  const days = Math.max(1, Math.round(ms / DAY_MS));
  if (days < 14) return `${days}일 후`;
  if (days < 60) return `${Math.round(days / 7)}주 후`;
  return `${Math.round(days / 30)}개월 후`;
}

/** First session's start to the last session's end, honest null when missing. */
function spanLabel(sessions: readonly LoadedProjectSession[]): string | null {
  const startDate = isoDateParts(sessions[0]?.meta.startedAt);
  const endDate = isoDateParts(sessions[sessions.length - 1]?.meta.endedAt);
  if (!startDate || !endDate) return null;
  const left = startDate.year === endDate.year
    ? `${startDate.month}월 ${startDate.day}일`
    : `${startDate.year}년 ${startDate.month}월 ${startDate.day}일`;
  const right = startDate.year === endDate.year
    ? `${endDate.month}월 ${endDate.day}일`
    : `${endDate.year}년 ${endDate.month}월 ${endDate.day}일`;
  return left === right ? left : `${left} – ${right}`;
}

function parseTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Read Y/M/D straight from the ISO string so labels are timezone-stable. */
function isoDateParts(value: string | undefined): { year: number; month: number; day: number } | null {
  const match = (value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
