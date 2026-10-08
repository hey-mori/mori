import {
  discoverClaudeCodeSessions,
  getClaudeCodeSession,
  getClaudeDesktopConversation,
  listClaudeDesktopConversations,
} from "../../../claude/claudeTauri";
import type {
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
  ClaudeConversationMeta,
  ClaudeMessage,
  ClaudeTokenUsage,
} from "../../../claude/types";
import {
  discoverCodexSessions,
  getCodexSession,
} from "../../../codex/codexTauri";
import type { CodexSessionMeta } from "../../../codex/types";
import {
  discoverAntigravitySessions,
  getAntigravitySession,
} from "../../../antigravity/antigravityTauri";
import type { AntigravitySessionMeta } from "../../../antigravity/types";
import {
  discoverOpenCodeSessions,
  getOpenCodeSession,
} from "../../../opencode/opencodeTauri";
import type { OpenCodeSessionMeta } from "../../../opencode/types";
import {
  discoverContinueSessions,
  getContinueSession,
} from "../../../continueAgent/continueTauri";
import type { ContinueSessionMeta } from "../../../continueAgent/types";
import {
  discoverClineSessions,
  getClineSession,
} from "../../../cline/clineTauri";
import type { ClineSessionMeta } from "../../../cline/types";
import {
  discoverCursorSessions,
  getCursorSession,
} from "../../../cursor/cursorTauri";
import type { CursorSessionMeta } from "../../../cursor/types";
import type { ConnectorEvent } from "../../../connectors/types";
import { parseConnectorJsonl } from "../../../connectors/validation";
import {
  listConnectorJsonlInbox,
  readConnectorJsonlFile,
  type ConnectorInboxFile,
} from "../../../desktop/connectorInbox";
import {
  getAgentConnectorBinding,
  getAgentDescriptor,
  listAgentIds,
  type AgentWorkAgentId,
} from "./agentRegistry";

export type { AgentWorkAgentId };

export type AgentWorkImportKind =
  | "claude-code"
  | "claude-desktop"
  | "codex-session"
  | "antigravity-session"
  | "opencode-session"
  | "continue-session"
  | "cline-session"
  | "cursor-session"
  | "connector-jsonl";

export type AgentWorkSessionMeta = {
  agentId: AgentWorkAgentId;
  agentName: string;
  importKind: AgentWorkImportKind;
  id: string;
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  sourceFilePath: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  /** False when `messageCount` covers only part of the source (a reader that
   *  previews a long session's head). Absent means complete. */
  messageCountComplete?: boolean;
  title: string;
  tokenUsage?: ClaudeTokenUsage;
  connectorId?: string;
  connectorFamily?: string;
};

export type AgentWorkSessionDetail = AgentWorkSessionMeta & {
  messages: ClaudeMessage[];
  claudeDetail?: ClaudeCodeSessionDetail;
  connectorEvents?: ConnectorEvent[];
};

export type AiSessionObservation = AgentWorkSessionMeta;
export type AiSessionObservationDetail = AgentWorkSessionDetail;

type AgentConnectorConfig = {
  agentId: AgentWorkAgentId;
  agentName: string;
  connectorFamily: string;
  connectorIds: string[];
};

/**
 * Build the connector inbox config for an agent from its registry
 * descriptor. Throws for an agent with no connector binding (a
 * directly-read agent like Claude / Antigravity) — callers only reach
 * this for connector-backed agents.
 */
function connectorConfigFor(agentId: AgentWorkAgentId): AgentConnectorConfig {
  const descriptor = getAgentDescriptor(agentId);
  const binding = getAgentConnectorBinding(agentId);
  if (!binding) {
    throw new Error(`Agent "${agentId}" has no connector binding.`);
  }
  return {
    agentId: descriptor.agentId,
    agentName: descriptor.agentName,
    connectorFamily: binding.connectorFamily,
    connectorIds: binding.connectorIds,
  };
}

