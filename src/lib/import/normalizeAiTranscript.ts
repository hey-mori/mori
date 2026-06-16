import type { EventActor, TimelineEvent } from "../../domain/types";
import type {
  AiTranscriptPlatform,
  AiTranscriptParseSummary,
  AiTranscriptTurn,
  NormalizeAiTranscriptInput,
  NormalizedImportCandidate,
} from "./types";
import { createImportId } from "./id";
import { assessTranscriptFidelity } from "./captureFidelity";
import { parseChatGptExport, type ChatGptExportTurn } from "./parseChatGptExport";

/**
 * Platform-specific integration ID mapping
 */
function getIntegrationId(platform: AiTranscriptPlatform): string {
  // Every named anchor platform maps to a `<platform>Transcript` source kind
  // by convention; only the catch-all "other" uses the generic conversation
  // kind. Keeping this a convention (not a per-platform switch) means a new
  // agent needs no edit here — its `<platform>Transcript` entry in
  // sourceRegistry is enforced instead by the agentRegistry guard test.
  return platform === "other" ? "aiConversation" : `${platform}Transcript`;
}

/**
 * Platform display names
 */
function getPlatformLabel(platform: AiTranscriptPlatform): string {
  switch (platform) {
    case "claude":
      return "Claude";
    case "chatgpt":
      return "ChatGPT";
    case "codex":
      return "Codex";
    case "antigravity":
      return "Antigravity";
    case "opencode":
      return "OpenCode";
    case "continue":
      return "Continue";
    case "cline":
      return "Cline";
    case "cursor":
      return "Cursor";
    case "other":
    default:
      return "AI";
  }
}

/**
 * Parse transcript into turns with basic role detection
 */
