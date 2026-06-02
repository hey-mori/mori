import { describe, expect, it } from "vitest";
import {
  AGENT_REGISTRY,
  getAgentConnectorBinding,
  getAgentDescriptor,
  listAgentIds,
  type AgentWorkAgentId,
} from "./agentRegistry";

describe("agentRegistry", () => {
  it("covers every anchor agent exactly once", () => {
    const ids = listAgentIds();
    expect(ids).toEqual(["claude", "codex", "opencode", "antigravity", "continue"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a descriptor for every id", () => {
    for (const id of listAgentIds()) {
      const descriptor = getAgentDescriptor(id);
      expect(descriptor.agentId).toBe(id);
      expect(descriptor.agentName.length).toBeGreaterThan(0);
      expect(descriptor.detail.length).toBeGreaterThan(0);
    }
  });

  it("throws on an unknown id", () => {
    expect(() => getAgentDescriptor("ghost" as AgentWorkAgentId)).toThrow(
      /Unknown agent id/,
    );
  });

  it("binds connector-backed agents and leaves directly-read agents unbound", () => {
    // Codex and OpenCode arrive through the connector inbox.
    expect(getAgentConnectorBinding("codex")).toEqual({
      connectorFamily: "codex-cli",
      connectorIds: ["codexCliWrapper"],
    });
    expect(getAgentConnectorBinding("opencode")).toEqual({
      connectorFamily: "opencode-cli",
      connectorIds: ["openCodeCli"],
    });
    // Claude, Antigravity, and Continue are read directly from their native stores.
    expect(getAgentConnectorBinding("claude")).toBeUndefined();
    expect(getAgentConnectorBinding("antigravity")).toBeUndefined();
    expect(getAgentConnectorBinding("continue")).toBeUndefined();
  });

  it("keeps every descriptor's icon key within the supported glyph set", () => {
    const allowed = new Set(["sparkles", "code2", "braces", "rocket", "infinity"]);
    for (const descriptor of AGENT_REGISTRY) {
      expect(allowed.has(descriptor.iconKey)).toBe(true);
    }
  });

  it("marks every agent auto-detectable so it reaches the 새 세션 picker", () => {
    // Regression guard: Antigravity was previously discoverable everywhere
    // except the start-session roster. Deriving the roster from this
    // registry means a detect:true agent can never be silently dropped.
    for (const descriptor of AGENT_REGISTRY) {
      expect(descriptor.detect).toBe(true);
    }
  });
});
