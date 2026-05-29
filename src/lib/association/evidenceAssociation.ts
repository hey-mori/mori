import type { SourceKind } from "../../domain/types";

/**
 * Evidence auto-association (P1, pure proposal helper).
 *
 * Mori's doctrine is "capture is explicit, association is automatic": evidence
 * that an explicit connector / hook / paste already captured should attach to
 * the matching session spine without the user hand-assembling a Work Bundle.
 * This pure helper scores already-captured evidence against a spine and returns
 * reviewable proposals. It never captures, never writes, and never attaches on
 * its own, proposals ride the Import Review gate. See
 * docs/design/evidence-auto-association.md.
 *
 * Scoring is a conservative, deterministic heuristic over local metadata only
 * (connector session identity, project path, time window). No LLM, no network.
 * Identical inputs always yield identical proposals.
 */

/** The session anchor a candidate may belong to. */
export type AssociationSpine = {
  id: string;
  /** Filesystem project path of the spine's work, if known. */
  projectPath?: string;
  /** Inclusive ISO window of the spine's activity. */
  windowStart: string;
  windowEnd: string;
  /** Connector identity of the spine, when it came from a connector. */
  connectorId?: string;
  externalSessionId?: string;
};

/** A captured-but-unattached piece of evidence to test against a spine. */
export type AssociationCandidate = {
  id: string;
  kind: SourceKind;
  title?: string;
  /** When the evidence was captured / occurred (a point in time), ISO. */
  occurredAt?: string;
  /** Span of the evidence's events, ISO, when it covers a range. */
  spanStart?: string;
  spanEnd?: string;
  /** Project / repo path or shared work-context hint, if known. */
  projectPath?: string;
  /** Connector identity, when the candidate is a connector event. */
  connectorId?: string;
  externalSessionId?: string;
};

export type AssociationSignal =
  | "connectorSession"
  | "projectPath"
  | "sharedDirectory"
  | "timeWindow"
  | "timeProximity";

export type AssociationConfidence = "high" | "medium" | "low";

export type EvidenceAssociationProposal = {
  candidateId: string;
  spineId: string;
  confidence: AssociationConfidence;
  /** Every signal that matched, strongest first. */
  signals: AssociationSignal[];
  /** Short Korean summary of why this was proposed; `signals` is authoritative. */
  reason: string;
};

/** Evidence captured up to this far outside the spine window still counts as near. */
const TIME_PROXIMITY_TOLERANCE_MS = 30 * 60 * 1000;
/** Minimum shared leading path segments to count as the same work area. */
const MIN_SHARED_PREFIX_SEGMENTS = 2;

const CONFIDENCE_RANK: Record<AssociationConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const SIGNAL_REASON: Record<AssociationSignal, string> = {
  connectorSession: "같은 커넥터 세션",
  projectPath: "같은 프로젝트",
  sharedDirectory: "같은 작업 폴더",
  timeWindow: "같은 시간대",
  timeProximity: "비슷한 시간대",
};

