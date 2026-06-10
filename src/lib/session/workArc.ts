/**
 * Split an analysis session summary into an ordered set of work-phase steps.
 *
 * The Quick Pass summary for a real session is already a chronological
 * narrative: the Ollama chunk merge joins each pass's summary with " / ", and
 * the model separates stages with sentences. Rendered as a paragraph it reads
 * as a wall of text; split into ordered steps it becomes a scannable arc of how
 * the work actually progressed — the first slice of the AI work-flow view.
 *
 * Returns `[]` when the summary has no usable multi-step structure, so the
 * caller can fall back to showing the plain paragraph. Pure and deterministic:
 * it only reshapes text the analysis already produced, with no new model call.
 */
import { isAgentBoilerplateTitle } from "../import/sanitizeTitle";

/** A decision made or an issue surfaced within a phase's time window. */
export type PhaseMoment = { kind: "decision" | "issue"; title: string };

/** One time-grounded phase of work, derived from real event timestamps. */
export type WorkPhase = {
  startIso: string;
  endIso: string;
  /** What opened the phase — the human request that framed it. */
  label: string;
  eventCount: number;
  /**
   * Decisions made and issues surfaced within the phase's time window, in the
   * order they happened — so the arc reads "what issues and decisions there
   * were", not decisions alone.
   */
  moments: PhaseMoment[];
  /** Distinct files created or edited within the phase's time window. */
  changedFiles: number;
};

/** A gap this long between events reads as a break, so the next event opens a
 *  new work session / phase. */
const PHASE_BREAK_MS = 20 * 60 * 1000;

type PhaseSeedEvent = {
  id?: string;
  start: string;
  title: string;
  actor?: string;
  openedByUser?: boolean;
  fileTouches?: readonly { path: string; changeKind: string }[];
};

/** A decision or issue seed — grounded in time by the events it cites. */
type PhaseSeedRef = { title: string; sourceEventIds?: readonly string[] };

/**
 * Reconstruct the session's work phases from the actual event timeline, so the
 * arc is grounded in WHEN things happened rather than in a parsed summary. The
 * meaningful spine (conversation, not tool noise) is split at the largest real
 * breaks, lining each phase up with a work session, and each phase is labelled
 * by the human request that opened it. Each phase also carries the decisions,
 * issues, and file changes that fall inside its time window — tied by WHEN, not
 * by fuzzy text matching — so the arc shows what each work session produced.
 * Returns `[]` when the session is too small or has no real breaks.
 */
