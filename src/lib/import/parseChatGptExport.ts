/**
 * ChatGPT export-file parsing.
 *
 * ChatGPT's "Export data" (Settings → Data controls → Export) produces a
 * `conversations.json`: an array of conversation objects, each with a `mapping`
 * graph of message nodes. A user who exports their own data and pastes / picks
 * that file is doing an explicit, local import — Mori never reads ChatGPT's web
 * or app storage. This module turns that JSON into ordered transcript turns.
 *
 * It is intentionally tolerant: the export shape has drifted over time and a
 * user may paste the whole array, a single conversation object, or a
 * `{ conversations: [...] }` wrapper. Anything unrecognised returns `null` so
 * the caller falls back to plain-text transcript parsing.
 */

export type ChatGptExportRole = "user" | "assistant" | "system" | "tool" | "unknown";

export type ChatGptExportTurn = {
  role: ChatGptExportRole;
  content: string;
  /** Unix seconds from the source message, when present. Used only for ordering. */
  createTime?: number;
};

export type ChatGptExportParse = {
  /** Title of the first conversation, when the export carries one. */
  conversationTitle?: string;
  /** How many conversations the export contained. */
  conversationCount: number;
  /** Ordered, non-empty user/assistant/system turns across all conversations. */
  turns: ChatGptExportTurn[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A node is conversation-shaped when it carries a ChatGPT `mapping` object. */
function hasMapping(value: unknown): value is UnknownRecord & { mapping: UnknownRecord } {
  return isRecord(value) && isRecord(value.mapping);
}

/**
 * Extract the conversation array from the three shapes a user might paste:
 * the raw export array, a single conversation object, or a `{ conversations }`
 * wrapper. Returns `null` when the value is not ChatGPT-export-shaped.
 */
function extractConversations(parsed: unknown): UnknownRecord[] | null {
  if (Array.isArray(parsed)) {
    const conversations = parsed.filter(hasMapping);
    return conversations.length > 0 ? conversations : null;
  }
  if (hasMapping(parsed)) {
    return [parsed];
  }
  if (isRecord(parsed) && Array.isArray(parsed.conversations)) {
    const conversations = parsed.conversations.filter(hasMapping);
    return conversations.length > 0 ? conversations : null;
  }
  return null;
}

/** Join a ChatGPT `content.parts` array into plain text, tolerating multimodal parts. */
function partsToText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const pieces: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      pieces.push(part);
    } else if (isRecord(part) && typeof part.text === "string") {
      // Newer multimodal exports wrap text in `{ content_type, text }`.
      pieces.push(part.text);
    }
  }
  return pieces.join("\n").trim();
}

function normaliseRole(role: unknown): ChatGptExportRole {
  switch (role) {
    case "user":
    case "assistant":
    case "system":
    case "tool":
      return role;
    default:
      return "unknown";
  }
}

/**
 * Pull ordered turns out of one conversation's `mapping`. We collect every node
 * that carries a real message + non-empty text, then sort by the message
 * `create_time` so branched / regenerated threads still read chronologically.
 * Hidden system primer messages (empty text) are dropped.
 */
function turnsFromConversation(conversation: UnknownRecord): ChatGptExportTurn[] {
  const mapping = conversation.mapping;
  if (!isRecord(mapping)) return [];

  const collected: ChatGptExportTurn[] = [];
  for (const node of Object.values(mapping)) {
    if (!isRecord(node)) continue;
    const message = node.message;
    if (!isRecord(message)) continue;
    const author = isRecord(message.author) ? message.author : null;
    const role = normaliseRole(author?.role);
    const content = isRecord(message.content) ? partsToText(message.content.parts) : "";
    if (!content) continue;
    const createTime = typeof message.create_time === "number" ? message.create_time : undefined;
    collected.push({ role, content, createTime });
  }

  // Stable chronological order; nodes without a timestamp keep insertion order.
  return collected
    .map((turn, index) => ({ turn, index }))
    .sort((a, b) => {
      const at = a.turn.createTime;
      const bt = b.turn.createTime;
      if (at !== undefined && bt !== undefined && at !== bt) return at - bt;
      if (at !== undefined && bt === undefined) return -1;
      if (at === undefined && bt !== undefined) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.turn);
}

function conversationTitle(conversation: UnknownRecord): string | undefined {
  const title = conversation.title;
  return typeof title === "string" && title.trim() ? title.trim() : undefined;
}

/**
 * Parse a pasted ChatGPT export. Returns `null` when the text is not valid
 * JSON or not ChatGPT-export-shaped, so the caller can fall back to plain-text
 * transcript parsing without a try/catch of its own.
 */
export function parseChatGptExport(raw: string): ChatGptExportParse | null {
  const trimmed = raw.trim();
  // Cheap guard: a ChatGPT export is always a JSON object/array.
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const conversations = extractConversations(parsed);
  if (!conversations) return null;

  const turns: ChatGptExportTurn[] = [];
  for (const conversation of conversations) {
    turns.push(...turnsFromConversation(conversation));
  }
  if (turns.length === 0) return null;

  return {
    conversationTitle: conversationTitle(conversations[0]),
    conversationCount: conversations.length,
    turns,
  };
}

/**
 * True when the pasted text looks like a ChatGPT export (valid, shaped JSON
 * with at least one extractable turn). Lets the UI surface "detected an export
 * file" without re-parsing in the component.
 */
export function isChatGptExport(raw: string): boolean {
  return parseChatGptExport(raw) !== null;
}
