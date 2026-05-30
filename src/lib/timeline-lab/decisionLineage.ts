import type {
  Decision,
  MockSession,
  Priority,
  RelationshipType,
  TrustLevel,
} from "../../domain/types";
import type { ActivityTone } from "../timeline/activityModel";

/**
 * Decision-lineage reconstruction model.
 *
 * The lab shows decisions as flat cards and ignores the ADR/IBIS-shaped fields
 * they already carry (rejected options, predicted impact) and the
 * relationships that motivate or follow from them. This model turns each
 * decision into a lineage card: what led INTO it (motivations), what it led TO
 * (consequences), and predicted vs actual impact, plus the decision → decision
 * edges that form a reasoning chain. It is the data behind the 계보 view. Pure
 * and deterministic: depends only on the passed session.
 */

export type LineageStatus = "confirmed" | "proposed" | "contradicted";

export type LineageRef = {
  kind: "event" | "issue" | "decision" | "artifact";
  id: string;
  /** The target's title. */
  label: string;
  /** The relationship.reason when sourced from a relationship, else null. */
  reason: string | null;
};

export type LineageDecisionCard = {
  id: string;
  title: string;
  decision: string;
  rationale: string;
  rejectedOptions: string[];
  impact: string[];
  importance: Priority;
  trustLevel: TrustLevel;
  status: LineageStatus;
  /** What led INTO this decision. */
  motivations: LineageRef[];
  /** What this decision led TO. */
  consequences: LineageRef[];
  /** Predicted (impact) vs the concrete downstream outcomes; null when either side is empty. */
  predictedVsActual: { predicted: string[]; actual: LineageRef[] } | null;
};

export type LineageEdge = {
  /** The relationship id. */
  id: string;
  fromId: string;
  toId: string;
  type: RelationshipType;
  /** "red" for a `contradicted` tension, else "blue". */
  tone: ActivityTone;
};

export type DecisionLineage = {
  /** Importance desc, then createdAt asc, stable. */
  cards: LineageDecisionCard[];
  /** Decision → decision relationships only. */
  edges: LineageEdge[];
  hasChain: boolean;
};

type RefKind = LineageRef["kind"];

const IMPORTANCE_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function buildDecisionLineage(view: MockSession): DecisionLineage {
  // id → title lookups, plus a kind resolver so a relationship endpoint can be
  // turned into a typed, labelled ref (and unresolved endpoints dropped).
  const eventTitle = new Map<string, string>();
  const issueTitle = new Map<string, string>();
  const decisionTitle = new Map<string, string>();
  const artifactTitle = new Map<string, string>();
  for (const event of view.events) eventTitle.set(event.id, event.title);
  for (const issue of view.issues) issueTitle.set(issue.id, issue.title);
  for (const decision of view.decisions) decisionTitle.set(decision.id, decision.title);
  for (const artifact of view.artifacts) artifactTitle.set(artifact.id, artifact.title);

  const titleFor = (kind: RefKind, id: string): string | null => {
    switch (kind) {
      case "event":
        return eventTitle.get(id) ?? null;
      case "issue":
        return issueTitle.get(id) ?? null;
      case "decision":
        return decisionTitle.get(id) ?? null;
      case "artifact":
        return artifactTitle.get(id) ?? null;
    }
  };

  const decisionIds = new Set(view.decisions.map((d) => d.id));

  const cards: LineageDecisionCard[] = view.decisions.map((decision) =>
    buildCard(decision, view, titleFor),
  );

  cards.sort((a, b) => {
    const rank = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
    if (rank !== 0) return rank;
    return compareCreatedAt(a.id, b.id, view);
  });

  const edges = buildEdges(view, decisionIds);

  return { cards, edges, hasChain: edges.length > 0 };
}

