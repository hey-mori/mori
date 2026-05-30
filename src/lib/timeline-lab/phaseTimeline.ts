import type { MockSession } from "../../domain/types";
import type { ActivityTone } from "../timeline/activityModel";
import { buildNarrative, type NarrativeMoment } from "./narrative";
import { buildPhases, phaseForKind, PHASE_META, PHASE_ORDER, type PhaseId } from "./phases";

/**
 * Phase *timeline* reconstruction model.
 *
 * Where `buildPhases` buckets a session's moments by kind (one 탐색 bucket, one
 * 구현 bucket, ...), this model re-founds 국면 as temporal *chapters*: it walks
 * the moments in time order and cuts a new chapter on every phase-kind change.
 * A chapter is a maximal run of consecutive moments that share a phaseId, so a
 * session can read 탐색 → 구현 → 탐색 → 점검 with a phase recurring, which the
 * kind-bucket view can never express. Brief phases (even a single moment) are
 * real and get their own chapter. It is the data behind the temporal 국면 lens.
 *
 * Pure and deterministic: it derives only from the already-reviewed session via
 * `buildNarrative`. No clock, no LLM, no side effects.
 */

export type PhaseChapter = {
  /** Stable: `${phaseId}-${ordinal}`, where ordinal counts repeats of that phase. */
  id: string;
  phaseId: PhaseId;
  label: string;
  tone: ActivityTone;
  moments: NarrativeMoment[];
  /** First moment's start (parseable) or null. */
  startIso: string | null;
  /** Last moment's start (parseable) or null. */
  endIso: string | null;
  /** "HH:MM – HH:MM" (en dash), a single "HH:MM", or null. */
  spanLabel: string | null;
  decisionCount: number;
  issueCount: number;
};

export type PhaseTimeline = {
  /** Time-ordered; a phaseId MAY repeat (explore → build → explore). */
  chapters: PhaseChapter[];
  /** Honest about which path produced the chapters. */
  mode: "temporal" | "grouped";
};

function isParseable(iso: string): boolean {
  return !Number.isNaN(Date.parse(iso));
}

function hhmm(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** First / last parseable timestamps across a run of moments, with a HH:MM span label. */
function spanFor(moments: readonly NarrativeMoment[]): {
  startIso: string | null;
  endIso: string | null;
  spanLabel: string | null;
} {
  const stamped = moments.filter((m) => isParseable(m.start));
  if (stamped.length === 0) {
    return { startIso: null, endIso: null, spanLabel: null };
  }
  const startIso = stamped[0]!.start;
  const endIso = stamped[stamped.length - 1]!.start;
  const startLabel = hhmm(startIso);
  const endLabel = hhmm(endIso);
  const spanLabel = startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  return { startIso, endIso, spanLabel };
}

function makeChapter(phaseId: PhaseId, moments: NarrativeMoment[], ordinal: number): PhaseChapter {
  const { startIso, endIso, spanLabel } = spanFor(moments);
  return {
    id: `${phaseId}-${ordinal}`,
    phaseId,
    label: PHASE_META[phaseId].label,
    tone: PHASE_META[phaseId].tone,
    moments,
    startIso,
    endIso,
    spanLabel,
    decisionCount: moments.reduce((sum, m) => sum + m.decisions.length, 0),
    issueCount: moments.reduce((sum, m) => sum + m.issues.length, 0),
  };
}

/** Assign per-phaseId ordinals (0, 1, 2, ...) so chapter ids stay stable and unique. */
function withOrdinals(runs: { phaseId: PhaseId; moments: NarrativeMoment[] }[]): PhaseChapter[] {
  const counts = new Map<PhaseId, number>();
  return runs.map((run) => {
    const ordinal = counts.get(run.phaseId) ?? 0;
    counts.set(run.phaseId, ordinal + 1);
    return makeChapter(run.phaseId, run.moments, ordinal);
  });
}

function buildGrouped(view: MockSession): PhaseTimeline {
  const phases = buildPhases(view);
  const byId = new Map(phases.map((p) => [p.id, p]));
  const chapters: PhaseChapter[] = [];
  for (const id of PHASE_ORDER) {
    const phase = byId.get(id);
    if (!phase) continue;
    chapters.push(makeChapter(id, phase.moments, 0));
  }
  return { chapters, mode: "grouped" };
}

export function buildPhaseTimeline(view: MockSession): PhaseTimeline {
  const { moments } = buildNarrative(view);

  // Time data unavailable: fall back to the kind-bucket grouping.
  const parseableCount = moments.filter((m) => isParseable(m.start)).length;
  if (parseableCount < 2) {
    return buildGrouped(view);
  }

  // A chapter is a maximal run of consecutive moments that share a phaseId. A
  // new chapter starts on every phase-kind change: no look-ahead, no noise
  // absorption. Brief phases (even a single moment) are real chapters.
  const runs: { phaseId: PhaseId; moments: NarrativeMoment[] }[] = [];
  let current: { phaseId: PhaseId; moments: NarrativeMoment[] } | null = null;

  for (const moment of moments) {
    const kind = phaseForKind(moment.kind);
    if (current && kind === current.phaseId) {
      current.moments.push(moment);
    } else {
      current = { phaseId: kind, moments: [moment] };
      runs.push(current);
    }
  }

  const chapters = withOrdinals(runs);
  return { chapters, mode: "temporal" };
}
