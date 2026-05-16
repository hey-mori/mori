/**
 * `.mori` package accepted-memory review-on-import.
 *
 * A `.mori v0` package can carry a `consolidatedMemories` slice —
 * accepted project memory exported from another device. Importing a
 * package must **never** auto-merge those memories into the current
 * project's durable memory. Instead, this pure helper converts each
 * imported memory into a reviewable `MemoryProposal` so it flows
 * through the same Consolidation Review → accept / edit / discard
 * path as any other proposal.
 *
 * Hard rules (see `docs/project-memory-consolidation.md`):
 *   - **No auto-merge.** Output is proposals only; nothing durable is
 *     written here.
 *   - **Deduplicate.** An imported memory the project already holds
 *     is skipped — matched by `originProposalIds` overlap or by a
 *     shared normalised title within the same kind.
 *   - **Preserve provenance.** The source package id is recorded on
 *     the proposal rationale.
 *   - **Pure.** No IO, no clock, no LLM.
 *   - **No raw content.** Imported memories already carry only
 *     curated fields + typed evidence refs; nothing else is copied.
 */
import type { MemoryEvidenceRef, MemoryProposal } from "./consolidationProposals";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import type { MoriPackageV0 } from "../mori-package";
import {
  deserializeMoriPackage,
  getPackageConsolidatedMemories,
  unzipMoriPackage,
} from "../mori-package";

export type ImportedMemorySkipReason = "duplicate-origin" | "duplicate-title";

export type ImportedMemorySkip = {
  memoryId: string;
  title: string;
  reason: ImportedMemorySkipReason;
};

export type ImportedMemoryReviewResult = {
  /** Reviewable proposals — one per non-duplicate imported memory. */
  proposals: MemoryProposal[];
  /** Imported memories skipped because the project already holds them. */
  skipped: ImportedMemorySkip[];
};

export type BuildImportedMemoryProposalsInput = {
  /** Accepted memories carried by the imported `.mori` package. */
  packageMemories: readonly StoredAcceptedProjectMemory[];
  /** Accepted memories the current project already holds. */
  existingMemories: readonly StoredAcceptedProjectMemory[];
  /** Source package id, recorded on each proposal's rationale. */
  packageId?: string;
};

export function buildImportedMemoryProposals(
  input: BuildImportedMemoryProposalsInput,
): ImportedMemoryReviewResult {
  const { packageMemories, existingMemories } = input;
  const packageLabel = input.packageId ? `.mori package ${input.packageId}` : "an imported .mori package";

  const existingOriginIds = new Set<string>();
  const existingTitleKeys = new Set<string>();
  for (const memory of existingMemories) {
    for (const origin of memory.originProposalIds) existingOriginIds.add(origin);
    existingTitleKeys.add(titleKey(memory));
  }

  const proposals: MemoryProposal[] = [];
  const skipped: ImportedMemorySkip[] = [];
  // Track titles seen *within this import* so a package that lists the
  // same memory twice does not produce two proposals.
  const seenTitleKeys = new Set<string>();

  for (const memory of packageMemories) {
    const originDuplicate = memory.originProposalIds.some((origin) =>
      existingOriginIds.has(origin),
    );
    if (originDuplicate) {
      skipped.push({ memoryId: memory.id, title: memory.title, reason: "duplicate-origin" });
      continue;
    }
    const key = titleKey(memory);
    if (existingTitleKeys.has(key) || seenTitleKeys.has(key)) {
      skipped.push({ memoryId: memory.id, title: memory.title, reason: "duplicate-title" });
      continue;
    }
    seenTitleKeys.add(key);
    proposals.push(buildProposal(memory, packageLabel));
  }

  return { proposals, skipped };
}

/**
 * Parse a raw `.mori v0` package JSON string and build imported-memory
 * proposals from its `consolidatedMemories` slice. Combines
 * `deserializeMoriPackage` (which validates the package) with
 * `buildImportedMemoryProposals`. Pure — never throws; a malformed
 * package is reported as `{ ok: false }`.
 */
export type ParseImportedMemoryResult =
  | {
      ok: true;
      packageId: string;
      /** Total accepted memories carried by the package. */
      memoryCount: number;
      proposals: MemoryProposal[];
      skipped: ImportedMemorySkip[];
    }
  | { ok: false; error: string };

export function parseImportedMemoryProposals(
  packageJson: string,
  existingMemories: readonly StoredAcceptedProjectMemory[],
): ParseImportedMemoryResult {
  const trimmed = packageJson.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Paste a .mori v0 package to import." };
  }
  let pkg;
  try {
    pkg = deserializeMoriPackage(trimmed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return proposalsFromImportedPackage(pkg, existingMemories);
}

/**
 * Build imported-memory proposals from a real `.mori` **zip** package's
 * bytes. The zip counterpart of `parseImportedMemoryProposals`:
 * `unzipMoriPackage` validates the archive and the package, then the
 * `consolidatedMemories` slice becomes review proposals. Pure — never
 * throws; a corrupt zip or invalid package is reported as
 * `{ ok: false }`. Imported memory still enters review, never merges.
 */
export function parseImportedMemoryProposalsFromZip(
  bytes: Uint8Array,
  existingMemories: readonly StoredAcceptedProjectMemory[],
): ParseImportedMemoryResult {
  if (bytes.length === 0) {
    return { ok: false, error: "Pick a .mori package file to import." };
  }
  let pkg;
  try {
    pkg = unzipMoriPackage(bytes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return proposalsFromImportedPackage(pkg, existingMemories);
}

function proposalsFromImportedPackage(
  pkg: MoriPackageV0,
  existingMemories: readonly StoredAcceptedProjectMemory[],
): ParseImportedMemoryResult {
  const packageMemories = getPackageConsolidatedMemories(pkg);
  const { proposals, skipped } = buildImportedMemoryProposals({
    packageMemories,
    existingMemories,
    packageId: pkg.manifest.packageId,
  });
  return {
    ok: true,
    packageId: pkg.manifest.packageId,
    memoryCount: packageMemories.length,
    proposals,
    skipped,
  };
}

// ─── proposal construction ────────────────────────────────────────────

function buildProposal(
  memory: StoredAcceptedProjectMemory,
  packageLabel: string,
): MemoryProposal {
  const evidenceRefs: MemoryEvidenceRef[] = memory.evidenceRefs.map((ref) => ({ ...ref }));
  return {
    id: `proposal::importedMemory::${memory.id}`,
    // Carry the imported memory's own kind so it flows through the
    // normal apply path as that kind of memory.
    kind: memory.kind,
    title: memory.title,
    summary: memory.summary || memory.title,
    rationale: `Imported from ${packageLabel}. Review before adding it to this project's memory — imported memory is never auto-merged.`,
    confidence: memory.confidence.score ?? confidenceFromLabel(memory.confidence.label),
    importance: memory.importance,
    evidenceRefs,
    sourceSessionIds: [...memory.sourceSessionIds],
    relatedIssueIds: [...memory.relatedIssueIds],
    relatedDecisionIds: [...memory.relatedDecisionIds],
    proposedAction: "promote",
    status: "proposed",
    createdAt: memory.updatedAt,
    updatedAt: memory.updatedAt,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────

function titleKey(memory: StoredAcceptedProjectMemory): string {
  const normalised = memory.title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:]+$/g, "")
    .trim();
  // Title match is scoped to the kind: a decision and a risk that
  // happen to share a title are not the same memory.
  return `${memory.kind}::${normalised}`;
}

function confidenceFromLabel(label: "high" | "medium" | "low"): number {
  if (label === "high") return 0.85;
  if (label === "medium") return 0.6;
  return 0.35;
}
