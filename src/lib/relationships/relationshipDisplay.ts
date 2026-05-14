import type { RelationshipType, TrustLevel } from "../../domain/types";
import { describeConfidence as describeConfidenceShared, getTrustDisplay } from "../evidence/trust";

export type RelationshipDisplay = {
  label: string;
  tone: string;
  description: string;
};

const RELATIONSHIP_TABLE: Record<RelationshipType, RelationshipDisplay> = {
  ledTo: { label: "Led to", tone: "blue", description: "Event led directly into the next." },
  caused: { label: "Caused", tone: "red", description: "Source caused the target." },
  supported: { label: "Supported", tone: "green", description: "Source supported the target with evidence." },
  contradicted: { label: "Contradicted", tone: "orange", description: "Source contradicted the target." },
  createdIssue: { label: "Created issue", tone: "red", description: "Event surfaced an issue." },
  resolvedIssue: { label: "Resolved issue", tone: "green", description: "Event resolved an issue." },
  influencedDecision: { label: "Influenced decision", tone: "purple", description: "Event informed a decision." },
  producedArtifact: { label: "Produced artifact", tone: "blue", description: "Event produced an artifact." },
  splitFrom: { label: "Split from", tone: "gray", description: "Event was split from another event." },
  mergedInto: { label: "Merged into", tone: "gray", description: "Event was merged into another." },
};

export function getRelationshipDisplay(type: RelationshipType): RelationshipDisplay {
  return RELATIONSHIP_TABLE[type] ?? { label: type, tone: "gray", description: "" };
}

export function describeRelationshipConfidence(confidence: number): { label: string; tone: string } {
  if (!Number.isFinite(confidence)) return { label: "—", tone: "gray" };
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return describeConfidenceShared(pct);
}

export function describeTrustLevel(trust: TrustLevel): { label: string; tone: string } {
  const display = getTrustDisplay(trust);
  return { label: display.label, tone: display.tone };
}
