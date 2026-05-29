import type { MockSession, TrustLevel } from "../../domain/types";
import type { ActivityTone } from "../timeline/activityModel";
import { buildNarrative, type NarrativeContinuation } from "./narrative";
import { buildPhases } from "./phases";

/**
 * Pulse reconstruction model — the session read as vital signs.
 *
 * Where 서사 / 국면 / 인과 each walk through the session's content, this model
 * steps back and answers "what kind of session was this?" in numbers: how many
 * moments and decisions, how the work split across the arc, how grounded the
 * reconstruction is (trust mix), whether the issues actually got closed, and
 * where the effort clustered in time. It is the glance layer that makes a long
 * session legible before you commit to reading it, and the data behind the
 * 맥동 view.
 *
 * Pure and deterministic: derives only from the already-reviewed session. No
 * clock, no LLM, no side effects.
 */

const TRUST_META: Record<TrustLevel, { label: string; tone: ActivityTone }> = {
  verified: { label: "확인", tone: "green" },
  observed: { label: "관찰", tone: "blue" },
  inferred: { label: "추론", tone: "purple" },
};

const TRUST_ORDER: TrustLevel[] = ["verified", "observed", "inferred"];

const MAX_MOMENTUM_BUCKETS = 10;

export type PulseStat = {
  id: string;
  label: string;
  value: string;
  detail: string | null;
  tone: ActivityTone;
};

export type PulsePhaseSlice = {
  id: string;
  label: string;
  tone: ActivityTone;
  count: number;
  pct: number;
};

export type PulseTrustSlice = {
  level: TrustLevel;
  label: string;
  tone: ActivityTone;
  count: number;
  pct: number;
};

export type PulseMomentumBucket = {
  /** HH:MM of the bucket's leading edge. */
  label: string;
  count: number;
  /** Height share, 0–100, relative to the busiest bucket. */
  pct: number;
  pivotal: boolean;
};

export type PulseIssueResolution = {
  open: number;
  resolved: number;
  total: number;
  resolvedPct: number;
};

export type Pulse = {
  totalMoments: number;
  decisionCount: number;
  stats: PulseStat[];
  phases: PulsePhaseSlice[];
  trust: PulseTrustSlice[];
  momentum: PulseMomentumBucket[];
  issues: PulseIssueResolution;
  durationLabel: string | null;
  spanLabel: string | null;
  continuation: NarrativeContinuation;
};

function clockLabel(ms: number): string {
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function durationLabel(spanMs: number): string {
  const totalMinutes = Math.round(spanMs / 60000);
  if (totalMinutes <= 0) return "1분 미만";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

function parsedStarts(view: MockSession): number[] {
  return view.events
    .map((event) => Date.parse(event.start))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => a - b);
}

function buildMomentum(
  view: MockSession,
  pivotalEventIds: ReadonlySet<string>,
): PulseMomentumBucket[] {
  const timed = view.events
    .map((event) => ({ ms: Date.parse(event.start), id: event.id }))
    .filter((entry) => !Number.isNaN(entry.ms))
    .sort((a, b) => a.ms - b.ms);
  if (timed.length < 2) return [];

  const first = timed[0]!.ms;
  const last = timed[timed.length - 1]!.ms;
  const span = last - first;
  if (span <= 0) return [];

  const bucketCount = Math.min(MAX_MOMENTUM_BUCKETS, timed.length);
  const width = span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    label: clockLabel(first + index * width),
    count: 0,
    pct: 0,
    pivotal: false,
  }));

  for (const entry of timed) {
    const raw = Math.floor((entry.ms - first) / width);
    const index = Math.min(bucketCount - 1, raw);
    const bucket = buckets[index]!;
    bucket.count += 1;
    if (pivotalEventIds.has(entry.id)) bucket.pivotal = true;
  }

  const peak = Math.max(...buckets.map((bucket) => bucket.count));
  for (const bucket of buckets) {
    bucket.pct = peak > 0 ? Math.round((bucket.count / peak) * 100) : 0;
  }
  return buckets;
}

export function buildPulse(view: MockSession): Pulse {
  const { moments, continuation } = buildNarrative(view);
  const phases = buildPhases(view);

  const totalMoments = moments.length;
  const decisionCount = view.decisions.length;

  const resolved = view.issues.filter((issue) => issue.status === "resolved").length;
  const totalIssues = view.issues.length;
  const issues: PulseIssueResolution = {
    open: totalIssues - resolved,
    resolved,
    total: totalIssues,
    resolvedPct: totalIssues > 0 ? Math.round((resolved / totalIssues) * 100) : 0,
  };

  const phaseSlices: PulsePhaseSlice[] = phases.map((phase) => ({
    id: phase.id,
    label: phase.label,
    tone: phase.tone,
    count: phase.count,
    pct: totalMoments > 0 ? Math.round((phase.count / totalMoments) * 100) : 0,
  }));

  const trustCounts = new Map<TrustLevel, number>();
  for (const event of view.events) {
    trustCounts.set(event.trustLevel, (trustCounts.get(event.trustLevel) ?? 0) + 1);
  }
  const eventTotal = view.events.length;
  const trust: PulseTrustSlice[] = TRUST_ORDER.filter(
    (level) => (trustCounts.get(level) ?? 0) > 0,
  ).map((level) => {
    const count = trustCounts.get(level) ?? 0;
    return {
      level,
      label: TRUST_META[level].label,
      tone: TRUST_META[level].tone,
      count,
      pct: eventTotal > 0 ? Math.round((count / eventTotal) * 100) : 0,
    };
  });

  const pivotalEventIds = new Set<string>();
  for (const moment of moments) {
    if (moment.decisions.length > 0 || moment.issues.length > 0) {
      pivotalEventIds.add(moment.eventId);
    }
  }
  const momentum = buildMomentum(view, pivotalEventIds);

  const starts = parsedStarts(view);
  const hasSpan = starts.length >= 2 && starts[starts.length - 1]! > starts[0]!;
  const spanLabel = hasSpan
    ? `${clockLabel(starts[0]!)} – ${clockLabel(starts[starts.length - 1]!)}`
    : null;
  const duration = hasSpan ? durationLabel(starts[starts.length - 1]! - starts[0]!) : null;

  const stats: PulseStat[] = [
    {
      id: "moments",
      label: "순간",
      value: String(totalMoments),
      detail: phaseSlices.length > 0 ? `${phaseSlices.length}개 국면` : null,
      tone: "purple",
    },
    {
      id: "decisions",
      label: "결정",
      value: String(decisionCount),
      detail: decisionCount > 0 ? "기록됨" : "없음",
      tone: "blue",
    },
    {
      id: "issues",
      label: "이슈",
      value: String(totalIssues),
      detail: totalIssues > 0 ? `${resolved}건 해결` : "없음",
      tone: "red",
    },
    {
      id: "duration",
      label: "기간",
      value: duration ?? "—",
      detail: spanLabel,
      tone: "cyan",
    },
  ];

  return {
    totalMoments,
    decisionCount,
    stats,
    phases: phaseSlices,
    trust,
    momentum,
    issues,
    durationLabel: duration,
    spanLabel,
    continuation,
  };
}
