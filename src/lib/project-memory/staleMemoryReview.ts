/**
 * Stale Memory Review — proposal helper.
 *
 * Scans accepted project memories for signals that a memory is likely
 * outdated, superseded, or in need of a re-check, and emits typed
 * `staleMemory` proposals the user reviews on the Consolidation Review
 * Surface.
 *
 * Hard rules baked in (see `docs/project-memory-consolidation.md`):
 *   - **Proposals only.** This helper never marks a memory stale in
 *     durable storage. It produces review candidates; the user decides.
 *   - **Explicit signals first.** Supersession / retirement and an
 *     explicit reviewer note are strong signals. Time alone is a weak
 *     fallback, applied *only* to next-session recommendations older
 *     than 30 days — never blanket time-decay.
 *   - **Pure.** No IO, no LLM. The only clock is the injectable `now`.
 *   - **No raw content.** Proposals cite the memory's own evidence
 *     refs / session ids and a short reviewer-note excerpt — never
 *     connector logs or transcript text.
 *
 * Confidence ladder:
 *   - explicit `superseded` / `retired` status → high (0.9)
 *   - explicit stale / revisit reviewer note   → medium (0.6)
 *   - time-only next-session recommendation    → low (0.3)
 */
import type { MemoryEvidenceRef, MemoryProposal } from "./consolidationProposals";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

export type StaleMemorySignal = "superseded-or-retired" | "explicit-note" | "time-only";

export type BuildStaleMemoryProposalsOptions = {
  /** Reference time for the time-only signal. Defaults to `Date.now()`. */
  now?: string;
};

/** Time-only staleness applies only to next-session recommendations. */
export const STALE_NEXT_SESSION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOTE_EXCERPT_LIMIT = 120;

/**
 * Reviewer-note keywords that count as an explicit "revisit this"
 * signal. Deliberately small and explicit — no fuzzy matching.
 */
const STALE_NOTE_KEYWORDS = [
  "stale",
  "outdated",
  "obsolete",
  "revisit",
  "re-check",
  "recheck",
  "re-verify",
  "reverify",
  "no longer",
  "out of date",
  "오래된",
  "구식",
  "재검토",
  "재확인",
  "다시 확인",
];

export function buildStaleMemoryProposals(
  acceptedMemories: readonly StoredAcceptedProjectMemory[],
  options: BuildStaleMemoryProposalsOptions = {},
): MemoryProposal[] {
  const nowMs = parseTime(options.now) ?? Date.now();
  const proposals: MemoryProposal[] = [];

  for (const memory of acceptedMemories) {
    const detection = detectStaleSignal(memory, nowMs);
    if (detection) proposals.push(buildProposal(memory, detection));
  }

  // Strongest signal first, then by importance, for a stable review order.
  return proposals.sort((a, b) => b.confidence - a.confidence);
}

// ─── detection ────────────────────────────────────────────────────────

type StaleDetection = {
  signal: StaleMemorySignal;
  confidence: number;
  rationale: string;
};

function detectStaleSignal(
  memory: StoredAcceptedProjectMemory,
  nowMs: number,
): StaleDetection | null {
  // 1. Explicit supersession / retirement — strongest signal.
  if (memory.status === "superseded" || memory.status === "retired") {
    return {
      signal: "superseded-or-retired",
      confidence: 0.9,
      rationale:
        memory.status === "superseded"
          ? `Accepted memory is marked superseded${
              memory.supersededBy ? ` by ${memory.supersededBy}` : ""
            } — confirm it should be flagged stale.`
          : "Accepted memory is marked retired — confirm it should be flagged stale.",
    };
  }

  // 2. Explicit reviewer note asking for a re-check.
  const noteKeyword = matchedStaleKeyword(memory.reviewNote);
  if (noteKeyword) {
    return {
      signal: "explicit-note",
      confidence: 0.6,
      rationale: `Reviewer note flags this memory for re-check ("${noteKeyword}"): ${excerpt(
        memory.reviewNote ?? "",
      )}`,
    };
  }

  // 3. Time-only fallback — next-session recommendations only.
  if (memory.kind === "nextSessionRecommendation") {
    const touchedMs = parseTime(memory.updatedAt) ?? parseTime(memory.acceptedAt);
    if (touchedMs !== null) {
      const ageDays = Math.floor((nowMs - touchedMs) / MS_PER_DAY);
      if (ageDays > STALE_NEXT_SESSION_DAYS) {
        return {
          signal: "time-only",
          confidence: 0.3,
          rationale: `Next-session recommendation accepted ${ageDays} days ago with no update — confirm it is still relevant.`,
        };
      }
    }
  }

  return null;
}

function matchedStaleKeyword(note: string | undefined): string | null {
  if (!note) return null;
  const haystack = note.toLowerCase();
  for (const keyword of STALE_NOTE_KEYWORDS) {
    if (haystack.includes(keyword)) return keyword;
  }
  return null;
}

// ─── proposal construction ────────────────────────────────────────────

function buildProposal(
  memory: StoredAcceptedProjectMemory,
  detection: StaleDetection,
): MemoryProposal {
  // `StoredMemoryEvidenceRef` is structurally identical to
  // `MemoryEvidenceRef`; carry the memory's own refs through.
  const evidenceRefs: MemoryEvidenceRef[] = memory.evidenceRefs.map((ref) => ({ ...ref }));
  // Time-only is a weak signal: keep watching rather than mark stale.
  const proposedAction = detection.signal === "time-only" ? "keepWatching" : "markStale";
  return {
    id: `proposal::staleMemory::${memory.id}`,
    kind: "staleMemory",
    title: memory.title,
    summary: memory.summary || memory.title,
    rationale: detection.rationale,
    confidence: detection.confidence,
    importance: memory.importance,
    evidenceRefs,
    sourceSessionIds: [...memory.sourceSessionIds],
    relatedIssueIds: [...memory.relatedIssueIds],
    relatedDecisionIds: [...memory.relatedDecisionIds],
    proposedAction,
    status: "proposed",
    createdAt: memory.updatedAt,
    updatedAt: memory.updatedAt,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

function parseTime(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function excerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= NOTE_EXCERPT_LIMIT) return collapsed;
  return `${collapsed.slice(0, NOTE_EXCERPT_LIMIT - 1).trimEnd()}…`;
}
