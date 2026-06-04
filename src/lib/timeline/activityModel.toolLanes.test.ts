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
});
