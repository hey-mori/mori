import { describe, expect, it } from "vitest";
import type { Session, SourceRef, TimelineEvent } from "../../domain/types";
import {
  buildSessionOriginSummary,
  sourceFamilyForKind,
} from "./sessionOrigin";

const session: Session = {
  id: "s1",
  projectId: "p1",
  title: "Work unit",
  startedAt: "2026-05-22T09:00:00Z",
  endedAt: "2026-05-22T10:00:00Z",
  recordingMode: "summary",
  llmProvider: "ollama",
  llmModel: "llama",
  storageLocation: "browser",
  selectedSourceIds: [],
  status: "complete",
};

function source(overrides: Partial<SourceRef>): SourceRef {
  return {
    id: "src-1",
    sessionId: "s1",
    kind: "manualNote",
    title: "Source",
    detail: "",
    trustLevel: "verified",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-22T09:00:00Z",
    relatedEventIds: [],
    ...overrides,
  };
}

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "documentNote",
    title: "Event",
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "verified",
    confidence: 1,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

describe("sourceFamilyForKind", () => {
  it("maps current and future source kinds into broad product families", () => {
    expect(sourceFamilyForKind("claudeTranscript")).toBe("ai");
    expect(sourceFamilyForKind("githubPrImport")).toBe("code");
    expect(sourceFamilyForKind("figma")).toBe("design");
    expect(sourceFamilyForKind("linear")).toBe("tracker");
    expect(sourceFamilyForKind("unknownTool")).toBe("unknown");
  });
});

describe("buildSessionOriginSummary", () => {
  it("describes a single imported source as an imported work unit", () => {
    const summary = buildSessionOriginSummary({
      session: { ...session, sourceLabel: "C:/dev/mori" },
      sources: [source({ kind: "gitDiff" })],
      events: [event({ type: "fileCode" })],
      importCount: 1,
      isDemo: false,
    });

    expect(summary.boundaryLabel).toBe("가져온 작업 단위");
    expect(summary.sourceMixLabel).toBe("코드/변경");
    expect(summary.projectHint).toBe("C:/dev/mori");
    expect(summary.sourceCountLabel).toBe("출처 1");
    expect(summary.eventCountLabel).toBe("이벤트 1");
  });

  it("keeps mixed-source sessions explicit without changing persistence", () => {
    const summary = buildSessionOriginSummary({
      session,
      sources: [
        source({ id: "src-ai", kind: "claudeTranscript", rawRetention: "summaryOnly" }),
        source({ id: "src-git", kind: "gitDiff", rawRetention: "retained" }),
      ],
      events: [
        event({ id: "evt-ai", type: "aiConversation", trustLevel: "observed" }),
        event({ id: "evt-git", type: "fileCode", trustLevel: "verified" }),
      ],
      importCount: 2,
      isDemo: false,
    });

    expect(summary.boundaryLabel).toBe("복합 작업 단위");
    expect(summary.isMixedSource).toBe(true);
    expect(summary.sourceMixLabel).toBe("혼합 출처: AI 작업 + 코드/변경");
    expect(summary.retentionLabel).toBe("혼합 보관");
    expect(summary.trustLabel).toBe("Verified + Observed");
  });
});
