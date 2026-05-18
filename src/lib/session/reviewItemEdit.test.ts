import { describe, expect, it } from "vitest";
import type { MoriAnalysisResult } from "../analysis";
import { moriMockSession } from "../../domain/mock-data";
import {
  applyDecisionEdit,
  applyIssueEdit,
  setDecisionFields,
  setIssueFields,
} from "./reviewItemEdit";

const editedAt = "2026-05-18T12:00:00.000Z";

function analysis(): MoriAnalysisResult {
  return {
    runId: "run-edit",
    providerName: "deterministic-heuristic-v1",
    providerLabel: "Deterministic",
    sessionId: moriMockSession.session.id,
    projectId: moriMockSession.project.id,
    generatedAt: "2026-05-18T11:00:00.000Z",
    durationMs: 1,
    inputEventCount: 0,
    inputSourceCount: 0,
    summary: { sessionSummary: "summary", resumePrompt: "prompt", highlights: [] },
    issues: [{ ...moriMockSession.issues[0]!, status: "open" }],
    decisions: [{ ...moriMockSession.decisions[0]!, confirmed: false }],
    relationships: [...moriMockSession.relationships],
    nextActions: [],
    rendered: {
      summary: {
        id: "summary-run-edit",
        sessionId: moriMockSession.session.id,
        sessionSummary: "summary",
        resumePrompt: "prompt",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "2026-05-18T11:00:00.000Z",
      },
    },
    confidence: 0.5,
    notes: [],
  };
}

describe("setIssueFields", () => {
  it("updates editable issue fields and marks the user correction", () => {
    const original = moriMockSession.issues[0]!;
    const next = setIssueFields(
      original,
      { title: "Corrected issue", description: "Corrected description" },
      editedAt,
    );

    expect(next.title).toBe("Corrected issue");
    expect(next.description).toBe("Corrected description");
    expect(next.editedByUser).toBe(true);
    expect(next.editedAt).toBe(editedAt);
    expect(next.updatedAt).toBe(editedAt);
  });

  it("preserves status, evidence, related links, confidence, and trust", () => {
    const original = moriMockSession.issues[0]!;
    const next = setIssueFields(original, { title: "Corrected issue" }, editedAt);

    expect(next.status).toBe(original.status);
    expect(next.sourceEventIds).toEqual(original.sourceEventIds);
    expect(next.relatedDecisionIds).toEqual(original.relatedDecisionIds);
    expect(next.relatedFileIds).toEqual(original.relatedFileIds);
    expect(next.confidence).toBe(original.confidence);
    expect(next.trustLevel).toBe(original.trustLevel);
  });

  it("leaves old issue records without edit metadata valid", () => {
    const original = moriMockSession.issues[0]!;
    expect(original.editedByUser).toBeUndefined();
    expect(original.editedAt).toBeUndefined();
  });
});

describe("setDecisionFields", () => {
  it("updates editable decision fields and marks the user correction", () => {
    const original = moriMockSession.decisions[0]!;
    const next = setDecisionFields(
      original,
      {
        title: "Corrected decision",
        decision: "Corrected decision text",
        rationale: "Corrected rationale",
      },
      editedAt,
    );

    expect(next.title).toBe("Corrected decision");
    expect(next.decision).toBe("Corrected decision text");
    expect(next.rationale).toBe("Corrected rationale");
    expect(next.editedByUser).toBe(true);
    expect(next.editedAt).toBe(editedAt);
  });

  it("preserves confirmation, evidence, related links, importance, and trust", () => {
    const original = { ...moriMockSession.decisions[0]!, confirmed: true };
    const next = setDecisionFields(original, { rationale: "Corrected rationale" }, editedAt);

    expect(next.confirmed).toBe(true);
    expect(next.sourceEventIds).toEqual(original.sourceEventIds);
    expect(next.relatedIssueIds).toEqual(original.relatedIssueIds);
    expect(next.relatedSourceIds).toEqual(original.relatedSourceIds);
    expect(next.importance).toBe(original.importance);
    expect(next.trustLevel).toBe(original.trustLevel);
  });

  it("leaves old decision records without edit metadata valid", () => {
    const original = moriMockSession.decisions[0]!;
    expect(original.editedByUser).toBeUndefined();
    expect(original.editedAt).toBeUndefined();
  });
});

describe("applyIssueEdit / applyDecisionEdit", () => {
  it("updates the matching issue in analysis", () => {
    const original = analysis();
    const next = applyIssueEdit(
      original,
      original.issues[0]!.id,
      { title: "Corrected issue" },
      editedAt,
    );

    expect(next).not.toBe(original);
    expect(next.issues[0]!.title).toBe("Corrected issue");
    expect(next.decisions).toBe(original.decisions);
  });

  it("updates the matching decision in analysis", () => {
    const original = analysis();
    const next = applyDecisionEdit(
      original,
      original.decisions[0]!.id,
      { decision: "Corrected decision text" },
      editedAt,
    );

    expect(next).not.toBe(original);
    expect(next.decisions[0]!.decision).toBe("Corrected decision text");
    expect(next.issues).toBe(original.issues);
  });

  it("returns the original analysis for an unknown id", () => {
    const original = analysis();
    expect(applyIssueEdit(original, "missing", { title: "Nope" }, editedAt)).toBe(original);
    expect(applyDecisionEdit(original, "missing", { title: "Nope" }, editedAt)).toBe(original);
  });

  it("returns the original analysis when edits do not change visible fields", () => {
    const original = analysis();
    expect(
      applyIssueEdit(original, original.issues[0]!.id, { title: original.issues[0]!.title }, editedAt),
    ).toBe(original);
    expect(
      applyDecisionEdit(
        original,
        original.decisions[0]!.id,
        { rationale: original.decisions[0]!.rationale },
        editedAt,
      ),
    ).toBe(original);
  });
});