export async function listAgentWorkSessions(
  agentId: AgentWorkAgentId,
): Promise<AgentWorkSessionMeta[]> {
  if (!getAgentDescriptor(agentId).detect) {
    return [];
  }
  if (agentId === "claude") {
    const [code, desktop] = await Promise.all([
      discoverClaudeCodeSessions().catch(() => [] as ClaudeCodeSessionMeta[]),
      listClaudeDesktopConversations().catch(() => [] as ClaudeConversationMeta[]),
    ]);
    return [...code.map(mapClaudeMeta), ...desktop.map(mapClaudeDesktopMeta)].sort(
      (a, b) => time(b.startedAt) - time(a.startedAt),
    );
  }
  if (agentId === "codex") {
    const [direct, connector] = await Promise.all([
      discoverCodexSessions().catch(() => [] as CodexSessionMeta[]),
      listConnectorBackedSessions(connectorConfigFor("codex")),
    ]);
    return [...direct.map(mapCodexMeta), ...connector].sort(
      (a, b) => time(b.startedAt) - time(a.startedAt),
    );
  }
  if (agentId === "antigravity") {
    const direct = await discoverAntigravitySessions().catch(
      () => [] as AntigravitySessionMeta[],
    );
    return direct
      .map(mapAntigravityMeta)
      .sort((a, b) => time(b.startedAt) - time(a.startedAt));
  }
  if (agentId === "continue") {
    const direct = await discoverContinueSessions().catch(
      () => [] as ContinueSessionMeta[],
    );
    return direct
      .map(mapContinueMeta)
      .sort((a, b) => time(b.startedAt) - time(a.startedAt));
  }
  if (agentId === "cline") {
    const direct = await discoverClineSessions().catch(
      () => [] as ClineSessionMeta[],
    );
    return direct
      .map(mapClineMeta)
      .sort((a, b) => time(b.startedAt) - time(a.startedAt));
  }
  if (agentId === "cursor") {
    const direct = await discoverCursorSessions().catch(
      () => [] as CursorSessionMeta[],
    );
    return direct
      .map(mapCursorMeta)
      .sort((a, b) => time(b.startedAt) - time(a.startedAt));
  }
  const [openCodeDirect, openCodeConnector] = await Promise.all([
    discoverOpenCodeSessions().catch(() => [] as OpenCodeSessionMeta[]),
    listConnectorBackedSessions(connectorConfigFor("opencode")),
  ]);
  return [...openCodeDirect.map(mapOpenCodeMeta), ...openCodeConnector].sort(
    (a, b) => time(b.startedAt) - time(a.startedAt),
  );
}

export async function listAllAgentWorkSessions(): Promise<AgentWorkSessionMeta[]> {
  // Registry-driven: a new anchor agent appears in the cross-agent list as
  // soon as it is added to AGENT_REGISTRY, with no edit here.
  const lists = await Promise.all(listAgentIds().map((id) => listAgentWorkSessions(id)));
  return lists.flat().sort((a, b) => time(b.startedAt) - time(a.startedAt));
}

export async function getAgentWorkSession(
  meta: AgentWorkSessionMeta,
): Promise<AgentWorkSessionDetail> {
  if (meta.importKind === "claude-code") {
    const detail = await getClaudeCodeSession(meta.sourceFilePath);
    return {
      ...mapClaudeMeta(detail),
      messages: detail.messages,
      claudeDetail: detail,
    };
  }
  if (meta.importKind === "claude-desktop") {
    const detail = await getClaudeDesktopConversation(meta.sessionId);
    return {
      ...mapClaudeDesktopMeta(detail),
      messages: detail.messages,
    };
  }
  if (meta.importKind === "codex-session") {
    const detail = await getCodexSession(meta.sourceFilePath);
    return {
      ...mapCodexMeta(detail),
      messages: detail.messages,
    };
  }
  if (meta.importKind === "antigravity-session") {
    const detail = await getAntigravitySession(meta.sourceFilePath);
    return {
      ...mapAntigravityMeta(detail),
      messages: detail.messages,
    };
  }
  if (meta.importKind === "opencode-session") {
    const detail = await getOpenCodeSession(meta.sourceFilePath);
    return {
      ...mapOpenCodeMeta(detail),
      messages: detail.messages,
    };
  }
  if (meta.importKind === "continue-session") {
    const detail = await getContinueSession(meta.sourceFilePath);
    return {
      ...mapContinueMeta(detail),
      messages: detail.messages,
    };
  }
  if (meta.importKind === "cline-session") {
    const detail = await getClineSession(meta.sourceFilePath);
    return {
      ...mapClineMeta(detail),
      messages: detail.messages,
    };
  }
  if (meta.importKind === "cursor-session") {
    const detail = await getCursorSession(meta.sourceFilePath);
    return {
      ...mapCursorMeta(detail),
      messages: detail.messages,
    };
  }

  const file = await readConnectorJsonlFile(meta.sourceFilePath);
  const outcome = parseConnectorJsonl(file.text);
  const events = outcome.events.filter((event) =>
    eventBelongsToConnectorSession(event, meta),
  );
  const sorted = sortConnectorEvents(events);
  return {
    ...meta,
    startedAt: sorted[0]?.occurredAt ?? meta.startedAt,
    updatedAt: sorted[sorted.length - 1]?.occurredAt ?? meta.updatedAt,
    messageCount: sorted.length,
    messages: sorted.map(connectorEventToMessage),
    connectorEvents: sorted,
  };
}

