import { describe, expect, it } from "vitest";
import type { Artifact } from "../../domain/types";
import { buildDecisionLineage } from "./decisionLineage";
import { labDecision, labEvent, labIssue, labRelationship, labSession } from "./labFixture";

function labArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    projectId: "p1",
    sessionId: "s1",
    title: "산출물",
    kind: "document",
    sourceEventIds: [],
    createdAt: "2026-05-22T09:40:00Z",
    ...overrides,
  };
}

describe("buildDecisionLineage motivations", () => {
  it("resolves from relatedIssueIds, sourceEventIds and incoming relationships, deduped", () => {
    const lineage = buildDecisionLineage(
      labSession({
        events: [labEvent({ id: "evt-1", title: "질문" })],
        issues: [labIssue({ id: "iss-1", title: "막힘" })],
        decisions: [
          labDecision({
            id: "dec-1",
            relatedIssueIds: ["iss-1"],
            sourceEventIds: ["evt-1"],
          }),
        ],
        relationships: [
          // Incoming relationship targeting the decision; duplicates iss-1 but
          // carries a reason, and is encountered first so it wins the dedupe.
          labRelationship({
            id: "r-mot",
            fromId: "iss-1",
            fromType: "issue",
            toId: "dec-1",
            toType: "decision",
            type: "influencedDecision",
            reason: "이슈가 결정을 이끌었다",
          }),
        ],
      }),
    );

    const card = lineage.cards[0];
    expect(card.motivations).toEqual([
      { kind: "issue", id: "iss-1", label: "막힘", reason: "이슈가 결정을 이끌었다" },
      { kind: "event", id: "evt-1", label: "질문", reason: null },
    ]);
  });

  it("skips motivation refs whose target cannot be resolved", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [
          labDecision({
            id: "dec-1",
            relatedIssueIds: ["ghost-issue"],
            sourceEventIds: ["ghost-event"],
          }),
        ],
      }),
    );
    expect(lineage.cards[0].motivations).toEqual([]);
  });
});

describe("buildDecisionLineage consequences", () => {
  it("resolves from outgoing decision relationships only, not incoming", () => {
    const lineage = buildDecisionLineage(
      labSession({
        events: [labEvent({ id: "evt-1", title: "원인" })],
        artifacts: [labArtifact({ id: "art-1", title: "문서" })],
        decisions: [labDecision({ id: "dec-1" })],
        relationships: [
          labRelationship({
            id: "r-out",
            fromId: "dec-1",
            fromType: "decision",
            toId: "art-1",
            toType: "artifact",
            type: "producedArtifact",
            reason: "결정이 문서를 만들었다",
          }),
          // Incoming: must NOT appear as a consequence.
          labRelationship({
            id: "r-in",
            fromId: "evt-1",
            fromType: "event",
            toId: "dec-1",
            toType: "decision",
            type: "influencedDecision",
            reason: "원인",
          }),
        ],
      }),
    );

    expect(lineage.cards[0].consequences).toEqual([
      { kind: "artifact", id: "art-1", label: "문서", reason: "결정이 문서를 만들었다" },
    ]);
  });

  it("skips consequence refs whose target cannot be resolved", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [labDecision({ id: "dec-1" })],
        relationships: [
          labRelationship({
            id: "r-out",
            fromId: "dec-1",
            fromType: "decision",
            toId: "ghost",
            toType: "artifact",
            type: "producedArtifact",
          }),
        ],
      }),
    );
    expect(lineage.cards[0].consequences).toEqual([]);
  });
});

describe("buildDecisionLineage predictedVsActual", () => {
  it("is present when impact and a downstream event/artifact/issue both exist", () => {
    const lineage = buildDecisionLineage(
      labSession({
        artifacts: [labArtifact({ id: "art-1", title: "문서" })],
        decisions: [labDecision({ id: "dec-1", impact: ["배포 위험 감소"] })],
        relationships: [
          labRelationship({
            id: "r-out",
            fromId: "dec-1",
            fromType: "decision",
            toId: "art-1",
            toType: "artifact",
            type: "producedArtifact",
            reason: "산출",
          }),
        ],
      }),
    );

    expect(lineage.cards[0].predictedVsActual).toEqual({
      predicted: ["배포 위험 감소"],
      actual: [{ kind: "artifact", id: "art-1", label: "문서", reason: "산출" }],
    });
  });

  it("is null when impact is empty", () => {
    const lineage = buildDecisionLineage(
      labSession({
        artifacts: [labArtifact({ id: "art-1" })],
        decisions: [labDecision({ id: "dec-1", impact: [] })],
        relationships: [
          labRelationship({
            id: "r-out",
            fromId: "dec-1",
            fromType: "decision",
            toId: "art-1",
            toType: "artifact",
            type: "producedArtifact",
          }),
        ],
      }),
    );
    expect(lineage.cards[0].predictedVsActual).toBeNull();
  });

  it("is null when there is no downstream outcome", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [labDecision({ id: "dec-1", impact: ["효과"] })],
      }),
    );
    expect(lineage.cards[0].predictedVsActual).toBeNull();
  });

  it("excludes downstream decisions from actual but keeps event/artifact/issue", () => {
    const lineage = buildDecisionLineage(
      labSession({
        issues: [labIssue({ id: "iss-1", title: "후속 이슈" })],
        decisions: [
          labDecision({ id: "dec-1", impact: ["효과"] }),
          labDecision({ id: "dec-2", title: "후속 결정" }),
        ],
        relationships: [
          labRelationship({
            id: "r-to-issue",
            fromId: "dec-1",
            fromType: "decision",
            toId: "iss-1",
            toType: "issue",
            type: "createdIssue",
            reason: "이슈 생성",
          }),
          labRelationship({
            id: "r-to-dec",
            fromId: "dec-1",
            fromType: "decision",
            toId: "dec-2",
            toType: "decision",
            type: "ledTo",
            reason: "후속 결정",
          }),
        ],
      }),
    );

    const pva = lineage.cards.find((c) => c.id === "dec-1")?.predictedVsActual;
    expect(pva).toEqual({
      predicted: ["효과"],
      actual: [{ kind: "issue", id: "iss-1", label: "후속 이슈", reason: "이슈 생성" }],
    });
  });
});

