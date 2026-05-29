import type { ConnectorEvent } from "../connectors/types";
import { connectorEventsToCandidates } from "./associationCandidates";
import {
  buildEvidenceAssociationProposals,
  type AssociationCandidate,
  type AssociationSpine,
  type EvidenceAssociationProposal,
} from "./evidenceAssociation";

/**
 * Evidence auto-association view (P2.5).
 *
 * The pure capstone of the association library layer: it assembles candidates
 * from real inputs, applies the one domain rule that the raw scorer cannot know
 * on its own, a spine must never propose its own conversation as a rib, and
 * tallies the surviving proposals by confidence for a UI to render.
 *
 * Still pure, still additive: no capture, no fetch, no store, no write. The
 * stateful Import Review integration (P3) consumes this. See
 * docs/design/evidence-auto-association.md.
 */

export type EvidenceAssociationInput = {
  spine: AssociationSpine;
  /** Already-captured connector events (inbox / recent capture) to consider. */
  connectorEvents?: ConnectorEvent[];
  /** Candidates the caller already built from other sources (git diff, note, …). */
  candidates?: AssociationCandidate[];
};

export type EvidenceAssociationView = {
  spineId: string;
  proposals: EvidenceAssociationProposal[];
  highCount: number;
  mediumCount: number;
  lowCount: number;
  total: number;
};

/** True when the candidate is the spine's own connector conversation, not a rib. */
function isSpineItself(spine: AssociationSpine, candidate: AssociationCandidate): boolean {
  return Boolean(
    spine.connectorId &&
      spine.externalSessionId &&
      candidate.connectorId === spine.connectorId &&
      candidate.externalSessionId === spine.externalSessionId,
  );
}

/**
 * Build the reviewable association view for a spine. Combines connector-derived
 * and caller-supplied candidates, drops the spine's own session and duplicate
 * ids, scores the rest, and tallies by confidence.
 */
export function buildEvidenceAssociationView(
  input: EvidenceAssociationInput,
): EvidenceAssociationView {
  const fromConnectors = connectorEventsToCandidates(input.connectorEvents ?? []);
  const combined = [...fromConnectors, ...(input.candidates ?? [])];

  const seen = new Set<string>();
  const candidates: AssociationCandidate[] = [];
  for (const candidate of combined) {
    if (seen.has(candidate.id)) continue;
    if (isSpineItself(input.spine, candidate)) continue;
    seen.add(candidate.id);
    candidates.push(candidate);
  }

  const proposals = buildEvidenceAssociationProposals(input.spine, candidates);
  return {
    spineId: input.spine.id,
    proposals,
    highCount: proposals.filter((p) => p.confidence === "high").length,
    mediumCount: proposals.filter((p) => p.confidence === "medium").length,
    lowCount: proposals.filter((p) => p.confidence === "low").length,
    total: proposals.length,
  };
}
