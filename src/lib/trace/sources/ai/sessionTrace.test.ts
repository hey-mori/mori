import { describe, expect, it } from "vitest";
import type { AgentWorkSessionMeta } from "./workSessions";
import { agentSessionToTraceEvent, agentSessionToTraceSpan } from "./sessionTrace";

function meta(overrides: Partial<AgentWorkSessionMeta> = {}): AgentWorkSessionMeta {
  return {
    agentId: "codex",
    agentName: "Codex",
    importKind: "codex-session",
    id: "codex-1",
    sessionId: "codex-1",
    projectPath: "C:/dev/mori",
    projectName: "mori",
    filePath: "C:/Users/Admin/.codex/sessions/2026/09/09/codex-1.jsonl",
    sourceFilePath: "C:/Users/Admin/.codex/sessions/2026/09/09/codex-1.jsonl",
    startedAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:30:00.000Z",
    messageCount: 5,
    title: "Trace refactor",
    ...overrides,
  };
}

describe("AI session trace projection", () => {
  it("keeps common trace fields source-neutral and AI data in metadata", () => {
    const event = agentSessionToTraceEvent(meta());
    expect(event.source.kind).toBe("ai");
    expect(event.kind).toBe("ai.session_discovered");
    expect(event.occurredAt).toBe("2026-09-09T00:00:00.000Z");
    expect(event.metadata).toMatchObject({
      agentId: "codex",
      externalSessionId: "codex-1",
      messageCount: 5,
    });
    expect(event).not.toHaveProperty("url");
    expect(event).not.toHaveProperty("tabId");
    expect(event).not.toHaveProperty("browserProfile");
  });

  it("builds an activity span without interpreting the work", () => {
    const span = agentSessionToTraceSpan(meta());
    expect(span.kind).toBe("ai.session");
    expect(span.start).toBe("2026-09-09T00:00:00.000Z");
    expect(span.end).toBe("2026-09-09T00:30:00.000Z");
    expect(span.summary).toBe("Codex session with 5 messages");
  });
});
