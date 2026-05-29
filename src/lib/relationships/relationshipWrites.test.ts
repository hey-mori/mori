import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import type { AnalysisResult } from "../analysis";
import {
  addEventRelationship,
  removeRelationshipFromAnalysis,
  userRelationshipId,
} from "./relationshipWrites";

function analysis(): AnalysisResult {
  return {
    runId: "run-rel",
    providerName: "deterministic-heuristic-v1",
    providerLabel: "Deterministic",
    sessionId: mockSession.session.id,
    projectId: mockSession.project.id,
    generatedAt: "2026-05-18T11:00:00.000Z",
    durationMs: 1,
    inputEventCount: 0,
    inputSourceCount: 0,
    summary: { sessionSummary: "", resumePrompt: "", highlights: [] },
    issues: [],
    decisions: [],
    relationships: [
      {
        id: "rel-1",
        fromId: "evt-a",
        fromType: "event",
        toId: "evt-b",
        toType: "event",
        type: "ledTo",
        confidence: 0.8,
        reason: "inferred",
      },
    ],
    nextActions: [],
    rendered: {
      summary: {
        id: "s",
        sessionId: mockSession.session.id,
        sessionSummary: "",
        resumePrompt: "",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "2026-05-18T11:00:00.000Z",
      },
    },
    confidence: 0.5,
    notes: [],
  };
}

describe("removeRelationshipFromAnalysis", () => {
  it("drops the relationship with the given id", () => {
    const next = removeRelationshipFromAnalysis(analysis(), "rel-1");
    expect(next.relationships).toHaveLength(0);
  });

  it("returns the original analysis for an unknown id", () => {
    const base = analysis();
    expect(removeRelationshipFromAnalysis(base, "missing")).toBe(base);
  });
});

describe("addEventRelationship", () => {
  it("appends a full-confidence user relationship", () => {
    const next = addEventRelationship(analysis(), "evt-a", "evt-c", "caused");
    const added = next.relationships.find(
      (r) => r.id === userRelationshipId("evt-a", "evt-c", "caused"),
    );
    expect(added).toBeDefined();
    expect(added?.confidence).toBe(1);
    expect(added?.fromType).toBe("event");
  });

  it("refuses a self-link and never duplicates", () => {
    const base = analysis();
    expect(addEventRelationship(base, "evt-a", "evt-a", "ledTo")).toBe(base);
    const once = addEventRelationship(base, "evt-a", "evt-c", "caused");
    expect(addEventRelationship(once, "evt-a", "evt-c", "caused")).toBe(once);
  });
});