export function buildWorkPhases(
  events: readonly PhaseSeedEvent[],
  decisions: readonly PhaseSeedRef[] = [],
  issues: readonly PhaseSeedRef[] = [],
  max = 6,
): WorkPhase[] {
  const spine = events
    .filter((event) => event.actor !== "tool" && event.actor !== "system" && Boolean(event.start))
    .map((event) => ({ time: new Date(event.start).getTime(), event }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);
  if (spine.length < 4) return [];

  const breaks = spine
    .slice(1)
    .map((entry, index) => ({ at: index + 1, gap: entry.time - spine[index].time }))
    .filter((candidate) => candidate.gap >= PHASE_BREAK_MS);
  if (breaks.length === 0) return [];

  const cuts = breaks
    .sort((a, b) => b.gap - a.gap)
    .slice(0, max - 1)
    .map((candidate) => candidate.at)
    .sort((a, b) => a - b);

  // Every event's time, keyed by id, so a decision lands in the phase that
  // contains the earliest event it cites.
  const datedEvents = events
    .map((event) => ({ event, time: new Date(event.start).getTime() }))
    .filter((entry) => Number.isFinite(entry.time));
  const idToTime = new Map<string, number>();
  for (const { event, time } of datedEvents) {
    if (event.id) idToTime.set(event.id, time);
  }
  const datedDecisions = dateRefs(decisions, idToTime);
  const datedIssues = dateRefs(issues, idToTime);

  const bounds = [0, ...cuts, spine.length];
  const phases: WorkPhase[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const segment = spine.slice(bounds[i], bounds[i + 1]);
    if (segment.length === 0) continue;
    const startT = segment[0].time;
    const endT = segment[segment.length - 1].time;

    const changed = new Set<string>();
    for (const { event, time } of datedEvents) {
      if (time < startT || time > endT) continue;
      for (const touch of event.fileTouches ?? []) {
        if (touch.changeKind === "edited" || touch.changeKind === "wrote") changed.add(touch.path);
      }
    }
    // Decisions and issues interleave in true time order within the phase, so
    // the arc reads as what happened, not "every decision then every issue".
    const phaseMoments = [
      ...datedDecisions.map((entry) => ({ kind: "decision" as const, ...entry })),
      ...datedIssues.map((entry) => ({ kind: "issue" as const, ...entry })),
    ]
      .filter((entry) => entry.time >= startT && entry.time <= endT)
      .sort((a, b) => a.time - b.time)
      .map((entry): PhaseMoment => ({ kind: entry.kind, title: entry.ref.title.trim() }))
      .filter((moment) => moment.title);

    phases.push({
      startIso: segment[0].event.start,
      endIso: segment[segment.length - 1].event.start,
      label: phaseLabel(segment.map((entry) => entry.event)),
      eventCount: segment.length,
      moments: phaseMoments,
      changedFiles: changed.size,
    });
  }
  return phases.length >= 2 ? phases : [];
}

/** Date each ref by the earliest event it cites, dropping refs we can't place. */
function dateRefs(
  refs: readonly PhaseSeedRef[],
  idToTime: ReadonlyMap<string, number>,
): { ref: PhaseSeedRef; time: number }[] {
  return refs
    .map((ref) => ({ ref, time: groundTime(ref, idToTime) }))
    .filter((entry): entry is { ref: PhaseSeedRef; time: number } => entry.time !== null);
}

function groundTime(
  ref: PhaseSeedRef,
  idToTime: ReadonlyMap<string, number>,
): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const id of ref.sourceEventIds ?? []) {
    const time = idToTime.get(id);
    if (time !== undefined && time < earliest) earliest = time;
  }
  return Number.isFinite(earliest) ? earliest : null;
}

/** A bare continuation prompt that carries no real intent (Claude's resumed
 *  sessions open with these), so it should not become a phase label. */
const GENERIC_REQUEST = /continue from where you left off|^\s*(계속|이어서)(\s*진행)?\s*[.!?]*\s*$/i;

function phaseLabel(segment: PhaseSeedEvent[]): string {
  // The human request that opened the phase frames its intent. Take only its
  // first clause so a run-on opener does not become a messy label, and fall back
  // to a neutral "이어서 작업" when the opener is boilerplate or a contentless
  // continuation prompt (those read worse than an honest neutral label).
  const request = segment.find((event) => event.openedByUser);
  const seed = (request ?? segment[0])?.title ?? "";
  if (isAgentBoilerplateTitle(seed)) return "이어서 작업";
  // First sentence, keeping its terminator (so "왜 이렇게?" stays a question).
  const firstClause = seed.match(/^[^.!?。\n]*[.!?。]?/)?.[0] ?? seed;
  const cleaned = firstClause
    .replace(/\s+/g, " ")
    .replace(/[`*#>]+/g, "")
    .trim();
  if (!cleaned || GENERIC_REQUEST.test(cleaned)) return "이어서 작업";
  return cleaned.length > 64 ? `${cleaned.slice(0, 63)}…` : cleaned;
}

export function buildWorkArc(summary: string | null | undefined, max = 6): string[] {
  const text = (summary ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];

  // Primary split on the explicit " / " separator the chunk merge writes.
  let parts = splitClean(text, /\s*\/\s*/);
  // No explicit separator (single-chunk or deterministic summary): fall back to
  // sentence boundaries so one long narrative still breaks into steps.
  if (parts.length < 2) {
    parts = splitClean(text, /[.!?。]+\s+/);
  }

  // An arc needs at least two steps; otherwise the caller shows the paragraph.
  if (parts.length < 2) return [];
  return parts.slice(0, max);
}

function splitClean(text: string, separator: RegExp): string[] {
  return text
    .split(separator)
    .map((part) =>
      part
        .trim()
        // Drop a leading bullet / separator and any trailing sentence
        // punctuation so each step reads as a clean phase label.
        .replace(/^[\s·\-–—]+/, "")
        .replace(/[\s.!?。]+$/, ""),
    )
    .filter((part) => part.length > 0);
}
