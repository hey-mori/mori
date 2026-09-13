import {
  buildImportCandidateFromClaudeCodeSession,
  pairMessagesIntoTurns,
} from "../claude/claudeImport";
import { normalizeConnectorEventBatch } from "../connectors";
import { getAgentDescriptor } from "../trace/sources/ai/agentRegistry";
import type { AgentWorkSessionDetail } from "../trace/sources/ai/workSessions";
import type { TimelineEvent } from "../../domain/types";
import type { NormalizedImportCandidate } from "./types";
import { createImportId } from "./id";

export type BuildAgentWorkImportInput = {
  projectId: string;
  sessionId: string;
  capturedAt?: string;
};

export function buildImportCandidatesFromAgentWorkSession(
  detail: AgentWorkSessionDetail,
  input: BuildAgentWorkImportInput,
): NormalizedImportCandidate[] {
  if (detail.importKind === "claude-code") {
    if (!detail.claudeDetail) {
      throw new Error("Claude session detail is missing.");
    }
    return [buildImportCandidateFromClaudeCodeSession(detail.claudeDetail, input)];
  }
  if (detail.importKind !== "connector-jsonl") {
    // Every native agent session renders to a transcript whose platform comes
    // from the source registry. This adapter is Mori import policy, not AI
    // source discovery.
    return [buildNativeAgentImportCandidate(detail, input)];
  }

  const connectorEvents = detail.connectorEvents ?? [];
  const candidates = normalizeConnectorEventBatch({
    projectId: input.projectId,
    sessionId: input.sessionId,
    events: connectorEvents,
  });
  if (candidates.length === 0) {
    throw new Error(`${detail.agentName} connector session has no importable events.`);
  }
  return candidates as NormalizedImportCandidate[];
}

export function buildPrimaryImportCandidateFromAgentWorkSession(
  detail: AgentWorkSessionDetail,
  input: BuildAgentWorkImportInput,
): NormalizedImportCandidate {
  const candidates = buildImportCandidatesFromAgentWorkSession(detail, input);
  const first = candidates[0];
  if (!first) {
    throw new Error(`${detail.agentName} session produced no import candidate.`);
  }
  return first;
}

export function reviewOriginForAgentWorkSession(
  detail: Pick<AgentWorkSessionDetail, "importKind">,
): "ai-transcript" | "connector-jsonl" {
  return detail.importKind === "connector-jsonl" ? "connector-jsonl" : "ai-transcript";
}

function buildNativeAgentImportCandidate(
  detail: AgentWorkSessionDetail,
  input: BuildAgentWorkImportInput,
): NormalizedImportCandidate {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const descriptor = getAgentDescriptor(detail.agentId);
  const sourceKind =
    descriptor.platform === "other" ? "aiConversation" : `${descriptor.platform}Transcript`;
  const sourceId = createImportId(
    "src-ai",
    `${detail.agentId}-${detail.sessionId || detail.title}`,
    capturedAt,
  );
  const turns = pairMessagesIntoTurns(detail.messages);
  const events: TimelineEvent[] = turns.map((turn, index) => {
    const start = turn.timestamp || capturedAt;
    return {
      id: createImportId("evt-ai", `${detail.agentId}-${detail.sessionId}-${index}`, start),
      sessionId: input.sessionId,
      projectId: input.projectId,
      start,
      type: "aiConversation" as const,
      title: turn.title,
      summary: turn.summary,
      sourceRefs: [sourceId],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "observed" as const,
      confidence: 0.9,
      createdBy: "import" as const,
      userModified: false,
      connectorEventId: `${detail.agentId}::${detail.sessionId}::${index}`,
      actor: turn.actor,
      turnId: createImportId("turn-ai", `${detail.agentId}-${detail.sessionId}-${index}`, start),
      turnIndex: index,
      ...(turn.openedByUser ? { openedByUser: true } : {}),
      ...(turn.toolName ? { toolName: turn.toolName } : {}),
    };
  });

  if (events.length === 0) {
    events.push({
      id: createImportId("evt-ai", `${detail.agentId}-${detail.sessionId}-empty`, capturedAt),
      sessionId: input.sessionId,
      projectId: input.projectId,
      start: capturedAt,
      type: "aiConversation",
      title: detail.title,
      summary: `${detail.agentName} session imported without conversation turns.`,
      sourceRefs: [sourceId],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "observed",
      confidence: 0.6,
      createdBy: "import",
      userModified: false,
      connectorEventId: `${detail.agentId}::${detail.sessionId}::empty`,
    });
  }

  return {
    source: {
      id: sourceId,
      sessionId: input.sessionId,
      kind: sourceKind as any,
      title: detail.title,
      detail: `${detail.agentName} transcript: ${turns.length} turns, ${detail.messages.length} messages`,
      trustLevel: "observed",
      redactionStatus: "pending",
      rawRetention: "summaryOnly",
      capturedAt,
      relatedEventIds: events.map((event) => event.id),
    },
    events,
  };
}