function mapClaudeMeta(session: ClaudeCodeSessionMeta): AgentWorkSessionMeta {
  return {
    agentId: "claude",
    agentName: "Claude",
    importKind: "claude-code",
    id: session.sessionId,
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    filePath: session.filePath,
    sourceFilePath: session.filePath,
    startedAt: session.startedAt,
    updatedAt: claudeLastActivity(session),
    messageCount: session.messageCount,
    messageCountComplete: session.messageCountComplete,
    title: session.title,
    tokenUsage: session.tokenUsage,
  };
}

/**
 * When a Claude session was last written to: the transcript's modification
 * time. It is the honest "still being worked on" signal (a resumed session keeps
 * its first-message start for days), but it is a source observation, not proof
 * the conversation ended then. Falls back to the start when the file time is
 * missing, unparseable, or earlier than the first message.
 */
export function claudeLastActivity(session: Pick<ClaudeCodeSessionMeta, "startedAt" | "modifiedAt">): string {
  const modified = session.modifiedAt ?? "";
  const modifiedMs = Date.parse(modified);
  const startedMs = Date.parse(session.startedAt);
  if (!modified || Number.isNaN(modifiedMs)) return session.startedAt;
  if (!Number.isNaN(startedMs) && modifiedMs < startedMs) return session.startedAt;
  return modified;
}

function mapClaudeDesktopMeta(session: ClaudeConversationMeta): AgentWorkSessionMeta {
  const projectName = session.projectName?.trim() || "Claude Desktop";
  const startedAt = session.createdAt || session.updatedAt;
  const updatedAt = session.updatedAt || session.createdAt;
  return {
    agentId: "claude",
    agentName: "Claude",
    importKind: "claude-desktop",
    id: `claude-desktop:${session.id}`,
    sessionId: session.id,
    projectPath: projectName,
    projectName,
    filePath: `Claude Desktop:${session.id}`,
    sourceFilePath: session.id,
    startedAt,
    updatedAt,
    messageCount: session.messageCount,
    title: session.title,
  };
}

function mapCodexMeta(session: CodexSessionMeta): AgentWorkSessionMeta {
  return {
    agentId: "codex",
    agentName: "Codex",
    importKind: "codex-session",
    id: session.sessionId,
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    filePath: session.filePath,
    sourceFilePath: session.filePath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    title: session.title,
  };
}

function mapAntigravityMeta(session: AntigravitySessionMeta): AgentWorkSessionMeta {
  return {
    agentId: "antigravity",
    agentName: "Antigravity",
    importKind: "antigravity-session",
    id: session.sessionId,
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    filePath: session.filePath,
    sourceFilePath: session.filePath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    title: session.title,
  };
}

function mapOpenCodeMeta(session: OpenCodeSessionMeta): AgentWorkSessionMeta {
  return {
    agentId: "opencode",
    agentName: "OpenCode",
    importKind: "opencode-session",
    id: session.sessionId,
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    filePath: session.filePath,
    sourceFilePath: session.filePath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    title: session.title,
  };
}

function mapContinueMeta(session: ContinueSessionMeta): AgentWorkSessionMeta {
  return {
    agentId: "continue",
    agentName: "Continue",
    importKind: "continue-session",
    id: session.sessionId,
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    filePath: session.filePath,
    sourceFilePath: session.filePath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    title: session.title,
  };
}

function mapClineMeta(session: ClineSessionMeta): AgentWorkSessionMeta {
  return {
    agentId: "cline",
    agentName: "Cline",
    importKind: "cline-session",
    id: session.sessionId,
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    filePath: session.filePath,
    sourceFilePath: session.filePath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    title: session.title,
  };
}

function mapCursorMeta(session: CursorSessionMeta): AgentWorkSessionMeta {
  return {
    agentId: "cursor",
    agentName: "Cursor",
    importKind: "cursor-session",
    id: session.sessionId,
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    filePath: session.filePath,
    // Cursor sessions live in a SQLite KV store; the reader is keyed by the
    // composer id (sessionId), not a filesystem path.
    sourceFilePath: session.sessionId,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    title: session.title,
  };
}

