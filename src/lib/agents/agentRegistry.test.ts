import { describe, expect, it } from "vitest";
import {
  AGENT_REGISTRY,
  getAgentConnectorBinding,
  getAgentDescriptor,
  listAgentIds,
  type AgentWorkAgentId,
} from "./agentRegistry";
import { normalizeAiTranscript } from "../import";
import { getIntegration } from "../sources/sourceRegistry";

describe("agentRegistry", () => {
  it("covers every anchor agent exactly once", () => {
    const ids = listAgentIds();
    expect(ids).toEqual([
      "claude",
      "codex",
      "opencode",
      "antigravity",
      "continue",
      "cline",
      "cursor",
    ]);
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
    // Claude, Antigravity, Continue, and Cline are read directly from their
    // native stores.
    expect(getAgentConnectorBinding("claude")).toBeUndefined();
    expect(getAgentConnectorBinding("antigravity")).toBeUndefined();
    expect(getAgentConnectorBinding("continue")).toBeUndefined();
    expect(getAgentConnectorBinding("cline")).toBeUndefined();
    expect(getAgentConnectorBinding("cursor")).toBeUndefined();
  });

  it("keeps every descriptor's icon key within the supported glyph set", () => {
    const allowed = new Set([
      "sparkles",
      "code2",
      "braces",
      "rocket",
      "infinity",
      "bot",
      "cursor",
    ]);
    for (const descriptor of AGENT_REGISTRY) {
      expect(allowed.has(descriptor.iconKey)).toBe(true);
    }
  });

  it("resolves every agent's paste platform to a registered source kind", () => {
    // Extensibility guard: a new agent whose platform lacks a normalizer case
    // or a sourceRegistry entry would silently fall back to a generic /
    // unresolved kind. Lock that an imported session of every agent carries a
    // source kind the registry can label.
    for (const descriptor of AGENT_REGISTRY) {
      const candidate = normalizeAiTranscript({
        projectId: "p",
        sessionId: "s",
        platform: descriptor.platform,
        title: `${descriptor.agentName} session`,
        text: "User: hi\nAssistant: hello",
      });
      const integration = getIntegration(candidate.source.kind);
      expect(
        integration,
        `agent "${descriptor.agentId}" (platform "${descriptor.platform}") resolved to unregistered kind "${candidate.source.kind}"`,
      ).toBeDefined();
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
