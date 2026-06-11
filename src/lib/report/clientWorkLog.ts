/**
 * Client work log — a billable, client-safe view of what a session delivered.
 *
 * Freelancer reporting needs two things the existing client-safe report does not
 * yet derive: the **scope** (the opening ask plus any follow-up asks that
 * widened it) and a **work log** (dated, time-boxed entries a client can read as
 * progress / a freelancer can bill from). Both come from the session's real work
 * phases (`buildWorkPhases`, grounded in actual event timestamps and breaks), so
 * nothing is invented: a session worked in three sittings becomes three log
 * entries with real spans, and the second/third opening request reads as scope
 * that grew. Pure and deterministic; the report surface renders it and the
 * client-safe privacy filters still apply to the wording.
 */
import type { Decision, Issue, TimelineEvent } from "../../domain/types";
import { buildWorkPhases } from "../session/workArc";

export type ClientWorkLogEntry = {
  /** "6월 1일". */
  dateLabel: string;
  /** "10:17 – 15:59" or a single time when the entry has no span. */
  spanLabel: string;
  /** "5시간 42분" / "48분"; null when timing is missing. */
  durationLabel: string | null;
  /** One client-readable line — the phase's headline outcome or its ask. */
  summary: string;
  decisionCount: number;
  changedFiles: number;
};

export type ClientWorkLog = {
  /** The opening ask, and any later asks that widened the engagement. */
  scope: { opening: string; additions: string[] };
  entries: ClientWorkLogEntry[];
  /** Total worked time across entries, e.g. "약 8시간"; null when unknown. */
  totalDurationLabel: string | null;
};

export function buildClientWorkLog(input: {
  events: readonly TimelineEvent[];
  decisions: readonly Decision[];
  issues?: readonly Issue[];
}): ClientWorkLog {
  const phases = buildWorkPhases(
    input.events as TimelineEvent[],
    input.decisions as Decision[],
    (input.issues ?? []) as Issue[],
    12,
  );

  if (phases.length > 0) {
    const entries = phases.map((phase) => {
      const decision = phase.moments.find((moment) => moment.kind === "decision");
      return {
        dateLabel: dateLabel(phase.startIso),
        spanLabel: spanLabel(phase.startIso, phase.endIso),
        durationLabel: durationLabel(phase.startIso, phase.endIso),
        summary: decision?.title ?? phase.label,
        decisionCount: phase.moments.filter((moment) => moment.kind === "decision").length,
        changedFiles: phase.changedFiles,
      };
    });
    return {
      scope: {
        opening: phases[0].label,
        additions: phases.slice(1).map((phase) => phase.label),
      },
      entries,
      totalDurationLabel: totalDurationLabel(
        phases.map((phase) => spanMs(phase.startIso, phase.endIso)),
      ),
    };
  }

  // One continuous sitting (no phase breaks): a single log entry over the
  // session's full event span, scoped by its opening request.
  const dated = input.events
    .map((event) => ({ event, time: parseTime(event.start) }))
    .filter((entry) => entry.time > 0)
    .sort((a, b) => a.time - b.time);
  if (dated.length === 0) {
    return { scope: { opening: "세션 작업", additions: [] }, entries: [], totalDurationLabel: null };
  }
  const startIso = dated[0].event.start;
  const endIso = dated[dated.length - 1].event.start;
  const opening =
    input.events.find((event) => event.openedByUser)?.title ?? dated[0].event.title ?? "세션 작업";
  return {
    scope: { opening, additions: [] },
    entries: [
      {
        dateLabel: dateLabel(startIso),
        spanLabel: spanLabel(startIso, endIso),
        durationLabel: durationLabel(startIso, endIso),
        summary: opening,
        decisionCount: input.decisions.length,
        changedFiles: 0,
      },
    ],
    totalDurationLabel: totalDurationLabel([spanMs(startIso, endIso)]),
  };
}

function parseTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function spanMs(startIso: string, endIso: string): number {
  const start = parseTime(startIso);
  const end = parseTime(endIso);
  return start > 0 && end > start ? end - start : 0;
}

function dateLabel(iso: string): string {
  const match = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[2])}월 ${Number(match[3])}일` : "";
}

function timeLabel(iso: string): string {
  const match = (iso ?? "").match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function spanLabel(startIso: string, endIso: string): string {
  const start = timeLabel(startIso);
  const end = timeLabel(endIso);
  if (!start) return "";
  if (!end || end === start) return start;
  return `${start} – ${end}`;
}

function durationLabel(startIso: string, endIso: string): string | null {
  return formatDuration(spanMs(startIso, endIso));
}

function formatDuration(ms: number): string | null {
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

function totalDurationLabel(spans: number[]): string | null {
  const total = spans.reduce((sum, ms) => sum + ms, 0);
  const label = formatDuration(total);
  return label ? `약 ${label}` : null;
}
