/**
 * Contradiction Review — proposal helper.
 *
 * Scans accepted project memories for pairs / groups that appear to
 * conflict and emits typed `contradiction` proposals the user reviews
 * on the Consolidation Review Surface.
 *
 * Hard rules baked in (see `docs/project-memory-consolidation.md`):
 *   - **Proposals only.** This helper never resolves a contradiction
 *     in durable storage. It surfaces review candidates.
 *   - **Conservative deterministic heuristics.** No LLM, no semantic
 *     or vector matching. The single signal is: two or more
 *     current-guidance `promotedDecision` memories that share a
 *     normalised title but record different normalised summaries.
 *   - **Decisions only.** Recurring issues / evidence / risks with the
 *     same title are *recurring*, not contradictory — they are out of
 *     scope here to avoid false positives.
 *   - **Pure.** No IO, no clock.
 *   - **No raw content.** Proposals cite the memories' own evidence
 *     refs / session ids and short curated-summary excerpts — never
 *     connector logs or transcript text.
 *   - **Does not overclaim.** Confidence stays medium-low; the
 *     rationale says memories "may conflict", not that they do.
 */
import type { MemoryEvidenceRef, MemoryProposal } from "./consolidationProposals";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

/** Confidence for a same-title / different-summary decision conflict. */
const CONTRADICTION_CONFIDENCE = 0.55;

const SUMMARY_EXCERPT_LIMIT = 100;

export function buildContradictionProposals(
  acceptedMemories: readonly StoredAcceptedProjectMemory[],
): MemoryProposal[] {
  // Only current-guidance decisions are candidates. A superseded /
  // retired memory paired with its replacement is the lifecycle
  // working — not a contradiction.
  const decisions = acceptedMemories.filter(
    (memory) =>
      memory.kind === "promotedDecision" &&
      (memory.status === "accepted" || memory.status === "edited"),
  );

  const groups = new Map<string, StoredAcceptedProjectMemory[]>();
  for (const memory of decisions) {
    const key = normalise(memory.title);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(memory);
    else groups.set(key, [memory]);
  }

  const proposals: MemoryProposal[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // A real conflict needs at least two *different* summaries; two
    // memories with identical summaries are duplicates, not conflicts.
    const distinctSummaries = new Set(members.map((memory) => normalise(memory.summary)));
    if (distinctSummaries.size < 2) continue;
    proposals.push(buildProposal(members));
  }

  // Stable order: highest importance first, then by title.
  return proposals.sort((a, b) => {
    const delta = importanceRank(b.importance) - importanceRank(a.importance);
    if (delta !== 0) return delta;
    return a.title.localeCompare(b.title);
  });
}

// ─── proposal construction ────────────────────────────────────────────

function buildProposal(members: StoredAcceptedProjectMemory[]): MemoryProposal {
  const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
  const title = ordered[0]?.title ?? "Conflicting accepted decisions";

  const evidenceRefs = dedupeEvidenceRefs(
    ordered.flatMap((memory) => memory.evidenceRefs.map((ref) => ({ ...ref }))),
  );
  const sourceSessionIds = dedupe(ordered.flatMap((memory) => memory.sourceSessionIds));
  const relatedDecisionIds = dedupe(ordered.flatMap((memory) => memory.relatedDecisionIds));
  const relatedIssueIds = dedupe(ordered.flatMap((memory) => memory.relatedIssueIds));

  const sides = ordered
    .map((memory) => `${memory.id} — ${excerpt(memory.summary || memory.title)}`)
    .join("; ");

  return {
    id: `proposal::contradiction::${ordered.map((memory) => memory.id).join("+")}`,
    kind: "contradiction",
    title,
    summary: `${ordered.length} accepted decisions share this title but record different summaries.`,
    rationale: `These accepted decisions share a title and may conflict — review which is current and resolve: ${sides}`,
    confidence: CONTRADICTION_CONFIDENCE,
    importance: highestImportance(ordered),
    evidenceRefs,
    sourceSessionIds,
    relatedIssueIds,
    relatedDecisionIds,
    // Accepting this proposal flags every conflicting decision contradicted.
    targetMemoryIds: ordered.map((memory) => memory.id),
    proposedAction: "resolve",
    status: "proposed",
    // Deterministic: newest member update wins, so the proposal is
    // stable for the same input.
    createdAt: latestUpdatedAt(ordered),
    updatedAt: latestUpdatedAt(ordered),
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

function normalise(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function dedupeEvidenceRefs(refs: MemoryEvidenceRef[]): MemoryEvidenceRef[] {
  const seen = new Set<string>();
  const out: MemoryEvidenceRef[] = [];
  for (const ref of refs) {
    const key =
      ref.kind === "session"
        ? `session::${ref.sessionId}`
        : ref.kind === "event"
          ? `event::${ref.sessionId}::${ref.eventId}`
          : `source::${ref.sessionId}::${ref.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function importanceRank(importance: MemoryProposal["importance"]): number {
  if (importance === "high") return 3;
  if (importance === "medium") return 2;
  return 1;
}

function highestImportance(
  members: StoredAcceptedProjectMemory[],
): MemoryProposal["importance"] {
  let best: MemoryProposal["importance"] = "low";
  for (const memory of members) {
    if (importanceRank(memory.importance) > importanceRank(best)) best = memory.importance;
  }
  return best;
}

function latestUpdatedAt(members: StoredAcceptedProjectMemory[]): string {
  return members
    .map((memory) => memory.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop() ?? "1970-01-01T00:00:00.000Z";
}

function excerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= SUMMARY_EXCERPT_LIMIT) return collapsed;
  return `${collapsed.slice(0, SUMMARY_EXCERPT_LIMIT - 1).trimEnd()}…`;
}
