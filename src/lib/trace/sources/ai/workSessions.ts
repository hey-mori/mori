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
  activityClassOf,
  claudeInteraction,
  codexInteraction,
  type SessionActivityClass,
  type RepositoryObservation,
  type SessionEvidence,
  type SessionInteraction,
} from "./sessionEvidence";
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
  /** When the conversation itself last moved (Claude Code only): the last user
   *  or assistant record, not idle-time bookkeeping. Absent when unknown. */
  lastMessageAt?: string;
  /** The source file's size when discovered (Claude Code only). */
  fileBytes?: number;
  /** The source file's own last change when discovered (Claude Code only):
   *  the age its cleanup estimate starts from. */
  modifiedAt?: string;
  messageCount: number;
  /** False when `messageCount` covers only part of the source (a reader that
   *  previews a long session's head). Absent means complete. */
  messageCountComplete?: boolean;
  /** Head fingerprint of the transcript file (Claude Code), when known: a
   *  kept session whose file now has another one is another conversation. */
  sourceId?: string;
  title: string;
  /** True when `title` is the user's first request (no title of the agent's
   *  own): the request disclosure level then governs it. */
  titleFromRequest?: boolean;
  tokenUsage?: ClaudeTokenUsage;
  connectorId?: string;
  connectorFamily?: string;
  /** What the source holds, for readers that classify it. Absent means the
   *  reader does not say, which is not the same as empty. */
  activityClass?: SessionActivityClass;
  /** Whether a person drove the session, from the source's own marker. */
  interaction?: SessionInteraction;
  /** Structural PR and branch observations, for readers that report them. */
  evidence?: SessionEvidence;
  /** The Git checkout the session's work belongs to, for readers that report it. */
  repository?: RepositoryObservation;
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
  return (await listAgentWorkSessionsReport(agentId)).sessions;
}

/**
 * One agent's sessions, and whether every listing behind them succeeded. A
 * listing that throws still contributes nothing (as before), but marks the
 * agent incomplete: only a complete listing can vouch that a session it does
 * not name is not on this machine.
 */
async function listAgentWorkSessionsReport(
  agentId: AgentWorkAgentId,
): Promise<{ sessions: AgentWorkSessionMeta[]; complete: boolean }> {
  if (!getAgentDescriptor(agentId).detect) {
    return { sessions: [], complete: false };
  }
  let complete = true;
  const tracked = <T>(listing: Promise<T[]>): Promise<T[]> =>
    listing.catch(() => {
      complete = false;
      return [] as T[];
    });
  // The inbox listing itself still rejects (failing the whole pass, as
  // before, so nothing is pruned on a bad read); an unreadable file in it
  // only makes the agent incomplete.
  const connector = (id: AgentWorkAgentId) =>
    listConnectorBackedSessions(connectorConfigFor(id), () => (complete = false));
  const sorted = (sessions: AgentWorkSessionMeta[]) => ({
    sessions: sessions.sort((a, b) => time(b.startedAt) - time(a.startedAt)),
    complete,
  });
  if (agentId === "claude") {
    const [code, desktop] = await Promise.all([
      tracked(discoverClaudeCodeSessions()),
      // Claude Desktop not being installed is an answer (no conversations),
      // not a failed listing; anything else is a failure.
      listClaudeDesktopConversations().catch((error: unknown) => {
        if (!isDesktopAbsent(error)) complete = false;
        return [] as ClaudeConversationMeta[];
      }),
    ]);
    return sorted([...code.map(mapClaudeMeta), ...desktop.map(mapClaudeDesktopMeta)]);
  }
  if (agentId === "codex") {
    const [direct, viaConnector] = await Promise.all([tracked(discoverCodexSessions()), connector("codex")]);
    // A rollout file Codex could not read is listed as a placeholder under its
    // file name, not its session id: the session is on disk but unnamed here.
    if (direct.some(isUnreadableCodexPlaceholder)) complete = false;
    return sorted([...direct.map(mapCodexMeta), ...viaConnector]);
  }
  if (agentId === "antigravity") {
    return sorted((await tracked(discoverAntigravitySessions())).map(mapAntigravityMeta));
  }
  if (agentId === "continue") {
    return sorted((await tracked(discoverContinueSessions())).map(mapContinueMeta));
  }
  if (agentId === "cline") {
    return sorted((await tracked(discoverClineSessions())).map(mapClineMeta));
  }
  if (agentId === "cursor") {
    return sorted((await tracked(discoverCursorSessions())).map(mapCursorMeta));
  }
  // The remaining branch lists OpenCode; it vouches for OpenCode only, never
  // for an agent that reaches it without a branch of its own.
  if (agentId !== "opencode") complete = false;
  const [openCodeDirect, openCodeConnector] = await Promise.all([
    tracked(discoverOpenCodeSessions()),
    connector("opencode"),
  ]);
  return sorted([...openCodeDirect.map(mapOpenCodeMeta), ...openCodeConnector]);
}

