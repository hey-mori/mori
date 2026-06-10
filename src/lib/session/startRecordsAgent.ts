import {
  AGENT_REGISTRY,
  type AgentDescriptor,
  type AgentWorkAgentId,
} from "../agents/agentRegistry";

/**
 * Resolve which agent the 새 세션 picker should pre-select for a
 * 기록에서 불러오기 request routed from the 연동 hub.
 *
 * The hub lets the user pick a specific anchor agent (Claude / Codex /
 * OpenCode / …) before clicking 기록에서 불러오기, but the request used to drop
 * that choice and always land on the first detection-capable agent, so picking
 * Codex and importing records opened Claude's records instead. This pure
 * resolver honours the requested agent when the roster still has it; otherwise
 * it falls back to the first detection-capable agent (Claude today), then the
 * first agent, so an absent or unknown hint behaves exactly as before.
 */
export function resolveStartRecordsAgentId(
  requested: AgentWorkAgentId | null,
  registry: readonly Pick<AgentDescriptor, "agentId" | "detect">[] = AGENT_REGISTRY,
): AgentWorkAgentId | null {
  if (requested && registry.some((agent) => agent.agentId === requested && agent.detect)) {
    return requested;
  }
  const firstDetectable = registry.find((agent) => agent.detect);
  return firstDetectable?.agentId ?? registry[0]?.agentId ?? null;
}