describe("buildDecisionLineage status", () => {
  it("treats confirmed decisions as confirmed", () => {
    const lineage = buildDecisionLineage(
      labSession({ decisions: [labDecision({ id: "dec-1", confirmed: true })] }),
    );
    expect(lineage.cards[0].status).toBe("confirmed");
  });

  it("treats unconfirmed decisions as proposed", () => {
    const lineage = buildDecisionLineage(
      labSession({ decisions: [labDecision({ id: "dec-1", confirmed: false })] }),
    );
    expect(lineage.cards[0].status).toBe("proposed");
  });

  it("lets a contradicted relationship override a confirmed decision", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [
          labDecision({ id: "dec-1", confirmed: true }),
          labDecision({ id: "dec-2", title: "반대 결정" }),
        ],
        relationships: [
          labRelationship({
            id: "r-x",
            fromId: "dec-2",
            fromType: "decision",
            toId: "dec-1",
            toType: "decision",
            type: "contradicted",
            reason: "충돌",
          }),
        ],
      }),
    );
    expect(lineage.cards.find((c) => c.id === "dec-1")?.status).toBe("contradicted");
  });

  it("ignores a contradicted relationship whose decision endpoint is a different id", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [labDecision({ id: "dec-1", confirmed: true })],
        relationships: [
          labRelationship({
            id: "r-x",
            fromId: "other",
            fromType: "decision",
            toId: "elsewhere",
            toType: "decision",
            type: "contradicted",
          }),
        ],
      }),
    );
    expect(lineage.cards[0].status).toBe("confirmed");
  });
});

describe("buildDecisionLineage edges", () => {
  it("includes only decision → decision relationships, toning contradicted red", () => {
    const lineage = buildDecisionLineage(
      labSession({
        events: [labEvent({ id: "evt-1" })],
        decisions: [
          labDecision({ id: "dec-1" }),
          labDecision({ id: "dec-2", title: "둘째" }),
          labDecision({ id: "dec-3", title: "셋째" }),
        ],
        relationships: [
          labRelationship({
            id: "r-chain",
            fromId: "dec-1",
            fromType: "decision",
            toId: "dec-2",
            toType: "decision",
            type: "ledTo",
          }),
          labRelationship({
            id: "r-tension",
            fromId: "dec-2",
            fromType: "decision",
            toId: "dec-3",
            toType: "decision",
            type: "contradicted",
          }),
          // Not decision → decision; must be excluded.
          labRelationship({
            id: "r-evt",
            fromId: "evt-1",
            fromType: "event",
            toId: "dec-1",
            toType: "decision",
            type: "influencedDecision",
          }),
        ],
      }),
    );

    expect(lineage.edges).toEqual([
      { id: "r-chain", fromId: "dec-1", toId: "dec-2", type: "ledTo", tone: "blue" },
      { id: "r-tension", fromId: "dec-2", toId: "dec-3", type: "contradicted", tone: "red" },
    ]);
    expect(lineage.hasChain).toBe(true);
  });

  it("dedupes parallel decision edges, keeping the first", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [labDecision({ id: "dec-1" }), labDecision({ id: "dec-2", title: "둘째" })],
        relationships: [
          labRelationship({
            id: "r-a",
            fromId: "dec-1",
            fromType: "decision",
            toId: "dec-2",
            toType: "decision",
            type: "ledTo",
          }),
          labRelationship({
            id: "r-b",
            fromId: "dec-1",
            fromType: "decision",
            toId: "dec-2",
            toType: "decision",
            type: "supported",
          }),
        ],
      }),
    );
    expect(lineage.edges.map((e) => e.id)).toEqual(["r-a"]);
  });

  it("drops decision edges whose endpoints are not both known decisions", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [labDecision({ id: "dec-1" })],
        relationships: [
          labRelationship({
            id: "r-ghost",
            fromId: "dec-1",
            fromType: "decision",
            toId: "ghost",
            toType: "decision",
            type: "ledTo",
          }),
        ],
      }),
    );
    expect(lineage.edges).toEqual([]);
    expect(lineage.hasChain).toBe(false);
  });
});

describe("buildDecisionLineage ordering", () => {
  it("sorts by importance desc then createdAt asc, stable", () => {
    const lineage = buildDecisionLineage(
      labSession({
        decisions: [
          labDecision({ id: "low", importance: "low", createdAt: "2026-05-22T09:05:00Z" }),
          labDecision({ id: "high-late", importance: "high", createdAt: "2026-05-22T09:30:00Z" }),
          labDecision({ id: "high-early", importance: "high", createdAt: "2026-05-22T09:10:00Z" }),
          labDecision({ id: "med", importance: "medium", createdAt: "2026-05-22T09:00:00Z" }),
        ],
      }),
    );
    expect(lineage.cards.map((c) => c.id)).toEqual(["high-early", "high-late", "med", "low"]);
  });
});

describe("buildDecisionLineage empty", () => {
  it("returns empty cards and edges with hasChain false", () => {
    const lineage = buildDecisionLineage(labSession());
    expect(lineage.cards).toEqual([]);
    expect(lineage.edges).toEqual([]);
    expect(lineage.hasChain).toBe(false);
  });
});
