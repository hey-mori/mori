import type { Decision, Issue, NextAction, Relationship } from "../../domain/types";
import type { AnalysisResult } from "./analysisTypes";

/**
 * Merge a deterministic "floor" run into a primary (LLM) run so the LLM
 * enriches the rule-based baseline rather than replacing it. The primary keeps
 * its summary, confidence, provider identity, and timing; the floor only
 * contributes items the primary did not already have, deduped by normalized
 * title (issues / decisions / next actions) or by endpoint + type
 * (relationships). The primary's items always win on a title clash, so a richer
 * LLM item is never overwritten by a heuristic one.
 *
 * Pure and order-stable: primary items first, then floor-only items in their
 * original order. Used by `runQuickPass` only when the LLM under-delivers, so a
 * weak model can never leave the session with an empty analysis when the
 * deterministic engine would have found something.
 */
export function mergeAnalysisFloor(primary: AnalysisResult, floor: AnalysisResult): AnalysisResult {
  const issues = unionByTitle(primary.issues, floor.issues);
  const decisions = unionByTitle(primary.decisions, floor.decisions);
  const nextActions = unionByTitle(primary.nextActions, floor.nextActions);
  const relationships = unionRelationships(primary.relationships, floor.relationships);

  const added =
    issues.length -
    primary.issues.length +
    (decisions.length - primary.decisions.length) +
    (nextActions.length - primary.nextActions.length);

  // When the primary (LLM) contributed no findings of its own, the floor is the
  // real source of what is on the board, so its summary and confidence are the
  // honest reflection — an empty-LLM run should not keep claiming a high
  // confidence over an empty extraction. The primary still keeps its provider
  // identity, timing, and the stored-summary id / session so persistence stays
  // stable.
  const primaryHadFindings =
    primary.issues.length > 0 ||
    primary.decisions.length > 0 ||
    primary.nextActions.length > 0;
  const summarySource = primaryHadFindings ? primary : floor;

  return {
    ...primary,
    confidence: summarySource.confidence,
    issues,
    decisions,
    relationships,
    nextActions,
    summary: summarySource.summary,
    rendered: {
      ...primary.rendered,
      summary: {
        ...summarySource.rendered.summary,
        id: primary.rendered.summary.id,
        sessionId: primary.rendered.summary.sessionId,
        generatedAt: primary.rendered.summary.generatedAt,
        nextActionIds: nextActions.map((action) => action.id),
      },
    },
    notes:
      added > 0
        ? [...primary.notes, `규칙 기반에서 ${added}건을 보강했습니다.`]
        : primary.notes,
  };
}

type Titled = Issue | Decision | NextAction;

function unionByTitle<T extends Titled>(primary: T[], floor: T[]): T[] {
  const seen = new Set(primary.map((item) => normalizeTitle(item.title)));
  const out = [...primary];
  for (const item of floor) {
    const key = normalizeTitle(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function unionRelationships(primary: Relationship[], floor: Relationship[]): Relationship[] {
  const key = (rel: Relationship) => `${rel.fromId}|${rel.toId}|${rel.type}`;
  const seen = new Set(primary.map(key));
  const out = [...primary];
  for (const rel of floor) {
    const k = key(rel);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(rel);
  }
  return out;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}