function buildCard(
  decision: Decision,
  view: MockSession,
  titleFor: (kind: RefKind, id: string) => string | null,
): LineageDecisionCard {
  // Status: confirmed/proposed by default; a contradicted relationship that
  // touches this decision (on its decision endpoint) overrides and wins.
  let status: LineageStatus = decision.confirmed ? "confirmed" : "proposed";
  for (const rel of view.relationships) {
    if (rel.type !== "contradicted") continue;
    const touchesAsDecision =
      (rel.fromType === "decision" && rel.fromId === decision.id) ||
      (rel.toType === "decision" && rel.toId === decision.id);
    if (touchesAsDecision) {
      status = "contradicted";
      break;
    }
  }

  // Motivations: relationships incoming to this decision first (so a
  // relationship-sourced ref, which carries a reason, wins the dedupe over a
  // bare relatedIssue/sourceEvent ref for the same target), then the declared
  // related issues and source events. Deduped by `${kind}:${id}`, first wins.
  const motivations: LineageRef[] = [];
  const motivationSeen = new Set<string>();
  const pushMotivation = (ref: LineageRef | null) => {
    if (ref === null) return;
    const key = `${ref.kind}:${ref.id}`;
    if (motivationSeen.has(key)) return;
    motivationSeen.add(key);
    motivations.push(ref);
  };

  for (const rel of view.relationships) {
    if (rel.toType !== "decision" || rel.toId !== decision.id) continue;
    pushMotivation(refFor(rel.fromType, rel.fromId, rel.reason, titleFor));
  }
  for (const issueId of decision.relatedIssueIds) {
    pushMotivation(refFor("issue", issueId, null, titleFor));
  }
  for (const eventId of decision.sourceEventIds) {
    pushMotivation(refFor("event", eventId, null, titleFor));
  }

  // Consequences: relationships outgoing from this decision only.
  const consequences: LineageRef[] = [];
  for (const rel of view.relationships) {
    if (rel.fromType !== "decision" || rel.fromId !== decision.id) continue;
    const ref = refFor(rel.toType, rel.toId, rel.reason, titleFor);
    if (ref !== null) consequences.push(ref);
  }

  // Predicted vs actual: predicted is the declared impact; actual is the
  // concrete downstream (event / artifact / issue) consequences. Only when both
  // sides are non-empty. Never matched semantically.
  const actual = consequences.filter(
    (ref) => ref.kind === "event" || ref.kind === "artifact" || ref.kind === "issue",
  );
  const predictedVsActual =
    decision.impact.length > 0 && actual.length > 0
      ? { predicted: decision.impact, actual }
      : null;

  return {
    id: decision.id,
    title: decision.title,
    decision: decision.decision,
    rationale: decision.rationale,
    rejectedOptions: decision.rejectedOptions,
    impact: decision.impact,
    importance: decision.importance,
    trustLevel: decision.trustLevel,
    status,
    motivations,
    consequences,
    predictedVsActual,
  };
}

function refFor(
  kind: RefKind,
  id: string,
  reason: string | null,
  titleFor: (kind: RefKind, id: string) => string | null,
): LineageRef | null {
  const label = titleFor(kind, id);
  if (label === null) return null;
  return { kind, id, label, reason };
}

function buildEdges(view: MockSession, decisionIds: ReadonlySet<string>): LineageEdge[] {
  const edges: LineageEdge[] = [];
  const seen = new Set<string>();
  for (const rel of view.relationships) {
    if (rel.fromType !== "decision" || rel.toType !== "decision") continue;
    if (!decisionIds.has(rel.fromId) || !decisionIds.has(rel.toId)) continue;
    const key = `${rel.fromId}->${rel.toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: rel.id,
      fromId: rel.fromId,
      toId: rel.toId,
      type: rel.type,
      tone: rel.type === "contradicted" ? "red" : "blue",
    });
  }
  return edges;
}

function compareCreatedAt(idA: string, idB: string, view: MockSession): number {
  const a = view.decisions.find((d) => d.id === idA)?.createdAt ?? "";
  const b = view.decisions.find((d) => d.id === idB)?.createdAt ?? "";
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