function normalizePath(path: string | undefined): string | null {
  if (!path) return null;
  const trimmed = path.replace(/\\/g, "/").replace(/\/+$/, "").trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function sharedPrefixSegments(a: string, b: string): number {
  const as = a.split("/").filter(Boolean);
  const bs = b.split("/").filter(Boolean);
  let shared = 0;
  for (let i = 0; i < Math.min(as.length, bs.length); i += 1) {
    if (as[i] !== bs[i]) break;
    shared += 1;
  }
  return shared;
}

/** The project signal a candidate earns against a spine, if any. */
function projectSignal(
  spine: AssociationSpine,
  candidate: AssociationCandidate,
): "projectPath" | "sharedDirectory" | null {
  const spinePath = normalizePath(spine.projectPath);
  const candidatePath = normalizePath(candidate.projectPath);
  if (!spinePath || !candidatePath) return null;
  if (spinePath === candidatePath) return "projectPath";
  if (sharedPrefixSegments(spinePath, candidatePath) >= MIN_SHARED_PREFIX_SEGMENTS) {
    return "sharedDirectory";
  }
  return null;
}

function parseMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The candidate's time interval [start, end], or null when it has no usable time. */
function candidateInterval(
  candidate: AssociationCandidate,
): { start: number; end: number } | null {
  const spanStart = parseMs(candidate.spanStart);
  const spanEnd = parseMs(candidate.spanEnd);
  if (spanStart !== null && spanEnd !== null) {
    return { start: Math.min(spanStart, spanEnd), end: Math.max(spanStart, spanEnd) };
  }
  const point = parseMs(candidate.occurredAt) ?? spanStart ?? spanEnd;
  if (point === null) return null;
  return { start: point, end: point };
}

/** The time signal a candidate earns against a spine, if any. */
function timeSignal(
  spine: AssociationSpine,
  candidate: AssociationCandidate,
): "timeWindow" | "timeProximity" | null {
  const wStart = parseMs(spine.windowStart);
  const wEnd = parseMs(spine.windowEnd);
  if (wStart === null || wEnd === null) return null;
  const windowStart = Math.min(wStart, wEnd);
  const windowEnd = Math.max(wStart, wEnd);
  const interval = candidateInterval(candidate);
  if (!interval) return null;
  // Overlap: the candidate interval intersects the spine window.
  if (interval.start <= windowEnd && interval.end >= windowStart) return "timeWindow";
  // Otherwise, near the window within tolerance.
  const gap =
    interval.start > windowEnd ? interval.start - windowEnd : windowStart - interval.end;
  return gap <= TIME_PROXIMITY_TOLERANCE_MS ? "timeProximity" : null;
}

function connectorSessionMatch(
  spine: AssociationSpine,
  candidate: AssociationCandidate,
): boolean {
  return Boolean(
    spine.connectorId &&
      spine.externalSessionId &&
      candidate.connectorId === spine.connectorId &&
      candidate.externalSessionId === spine.externalSessionId,
  );
}

/**
 * Score one candidate against the spine. Returns null when no signal matched
 * (Mori never invents an association from nothing) or when only weak time
 * proximity matched without any project or connector signal (too noisy to
 * propose).
 */
function scoreCandidate(
  spine: AssociationSpine,
  candidate: AssociationCandidate,
): EvidenceAssociationProposal | null {
  const signals: AssociationSignal[] = [];

  const connector = connectorSessionMatch(spine, candidate);
  if (connector) signals.push("connectorSession");

  const project = projectSignal(spine, candidate);
  if (project) signals.push(project);

  const time = timeSignal(spine, candidate);
  if (time) signals.push(time);

  const hasProject = project !== null;
  const hasWindow = time === "timeWindow";
  const hasProximity = time === "timeProximity";

  let confidence: AssociationConfidence | null = null;
  if (connector) {
    confidence = "high";
  } else if (hasProject && hasWindow) {
    confidence = "high";
  } else if (hasProject && hasProximity) {
    confidence = "medium";
  } else if (hasProject || hasWindow) {
    confidence = "low";
  }
  // Time proximity alone (no project, no connector) is too weak to propose.

  if (confidence === null) return null;

  return {
    candidateId: candidate.id,
    spineId: spine.id,
    confidence,
    signals,
    reason: signals.map((signal) => SIGNAL_REASON[signal]).join(" · "),
  };
}

/**
 * Propose which already-captured evidence candidates belong to the spine.
 * Proposals only, no writes, no capture. Sorted strongest confidence first,
 * then by candidate id for a stable order.
 */
export function buildEvidenceAssociationProposals(
  spine: AssociationSpine,
  candidates: AssociationCandidate[],
): EvidenceAssociationProposal[] {
  const proposals: EvidenceAssociationProposal[] = [];
  for (const candidate of candidates) {
    const proposal = scoreCandidate(spine, candidate);
    if (proposal) proposals.push(proposal);
  }
  return proposals.sort(
    (a, b) =>
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      a.candidateId.localeCompare(b.candidateId),
  );
}
