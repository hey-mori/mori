import type { ConnectorEvent } from "../../../connectors/types";
import type { TraceEvent, TraceSourceDescriptor, TraceSpan } from "../../core";

const TERMINAL_CONNECTORS = new Set(["terminalShell", "terminal"]);
const TERMINAL_EVENT_KINDS = new Set(["command_started", "command_finished"]);

export type TerminalTraceMetadata = {
  connectorId: string;
  externalSessionId?: string;
  projectPath?: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  provenanceToolName: string;
  provenanceToolVersion?: string;
  captureMethod: string;
  rawDataPolicy: string;
};

export function isTerminalConnectorEvent(event: ConnectorEvent): boolean {
  return TERMINAL_CONNECTORS.has(event.connectorId) && TERMINAL_EVENT_KINDS.has(event.kind);
}

/**
 * Project an existing connector command event into Trace. This is not a
 * terminal collector; it only gives already-importable command evidence a
 * source-specific Trace shape.
 */
export function terminalConnectorEventToTraceEvent(
  event: ConnectorEvent,
): TraceEvent<TerminalTraceMetadata> | null {
  if (!isTerminalConnectorEvent(event)) return null;

  const title = event.sourceTitle?.trim() || event.command?.trim() || event.summary.trim() || "Terminal command";
  return {
    id: `trace-terminal-${stableSuffix(event.connectorId)}-${stableSuffix(event.sessionId ?? "unscoped")}-${stableSuffix(event.id)}`,
    source: terminalTraceSource(event),
    kind: `terminal.${event.kind}`,
    occurredAt: event.occurredAt,
    title,
    summary: event.summary,
    confidence: 0.95,
    metadata: terminalTraceMetadata(event),
  };
}

/**
 * Build a command span only when the connector observed a duration. Without a
 * duration, a command_finished event remains a point-in-time TraceEvent.
 */
export function terminalConnectorEventToTraceSpan(
  event: ConnectorEvent,
): TraceSpan<TerminalTraceMetadata> | null {
  if (event.kind !== "command_finished") return null;
  const durationMs = event.tool?.durationMs;
  if (typeof durationMs !== "number" || durationMs <= 0) return null;

  const traceEvent = terminalConnectorEventToTraceEvent(event);
  if (!traceEvent) return null;

  const endTime = new Date(event.occurredAt).getTime();
  if (!Number.isFinite(endTime)) return null;

  return {
    id: `trace-terminal-span-${stableSuffix(event.connectorId)}-${stableSuffix(event.sessionId ?? "unscoped")}-${stableSuffix(event.id)}`,
    source: traceEvent.source,
    kind: "terminal.command",
    start: new Date(endTime - durationMs).toISOString(),
    end: event.occurredAt,
    title: traceEvent.title,
    summary: traceEvent.summary,
    eventIds: [traceEvent.id],
    metadata: traceEvent.metadata,
  };
}

function terminalTraceSource(event: ConnectorEvent): TraceSourceDescriptor {
  return {
    id: `terminal:${event.connectorId}`,
    kind: "terminal",
    label: event.connectorId === "terminalShell" ? "Terminal shell" : "Terminal",
    provider: event.connectorId,
    scopeLabel: event.projectPath || event.sessionId || undefined,
  };
}

function terminalTraceMetadata(event: ConnectorEvent): TerminalTraceMetadata {
  return {
    connectorId: event.connectorId,
    externalSessionId: event.sessionId || undefined,
    projectPath: event.projectPath || undefined,
    command: event.command || undefined,
    exitCode: event.tool?.exitCode,
    durationMs: event.tool?.durationMs,
    provenanceToolName: event.provenance.toolName,
    provenanceToolVersion: event.provenance.toolVersion,
    captureMethod: event.privacy.captureMethod,
    rawDataPolicy: event.privacy.rawDataPolicy,
  };
}

function stableSuffix(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "").slice(0, 96) || "unknown";
}
