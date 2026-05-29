import { buildImportCandidateFromClaudeCodeSession } from "../claude/claudeImport";
import {
  discoverClaudeCodeSessions,
  getClaudeCodeSession,
} from "../claude/claudeTauri";
import type {
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
  ClaudeMessage,
  ClaudeTokenUsage,
} from "../claude/types";
import {
  discoverCodexSessions,
  getCodexSession,
} from "../codex/codexTauri";
import type { CodexSessionMeta } from "../codex/types";
import {
  normalizeConnectorEventBatch,
  parseConnectorJsonl,
  type ConnectorEvent,
} from "../connectors";
import {
  listConnectorJsonlInbox,
  readConnectorJsonlFile,
  type ConnectorInboxFile,
} from "../desktop/connectorInbox";
import { normalizeAiTranscript, type NormalizedImportCandidate } from "../import";

export type AgentWorkAgentId = "claude" | "codex" | "opencode";

export type AgentWorkImportKind = "claude-code" | "codex-session" | "connector-jsonl";

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

export type BuildAgentWorkImportInput = {
  projectId: string;
  sessionId: string;
  capturedAt?: string;
};

type AgentConnectorConfig = {
  agentId: AgentWorkAgentId;
  agentName: string;
  connectorFamily: string;
  connectorIds: string[];
};

const CONNECTOR_CONFIG: Record<Exclude<AgentWorkAgentId, "claude">, AgentConnectorConfig> = {
  codex: {
    agentId: "codex",
    agentName: "Codex",
    connectorFamily: "codex-cli",
    connectorIds: ["codexCliWrapper"],
  },
  opencode: {
    agentId: "opencode",
    agentName: "OpenCode",
    connectorFamily: "opencode-cli",
    connectorIds: ["openCodeCli"],
  },
};

export async function listAgentWorkSessions(
  agentId: AgentWorkAgentId,
): Promise<AgentWorkSessionMeta[]> {
  if (agentId === "claude") {
    const sessions = await discoverClaudeCodeSessions();
    return sessions.map(mapClaudeMeta);
  }
  if (agentId === "codex") {
    const [direct, connector] = await Promise.all([
      discoverCodexSessions().catch(() => [] as CodexSessionMeta[]),
      listConnectorBackedSessions(CONNECTOR_CONFIG.codex),
    ]);
    return [...direct.map(mapCodexMeta), ...connector].sort(
      (a, b) => time(b.startedAt) - time(a.startedAt),
    );
  }
  return listConnectorBackedSessions(CONNECTOR_CONFIG[agentId]);
}

export async function listAllAgentWorkSessions(): Promise<AgentWorkSessionMeta[]> {
  const lists = await Promise.all([
    listAgentWorkSessions("claude"),
    listAgentWorkSessions("codex"),
    listAgentWorkSessions("opencode"),
  ]);
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
  if (meta.importKind === "codex-session") {
    const detail = await getCodexSession(meta.sourceFilePath);
    return {
      ...mapCodexMeta(detail),
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
  if (detail.importKind === "codex-session") {
    return [
      normalizeAiTranscript({
        projectId: input.projectId,
        sessionId: input.sessionId,
        capturedAt: input.capturedAt,
        platform: "codex",
        title: detail.title,
        text: renderMessagesAsTranscript(detail.messages, detail.agentName),
      }),
    ];
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
    updatedAt: session.startedAt,
    messageCount: session.messageCount,
    title: session.title,
    tokenUsage: session.tokenUsage,
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

function renderMessagesAsTranscript(messages: ClaudeMessage[], assistantLabel: string): string {
  return messages
    .map((message) => {
      const role = message.role === "human" ? "User" : message.role === "assistant" ? assistantLabel : "System";
      return `${role}: ${message.content}`;
    })
    .join("\n\n");
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
