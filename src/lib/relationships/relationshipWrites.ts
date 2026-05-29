/**
 * Pure transforms for Flow Focus relationship corrections.
 *
 * Relationships between Timeline events are AI-inferred — a proposal, not
 * truth. The trace panel lets the user remove a relationship the analysis
 * got wrong, or assert one it missed. Relationships live in
 * `AnalysisResult.relationships`, and the focus graph derives from that
 * list, so editing the list is all that is needed.
 *
 * Honesty contract: an edit is never invented. When the id is unknown (or
 * an add would self-link / duplicate) the helper returns the same analysis
 * reference so callers skip the persistence write.
 */
import type { AnalysisResult } from "../analysis";
import type { Relationship, RelationshipType } from "../../domain/types";

/** Event-to-event relationship types a user can assert from the trace panel. */
export const USER_RELATIONSHIP_TYPES: RelationshipType[] = [
  "ledTo",
  "caused",
  "supported",
  "contradicted",
];

/**
 * Remove the relationship with `relationshipId` from the analysis. Returns
 * the original analysis when no relationship matches.
 */
export function removeRelationshipFromAnalysis(
  analysis: AnalysisResult,
  relationshipId: string,
): AnalysisResult {
  const next = analysis.relationships.filter(
    (relationship) => relationship.id !== relationshipId,
  );
  if (next.length === analysis.relationships.length) return analysis;
  return { ...analysis, relationships: next };
}

/** Id prefix marking a relationship the user asserted by hand. */
export const USER_RELATIONSHIP_PREFIX = "rel-user-";

/** Deterministic id for a user-asserted event-to-event relationship. */
export function userRelationshipId(
  fromId: string,
  toId: string,
  type: RelationshipType,
): string {
  return `${USER_RELATIONSHIP_PREFIX}${fromId}--${toId}--${type}`;
}

/**
 * Append a user-asserted event-to-event relationship to the analysis. The
 * relationship carries full confidence (it is a deliberate user assertion,
 * not an inference). Returns the original analysis for a self-link or when
 * the exact same relationship already exists, so adds never duplicate.
 */
export function addEventRelationship(
  analysis: AnalysisResult,
  fromId: string,
  toId: string,
  type: RelationshipType,
): AnalysisResult {
  if (fromId === toId) return analysis;
  const id = userRelationshipId(fromId, toId, type);
  if (analysis.relationships.some((relationship) => relationship.id === id)) {
    return analysis;
  }
  const relationship: Relationship = {
    id,
    fromId,
    fromType: "event",
    toId,
    toType: "event",
    type,
    confidence: 1,
    reason: "사용자가 직접 연결한 관계입니다.",
  };
  return { ...analysis, relationships: [...analysis.relationships, relationship] };
}