export async function listAllAgentWorkSessions(): Promise<AgentWorkSessionMeta[]> {
  return (await listAllAgentWorkSessionsReport()).sessions;
}

/** The errors `list_claude_desktop_conversations` returns when Claude Desktop
 *  has no database here (src-tauri/src/claude/desktop.rs): not installed. */
const DESKTOP_ABSENT = [
  /^No Claude Desktop SQLite database was found/,
  /^No recognised Claude Desktop conversation table/,
];
function isDesktopAbsent(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return DESKTOP_ABSENT.some((pattern) => pattern.test(message));
}

/** The placeholder `unreadable_codex_meta` lists for a rollout file it could
 *  not read (src-tauri/src/codex/sessions.rs). */
function isUnreadableCodexPlaceholder(session: CodexSessionMeta): boolean {
  return session.title.startsWith("⚠ 읽을 수 없는 세션");
}

/**
 * Every agent's sessions, plus the agents whose listings all succeeded and
 * found at least one session: the only agents whose silence about a session
 * is evidence that its file is gone. Even then it is evidence, not proof: an
 * unreadable folder inside a listing is skipped without an error.
 */
export async function listAllAgentWorkSessionsReport(): Promise<{
  sessions: AgentWorkSessionMeta[];
  vouchingAgents: Set<string>;
}> {
  // Registry-driven: a new anchor agent appears in the cross-agent list as
  // soon as it is added to AGENT_REGISTRY, with no edit here.
  const ids = listAgentIds();
  const reports = await Promise.all(ids.map((id) => listAgentWorkSessionsReport(id)));
  const vouchingAgents = new Set<string>();
  reports.forEach((report, index) => {
    if (report.complete && report.sessions.length > 0) vouchingAgents.add(ids[index]);
  });
  return {
    sessions: reports.flatMap((report) => report.sessions).sort((a, b) => time(b.startedAt) - time(a.startedAt)),
    vouchingAgents,
  };
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
    lastMessageAt: session.lastMessageAt || undefined,
    fileBytes: session.fileBytes,
    modifiedAt: session.modifiedAt || undefined,
    messageCount: session.messageCount,
    messageCountComplete: session.messageCountComplete,
    ...(session.sourceId ? { sourceId: session.sourceId } : {}),
    title: session.title,
    ...(session.titleFromRequest ? { titleFromRequest: true } : {}),
    tokenUsage: session.tokenUsage,
    activityClass: activityClassOf(session.activityClass),
    interaction: claudeInteraction(session.entrypoint),
    evidence: session.evidence ?? undefined,
    repository: session.repository ?? undefined,
  };
}

/**
 * When a Claude session last had activity: the timestamp of its last record.
 * The transcript's file time is only the fallback, because Claude Code appends
 * untimestamped bookkeeping (`last-prompt`, `cost-state`, `ai-title`) to old
 * sessions, moving the file time days after the conversation ended. Either is a
 * source observation, not proof the conversation ended then. Falls back to the
 * start when neither is usable or a value is earlier than the first message.
 */
export function claudeLastActivity(
  session: Pick<ClaudeCodeSessionMeta, "startedAt" | "modifiedAt" | "lastActivityAt">,
): string {
  const startedMs = Date.parse(session.startedAt);
  for (const candidate of [session.lastActivityAt, session.modifiedAt]) {
    const ms = Date.parse(candidate ?? "");
    if (!candidate || Number.isNaN(ms)) continue;
    if (!Number.isNaN(startedMs) && ms < startedMs) continue;
    return candidate;
  }
  return session.startedAt;
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
    activityClass: activityClassOf(session.activityClass),
    interaction: codexInteraction(session.source),
    evidence: session.evidence ?? undefined,
    repository: session.repository ?? undefined,
  };
}

/** Antigravity and Cline title a session by its first human message, else a
 *  generated "<Agent> session <id>" name; an unreadable file reads "⚠ …". */
function titleIsFirstMessage(title: string, fallbackPrefix: string): boolean {
  const trimmed = title.trim();
  return Boolean(trimmed) && !trimmed.startsWith(fallbackPrefix) && !trimmed.startsWith("⚠");
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
    ...(titleIsFirstMessage(session.title, "Antigravity session ") ? { titleFromRequest: true } : {}),
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
    ...(titleIsFirstMessage(session.title, "Cline session ") ? { titleFromRequest: true } : {}),
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
  onFileFailed: () => void = () => {},
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
        onFileFailed();
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
