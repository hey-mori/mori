/**
 * Central agent registry — the single source of truth for "what an
 * AI-agent anchor is" in Mori.
 *
 * Before this file existed, the same agent identity (id, display name,
 * paste platform, auto-detect capability, connector binding, glyph) was
 * re-declared independently in several places: `workSessions.ts`
 * (`CONNECTOR_CONFIG` + the discovery if-chains), `StartSessionView`
 * (`AGENT_OPTIONS`), `ConnectionsView` / `SourcesView` (icon maps). Adding
 * an agent meant editing ~20 scattered points, and missing one silently
 * dropped the agent from a single surface (Antigravity, for example, was
 * discoverable and listed everywhere except the 새 세션 picker).
 *
 * This registry is pure data — no React, no Tauri imports — so any layer
 * can derive from it. UI maps `iconKey` to a concrete glyph component;
 * `workSessions` derives its connector bindings and discovery dispatch
 * from the same entries. Adding an agent is now: one entry here, one
 * discovery module, and (for a connector-backed agent) one template
 * under `connectors/`.
 */

import type { AiTranscriptPlatform } from "../import";

/** Every AI-agent anchor Mori can treat as a session spine. */
export type AgentWorkAgentId =
  | "claude"
  | "codex"
  | "opencode"
  | "antigravity"
  | "continue"
  | "cline";

/**
 * Stable glyph key. UI surfaces map this to a concrete icon component so
 * the registry stays free of React / lucide imports.
 */
export type AgentIconKey =
  | "sparkles"
  | "code2"
  | "braces"
  | "rocket"
  | "infinity"
  | "bot";

/**
 * Binding to the connector JSONL inbox for agents whose work records
 * arrive through the local-capture bridge rather than a native on-disk
 * session store.
 */
export type AgentConnectorBinding = {
  connectorFamily: string;
  connectorIds: string[];
};

export type AgentDescriptor = {
  agentId: AgentWorkAgentId;
  agentName: string;
  /** UI subtitle, e.g. "Claude Code · Desktop · Web". */
  detail: string;
  /** Stable glyph key; UI maps this to a concrete icon component. */
  iconKey: AgentIconKey;
  /** Platform handed to the paste / transcript normalizer. */
  platform: AiTranscriptPlatform;
  /** Whether Mori can auto-detect this agent's work records today. */
  detect: boolean;
  /**
   * Connector inbox binding, when the agent's sessions arrive as
   * connector JSONL. Absent for agents read directly from a native store.
   */
  connector?: AgentConnectorBinding;
};

/**
 * Ordered registry. Order is the canonical presentation order for the
 * agent picker and the cross-agent session list.
 */
export const AGENT_REGISTRY: readonly AgentDescriptor[] = [
  {
    agentId: "claude",
    agentName: "Claude",
    detail: "Claude Code · Desktop · Web",
    iconKey: "sparkles",
    platform: "claude",
    detect: true,
  },
  {
    agentId: "codex",
    agentName: "Codex",
    detail: "Codex CLI",
    iconKey: "code2",
    platform: "codex",
    detect: true,
    connector: { connectorFamily: "codex-cli", connectorIds: ["codexCliWrapper"] },
  },
  {
    agentId: "opencode",
    agentName: "OpenCode",
    detail: "OpenCode CLI",
    iconKey: "braces",
    platform: "opencode",
    detect: true,
    connector: { connectorFamily: "opencode-cli", connectorIds: ["openCodeCli"] },
  },
  {
    agentId: "antigravity",
    agentName: "Antigravity",
    detail: "Antigravity · Gemini",
    iconKey: "rocket",
    platform: "antigravity",
    detect: true,
  },
  {
    agentId: "continue",
    agentName: "Continue",
    detail: "Continue · VS Code · JetBrains",
    iconKey: "infinity",
    platform: "continue",
    detect: true,
  },
  {
    agentId: "cline",
    agentName: "Cline",
    detail: "Cline · VS Code",
    iconKey: "bot",
    platform: "cline",
    detect: true,
  },
];

const REGISTRY_BY_ID: Record<AgentWorkAgentId, AgentDescriptor> = Object.fromEntries(
  AGENT_REGISTRY.map((descriptor) => [descriptor.agentId, descriptor]),
) as Record<AgentWorkAgentId, AgentDescriptor>;

/** Look up a descriptor by id. Throws on an unknown id (a programmer error). */
export function getAgentDescriptor(agentId: AgentWorkAgentId): AgentDescriptor {
  const descriptor = REGISTRY_BY_ID[agentId];
  if (!descriptor) {
    throw new Error(`Unknown agent id: ${agentId}`);
  }
  return descriptor;
}

/** The connector binding for an agent, or `undefined` for a directly-read agent. */
export function getAgentConnectorBinding(
  agentId: AgentWorkAgentId,
): AgentConnectorBinding | undefined {
  return REGISTRY_BY_ID[agentId]?.connector;
}

/** All agent ids in canonical order. */
export function listAgentIds(): AgentWorkAgentId[] {
  return AGENT_REGISTRY.map((descriptor) => descriptor.agentId);
}