async function listConnectorBackedSessions(
  config: AgentConnectorConfig,
): Promise<AgentWorkSessionMeta[]> {
  const inbox = await listConnectorJsonlInbox();
  if (!inbox.rootExists) return [];

  const files = inbox.files.filter(
    (file) => file.connectorFamily === config.connectorFamily,
  );
  const batches = await Promise.all(
    files.map(async (file) => {
      try {
        const loaded = await readConnectorJsonlFile(file.path);
        const outcome = parseConnectorJsonl(loaded.text);
        return { file, events: outcome.events };
      } catch {
        return { file, events: [] as ConnectorEvent[] };
      }
    }),
  );

  const sessions: AgentWorkSessionMeta[] = [];
  for (const batch of batches) {
    sessions.push(...connectorFileToSessionMetas(config, batch.file, batch.events));
  }
  return sessions.sort((a, b) => time(b.startedAt) - time(a.startedAt));
}

function connectorFileToSessionMetas(
  config: AgentConnectorConfig,
  file: ConnectorInboxFile,
  events: ConnectorEvent[],
): AgentWorkSessionMeta[] {
  const buckets = new Map<string, ConnectorEvent[]>();
  for (const event of events) {
    if (!config.connectorIds.includes(String(event.connectorId))) continue;
    const key = event.sessionId?.trim() || "unscoped";
    const bucket = buckets.get(key) ?? [];
    bucket.push(event);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([sessionId, bucket]) => {
    const sorted = sortConnectorEvents(bucket);
    const first = sorted[0];
    const last = sorted[sorted.length - 1] ?? first;
    const title = deriveConnectorTitle(config.agentName, sessionId, sorted);
    const projectName = deriveConnectorProject(config.agentName, sorted);
    return {
      agentId: config.agentId,
      agentName: config.agentName,
      importKind: "connector-jsonl",
      id: `${config.connectorFamily}:${sessionId}:${file.path}`,
      sessionId,
      projectPath: projectName,
      projectName,
      filePath: `${file.path}#${encodeURIComponent(sessionId)}`,
      sourceFilePath: file.path,
      startedAt: first?.occurredAt ?? file.modifiedAt,
      updatedAt: last?.occurredAt ?? file.modifiedAt,
      messageCount: sorted.length,
      title,
      connectorId: String(first?.connectorId ?? config.connectorIds[0]),
      connectorFamily: config.connectorFamily,
    };
  });
}

function eventBelongsToConnectorSession(
  event: ConnectorEvent,
  meta: AgentWorkSessionMeta,
): boolean {
  if (meta.connectorId && String(event.connectorId) !== meta.connectorId) return false;
  return (event.sessionId?.trim() || "unscoped") === meta.sessionId;
}

function sortConnectorEvents(events: ConnectorEvent[]): ConnectorEvent[] {
  return [...events].sort((a, b) => time(a.occurredAt) - time(b.occurredAt));
}

function deriveConnectorTitle(
  agentName: string,
  sessionId: string,
  events: ConnectorEvent[],
): string {
  const titled = events.find((event) => event.sourceTitle?.trim());
  if (titled?.sourceTitle) return titled.sourceTitle;
  const start = events.find((event) => event.kind === "session_started");
  if (start?.summary) return truncate(start.summary, 90);
  const prompt = events.find((event) => event.kind === "prompt_submitted");
  if (prompt?.summary) return `${agentName}: ${truncate(prompt.summary, 80)}`;
  return `${agentName} session ${sessionId}`;
}

function deriveConnectorProject(agentName: string, events: ConnectorEvent[]): string {
  const projectPath = events.find((event) => event.projectPath?.trim())?.projectPath;
  if (projectPath) return projectPath;
  const repoPath = events.find((event) => event.git?.repoPath?.trim())?.git?.repoPath;
  if (repoPath) return repoPath;
  return `${agentName} connector`;
}

function connectorEventToMessage(event: ConnectorEvent, index: number): ClaudeMessage {
  const role = roleForConnectorEvent(event);
  return {
    id: event.id || `${event.connectorId}-${event.kind}-${index}`,
    role,
    content: renderConnectorEventMessage(event),
    createdAt: event.occurredAt,
    subkind: event.kind === "tool_finished" ? "tool_use" : "",
  };
}

function roleForConnectorEvent(event: ConnectorEvent): ClaudeMessage["role"] {
  switch (event.kind) {
    case "prompt_submitted":
      return "human";
    case "assistant_message":
    case "command_finished":
    case "tool_finished":
      return "assistant";
    default:
      return "system";
  }
}

function renderConnectorEventMessage(event: ConnectorEvent): string {
  const parts = [event.summary];
  if (event.command) parts.push(`Command: ${event.command}`);
  if (event.git?.repoPath) parts.push(`Repo: ${event.git.repoPath}`);
  return parts.filter(Boolean).join("\n");
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}...`;
}

function time(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
