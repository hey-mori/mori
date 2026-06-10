import { describe, expect, it } from "vitest";
import { resolveStartRecordsAgentId } from "./startRecordsAgent";
import { AGENT_REGISTRY, type AgentWorkAgentId } from "../agents/agentRegistry";

describe("resolveStartRecordsAgentId", () => {
  it("honours a requested agent the roster still has", () => {
    expect(resolveStartRecordsAgentId("codex")).toBe("codex");
    expect(resolveStartRecordsAgentId("opencode")).toBe("opencode");
    expect(resolveStartRecordsAgentId("cursor")).toBe("cursor");
  });

  it("falls back to the first detection-capable agent when none is requested", () => {
    const firstDetectable = AGENT_REGISTRY.find((agent) => agent.detect)?.agentId;
    expect(resolveStartRecordsAgentId(null)).toBe(firstDetectable);
  });

  it("falls back when the requested agent is not in the roster", () => {
    const roster: Array<{ agentId: AgentWorkAgentId; detect: boolean }> = [
      { agentId: "codex", detect: true },
      { agentId: "opencode", detect: true },
    ];
    expect(resolveStartRecordsAgentId("claude", roster)).toBe("codex");
  });

  it("falls back when the requested agent is not detectable yet", () => {
    const roster: Array<{ agentId: AgentWorkAgentId; detect: boolean }> = [
      { agentId: "manus", detect: false },
      { agentId: "claude", detect: true },
    ];
    expect(resolveStartRecordsAgentId("manus", roster)).toBe("claude");
  });

  it("prefers a detection-capable agent over an earlier non-detectable one", () => {
    const roster: Array<{ agentId: AgentWorkAgentId; detect: boolean }> = [
      { agentId: "claude", detect: false },
      { agentId: "codex", detect: true },
    ];
    expect(resolveStartRecordsAgentId(null, roster)).toBe("codex");
  });

  it("returns the first agent when none can be detected", () => {
    const roster: Array<{ agentId: AgentWorkAgentId; detect: boolean }> = [
      { agentId: "claude", detect: false },
      { agentId: "codex", detect: false },
    ];
    expect(resolveStartRecordsAgentId(null, roster)).toBe("claude");
  });

  it("returns null for an empty roster", () => {
    expect(resolveStartRecordsAgentId("claude", [])).toBeNull();
  });
});
