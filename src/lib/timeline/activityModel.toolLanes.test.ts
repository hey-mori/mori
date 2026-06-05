import { describe, expect, it } from "vitest";
import type { EventActor, TimelineEvent } from "../../domain/types";
import { getTimelineLaneForEvent } from "./activityModel";

function toolEvent(
  toolName: string | undefined,
  overrides: Partial<TimelineEvent> = {},
  actor: EventActor = "tool",
): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "turn",
    summary: "",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    actor,
    ...(toolName ? { toolName } : {}),
    ...overrides,
  };
}

describe("tool-aware lane routing", () => {
  it("routes file-mutating tools to the 코드·파일 lane", () => {
    expect(getTimelineLaneForEvent({ event: toolEvent("Edit") })).toBe("files");
    expect(getTimelineLaneForEvent({ event: toolEvent("Write") })).toBe("files");
    expect(getTimelineLaneForEvent({ event: toolEvent("MultiEdit") })).toBe("files");
    expect(getTimelineLaneForEvent({ event: toolEvent("NotebookEdit") })).toBe("files");
  });

  it("routes web tools to the research lane", () => {
    expect(getTimelineLaneForEvent({ event: toolEvent("WebFetch") })).toBe("research");
    expect(getTimelineLaneForEvent({ event: toolEvent("WebSearch") })).toBe("research");
  });

  it("routes a shell test run to the build lane but a plain command to command", () => {
    expect(
      getTimelineLaneForEvent({ event: toolEvent("Bash", { summary: "🔧 Bash: npm test" }) }),
    ).toBe("build");
    expect(
      getTimelineLaneForEvent({ event: toolEvent("Bash", { summary: "🔧 Bash: ls -la src" }) }),
    ).toBe("command");
  });

  it("routes read-only tools to the command lane", () => {
    expect(getTimelineLaneForEvent({ event: toolEvent("Read") })).toBe("command");
    expect(getTimelineLaneForEvent({ event: toolEvent("Grep") })).toBe("command");
    expect(getTimelineLaneForEvent({ event: toolEvent(undefined) })).toBe("command");
  });

  it("does not let a mentioned keyword hijack a tool event", () => {
    // A tool event whose text merely mentions "memory" must not land in the
    // 메모리 lane — structural (tool) classification wins over text.
    const ev = toolEvent("Edit", { title: "update the project memory module", summary: "🔧 Edit: memory.ts" });
    expect(getTimelineLaneForEvent({ event: ev })).toBe("files");
  });

  it("keeps a conversation turn in 대화 even when it discusses memory or tests", () => {
    // A real assistant/user turn that merely mentions memory/test keywords must
    // stay conversation, not get reclassified into the 메모리 / 빌드 lanes.
    const assistant = toolEvent(
      undefined,
      { title: "project memory를 어떻게 정리할지 논의", summary: "remember to run the test later" },
      "assistant",
    );
    expect(getTimelineLaneForEvent({ event: assistant })).toBe("conversation");
    const user = toolEvent(undefined, { title: "메모리 구조 질문", summary: "test 결과는?" }, "user");
    expect(getTimelineLaneForEvent({ event: user })).toBe("conversation");
  });
});