function parseTranscriptTurns(text: string): AiTranscriptTurn[] {
  const lines = text.split("\n");
  const turns: AiTranscriptTurn[] = [];
  let currentTurn: AiTranscriptTurn | null = null;

  for (const line of lines) {
    // Detect role markers (various formats)
    const userPattern = /^(User|Human|You|Me):\s*/i;
    const assistantPattern = /^(Assistant|AI|Claude|ChatGPT|Codex|Bot):\s*/i;
    const systemPattern = /^System:\s*/i;

    let detectedRole: AiTranscriptTurn["role"] | null = null;
    let cleanedLine = line;

    if (userPattern.test(line)) {
      detectedRole = "user";
      cleanedLine = line.replace(userPattern, "");
    } else if (assistantPattern.test(line)) {
      detectedRole = "assistant";
      cleanedLine = line.replace(assistantPattern, "");
    } else if (systemPattern.test(line)) {
      detectedRole = "system";
      cleanedLine = line.replace(systemPattern, "");
    }

    if (detectedRole) {
      // Start new turn
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = {
        role: detectedRole,
        content: cleanedLine,
        hasCodeBlocks: /```/.test(cleanedLine),
        hasToolUse: /<function|<tool|tool_use/.test(cleanedLine),
      };
    } else if (currentTurn) {
      // Continue current turn
      currentTurn.content += "\n" + line;
      if (/```/.test(line)) currentTurn.hasCodeBlocks = true;
      if (/<function|<tool|tool_use/.test(line)) currentTurn.hasToolUse = true;
    } else {
      // No role detected yet, treat as unknown - start new turn
      currentTurn = {
        role: "unknown",
        content: line,
        hasCodeBlocks: /```/.test(line),
        hasToolUse: false,
      };
    }
  }

  // Push final turn
  if (currentTurn && currentTurn.content.trim()) {
    turns.push(currentTurn);
  }

  // Normalise content once at the end: the in-loop concat (`content += "\n" + line`)
  // and the role-prefix strip leave stray leading/trailing whitespace on every
  // mid-stream turn, while only the final turn's emptiness was checked via
  // `trim()`. Trim every turn so `turn.content` is always callable downstream.
  return turns.map((turn) => ({ ...turn, content: turn.content.trim() }));
}

/** Convert a structured ChatGPT export turn into the generic transcript turn shape. */
function chatGptTurnToTranscriptTurn(turn: ChatGptExportTurn): AiTranscriptTurn {
  const role: AiTranscriptTurn["role"] =
    turn.role === "user" || turn.role === "assistant" || turn.role === "system"
      ? turn.role
      : "unknown";
  return {
    role,
    content: turn.content,
    hasCodeBlocks: /```/.test(turn.content),
    hasToolUse: /<function|<tool|tool_use/.test(turn.content),
  };
}

/**
 * Resolve transcript turns for a platform. ChatGPT exports arrive as JSON, so
 * we try the structured export parser first and only fall back to the
 * line-based plain-text parser when the text is not an export file. Every
 * other platform uses the plain-text parser directly.
 */
function resolveTranscriptTurns(text: string, platform: AiTranscriptPlatform): AiTranscriptTurn[] {
  if (platform === "chatgpt") {
    const exported = parseChatGptExport(text);
    if (exported) return exported.turns.map(chatGptTurnToTranscriptTurn);
  }
  return parseTranscriptTurns(text);
}

/**
 * Generate parse summary from turns
 */
function generateParseSummary(
  platform: AiTranscriptPlatform,
  turns: AiTranscriptTurn[],
  text: string,
): AiTranscriptParseSummary {
  const userTurns = turns.filter((t) => t.role === "user").length;
  const assistantTurns = turns.filter((t) => t.role === "assistant").length;
  const codeBlockCount = turns.filter((t) => t.hasCodeBlocks).length;
  const estimatedTokens = Math.floor(text.length / 4); // Rough approximation

  return {
    platform,
    turnCount: turns.length,
    userTurns,
    assistantTurns,
    codeBlockCount,
    estimatedTokens,
  };
}

/**
 * Create summary text from turns
 */
function summarizeTranscript(turns: AiTranscriptTurn[], text: string): string {
  // Try to get first user message
  const firstUser = turns.find((t) => t.role === "user");
  if (firstUser && firstUser.content) {
    const normalized = firstUser.content.replace(/\s+/g, " ").trim();
    return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
  }

  // Fallback to first turn or text start
  const first = turns[0];
  const fallback = first && first.content ? first.content : text;
  const normalized = fallback.replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function truncate(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

type TranscriptEventBuild = {
  sessionId: string;
  projectId: string;
  sourceId: string;
  capturedAt: string;
  title: string;
};

/**
 * Build one timeline event per Q&A turn, pairing a user / system / unknown
 * message with the assistant reply that follows it — the same "1 turn = 1
 * event" shape the detected-import path produces, so a pasted conversation
 * reads as a structured timeline instead of one opaque blob. A stray message
 * (an assistant with no preceding ask, a user with no answer) still becomes its
 * own event so nothing is dropped. Pasted transcripts carry no per-message
 * timestamps, so every event shares the capture time.
 */
function buildTranscriptEvents(
  turns: AiTranscriptTurn[],
  build: TranscriptEventBuild,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const emit = (ask: AiTranscriptTurn | null, reply: AiTranscriptTurn | null) => {
    const askText = ask?.content?.trim() ?? "";
    const replyText = reply?.content?.trim() ?? "";
    if (!askText && !replyText) return;
    const index = events.length;
    const titleSeed = askText || replyText;
    const summarySeed = replyText || askText;
    const actor: EventActor = reply
      ? "assistant"
      : ask?.role === "system"
        ? "system"
        : "user";
    const eventId = createImportId("evt-ai", `${build.title}-${index}`, build.capturedAt);
    const turnId = createImportId("turn-ai", `${build.title}-${index}`, build.capturedAt);
    events.push({
      id: eventId,
      sessionId: build.sessionId,
      projectId: build.projectId,
      start: build.capturedAt,
      type: "aiConversation",
      title: truncate(titleSeed, 90),
      summary: truncate(summarySeed, 160),
      // Keep the full turn text so the inspector can show the request and reply
      // verbatim (the title / summary above stay truncated for the timeline).
      requestText: askText || undefined,
      responseText: replyText || undefined,
      sourceRefs: [build.sourceId],
      linkedIssueIds: [],
      linkedDecisionIds: [],
      relationshipIds: [],
      trustLevel: "verified",
      confidence: 0.88,
      createdBy: "import",
      userModified: false,
      actor,
      turnId,
      turnIndex: index,
    });
  };

  let buffered: AiTranscriptTurn | null = null;
  for (const turn of turns) {
    if (turn.role === "assistant") {
      emit(buffered, turn);
      buffered = null;
      continue;
    }
    // A new ask before the previous one was answered: flush the previous as its
    // own (unanswered) event, then buffer this one.
    if (buffered) emit(buffered, null);
    buffered = turn;
  }
  if (buffered) emit(buffered, null);

  return events;
}

/**
 * Normalize AI transcript import with platform-specific handling
 */
export function normalizeAiTranscript(input: NormalizeAiTranscriptInput): NormalizedImportCandidate {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const platformLabel = getPlatformLabel(input.platform);
  const integrationId = getIntegrationId(input.platform);
  const title = input.title?.trim() || `${platformLabel} conversation`;

  // Parse transcript structure (ChatGPT export JSON is handled structurally;
  // every other platform and pasted plain text uses the line-based parser).
  const turns = resolveTranscriptTurns(input.text, input.platform);
  const parseSummary = generateParseSummary(input.platform, turns, input.text);

  const sourceId = createImportId("src-ai", title, capturedAt);

  // One event per Q&A turn (detected-import parity). Fall back to a single
  // representative event when the transcript produced no turns, so the source
  // always has an anchor on the timeline.
  const turnEvents = buildTranscriptEvents(turns, {
    sessionId: input.sessionId,
    projectId: input.projectId,
    sourceId,
    capturedAt,
    title,
  });
  const events: TimelineEvent[] =
    turnEvents.length > 0
      ? turnEvents
      : [
          {
            id: createImportId("evt-ai", title, capturedAt),
            sessionId: input.sessionId,
            projectId: input.projectId,
            start: capturedAt,
            type: "aiConversation",
            title,
            summary: summarizeTranscript(turns, input.text),
            sourceRefs: [sourceId],
            linkedIssueIds: [],
            linkedDecisionIds: [],
            relationshipIds: [],
            trustLevel: "verified",
            confidence: 0.88,
            createdBy: "import",
            userModified: false,
          },
        ];

  // Build detail string
  const detailParts: string[] = [];
  if (parseSummary.turnCount > 0) {
    detailParts.push(`${parseSummary.turnCount} turn${parseSummary.turnCount === 1 ? "" : "s"}`);
  }
  if (parseSummary.userTurns > 0 && parseSummary.assistantTurns > 0) {
    detailParts.push(`${parseSummary.userTurns} user, ${parseSummary.assistantTurns} assistant`);
  }
  if (parseSummary.codeBlockCount > 0) {
    detailParts.push(`${parseSummary.codeBlockCount} code block${parseSummary.codeBlockCount === 1 ? "" : "s"}`);
  }
  detailParts.push(`~${parseSummary.estimatedTokens} tokens`);
  const detail = `${platformLabel} transcript: ${detailParts.join(", ")}`;

  return {
    source: {
      id: sourceId,
      sessionId: input.sessionId,
      kind: integrationId as any, // Integration IDs map to SourceKind
      title,
      detail,
      trustLevel: "verified",
      redactionStatus: "notNeeded",
      rawRetention: "summaryOnly",
      capturedAt,
      relatedEventIds: events.map((event) => event.id),
      captureFidelity: assessTranscriptFidelity(input.text),
    },
    events,
  };
}
