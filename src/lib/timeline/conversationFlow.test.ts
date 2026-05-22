import { describe, expect, it } from "vitest";
import type { MoriMockSession, TimelineEvent } from "../../domain/types";
import {
  describeConversationContext,
  isConversationSession,
  splitTurnSegments,
} from "./conversationFlow";

function turn(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "사용자 질문",
    summary: "Claude 응답",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

describe("isConversationSession", () => {
  it("is true when the session is overwhelmingly conversation turns", () => {
    const events = Array.from({ length: 10 }, (_, index) =>
      turn({ id: `evt-${index}` }),
    );
    expect(isConversationSession(events)).toBe(true);
  });

  it("tolerates a few derived non-conversation events", () => {
    const events = [
      ...Array.from({ length: 9 }, (_, index) => turn({ id: `evt-${index}` })),
      turn({ id: "evt-decision", type: "decision" }),
    ];
    expect(isConversationSession(events)).toBe(true);
  });

  it("is false for a mixed research/build session", () => {
    const events = [
      turn({ id: "a", type: "aiConversation" }),
      turn({ id: "b", type: "webResearch" }),
      turn({ id: "c", type: "fileCode" }),
      turn({ id: "d", type: "decision" }),
    ];
    expect(isConversationSession(events)).toBe(false);
  });

  it("is false for an empty session and for a tiny one", () => {
    expect(isConversationSession([])).toBe(false);
    expect(isConversationSession([turn(), turn({ id: "evt-2" })])).toBe(false);
  });
});

describe("describeConversationContext", () => {
  function session(overrides: Partial<MoriMockSession["session"]> = {}): MoriMockSession {
    return {
      project: { id: "p1", name: "Mori", description: "", createdAt: "", updatedAt: "" },
      session: {
        id: "s1",
        projectId: "p1",
        title: "충돌 해결 대화",
        startedAt: "2026-05-22T09:00:00Z",
        endedAt: "2026-05-22T09:30:00Z",
        recordingMode: "full",
        llmProvider: "cloudApi",
        llmModel: "claude",
        storageLocation: "",
        selectedSourceIds: [],
        status: "complete",
        ...overrides,
      },
      sources: [],
      events: [turn(), turn({ id: "evt-2" }), turn({ id: "evt-3" })],
      issues: [],
      decisions: [],
      relationships: [],
      artifacts: [],
      nextActions: [],
      summary: {
        id: "sum",
        sessionId: "s1",
        sessionSummary: "",
        resumePrompt: "",
        reportMarkdown: "",
        nextActionIds: [],
        generatedAt: "",
      },
    };
  }

  it("uses the source label as the project when present", () => {
    const context = describeConversationContext(session({ sourceLabel: "C:/dev/mori" }));
    expect(context.title).toBe("충돌 해결 대화");
    expect(context.projectLabel).toBe("C:/dev/mori");
    expect(context.turnCount).toBe(3);
  });

  it("falls back to the project name when no source label exists", () => {
    const context = describeConversationContext(session());
    expect(context.projectLabel).toBe("Mori");
  });
});

describe("splitTurnSegments", () => {
  it("splits a paired turn into a user ask and a Claude reply", () => {
    const segments = splitTurnSegments(
      turn({ title: "충돌을 어떻게 해결하지?", summary: "rebase 대신 merge를 추천합니다." }),
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]?.role).toBe("user");
    expect(segments[0]?.text).toContain("충돌");
    expect(segments[1]?.role).toBe("assistant");
    expect(segments[1]?.label).toBe("Claude");
  });

  it("flags mechanical tool output as a muted tool segment", () => {
    const segments = splitTurnSegments(
      turn({ title: "테스트 실행해줘", summary: "$ npm test\n실행 중..." }),
    );
    expect(segments[1]?.role).toBe("tool");
    expect(segments[1]?.label).toBe("도구 호출");
  });

  it("does not duplicate the reply when it matches the ask", () => {
    const segments = splitTurnSegments(turn({ title: "같은 텍스트", summary: "같은 텍스트" }));
    expect(segments).toHaveLength(1);
    expect(segments[0]?.role).toBe("user");
  });

  it("never drops an empty turn", () => {
    const segments = splitTurnSegments(
      turn({ title: "(no response captured)", summary: "" }),
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.role).toBe("system");
  });
});
