import type { TraceEvent, TraceSourceDescriptor, TraceSpan } from "../../core";
import type { AiSessionObservation } from "./workSessions";

export type AiSessionTraceMetadata = {
  agentId: string;
  importKind: string;
  externalSessionId: string;
  projectPath?: string;
  projectName?: string;
  messageCount: number;
  sourceFilePath?: string;
  connectorId?: string;
  connectorFamily?: string;
};

/**
 * Project a discovered AI work session into the generic Trace contract.
 * This is intentionally metadata-only; it does not build memories, summaries,
 * issues, decisions, or project contexts.
 */
export function agentSessionToTraceEvent(meta: AiSessionObservation): TraceEvent<AiSessionTraceMetadata> {
  return {
    id: `trace-ai-session-${meta.agentId}-${stableSuffix(meta.id)}`,
    source: aiTraceSource(meta),
    kind: "ai.session_discovered",
    occurredAt: meta.startedAt || meta.updatedAt || "",
    title: meta.title.trim() || `${meta.agentName} session`,
    summary:
      meta.messageCount > 0
        ? `${meta.agentName} session with ${meta.messageCount} messages`
        : `${meta.agentName} session`,
    confidence: meta.startedAt || meta.updatedAt ? 0.9 : 0.6,
    metadata: aiSessionMetadata(meta),
  };
}

/**
 * A span is useful for UI and storage layers that need a session window, while
 * still staying in Trace territory: a bounded activity interval, not its meaning.
 */
export function agentSessionToTraceSpan(meta: AiSessionObservation): TraceSpan<AiSessionTraceMetadata> {
  const event = agentSessionToTraceEvent(meta);
  return {
    id: `trace-ai-span-${meta.agentId}-${stableSuffix(meta.id)}`,
    source: event.source,
    kind: "ai.session",
    start: meta.startedAt || meta.updatedAt || "",
    end: meta.updatedAt || undefined,
    title: event.title,
    summary: event.summary,
    eventIds: [event.id],
    metadata: event.metadata,
  };
}

function aiTraceSource(meta: AiSessionObservation): TraceSourceDescriptor {
  return {
    id: `ai:${meta.agentId}`,
    kind: "ai",
    label: meta.agentName,
    provider: meta.agentId,
    scopeLabel: meta.projectName || meta.projectPath || undefined,
  };
}

function aiSessionMetadata(meta: AiSessionObservation): AiSessionTraceMetadata {
  return {
    agentId: meta.agentId,
    importKind: meta.importKind,
    externalSessionId: meta.sessionId,
    projectPath: meta.projectPath || undefined,
    projectName: meta.projectName || undefined,
    messageCount: meta.messageCount,
    sourceFilePath: meta.sourceFilePath || undefined,
    connectorId: meta.connectorId,
    connectorFamily: meta.connectorFamily,
  };
}

function stableSuffix(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "").slice(0, 96) || "unknown";
}
