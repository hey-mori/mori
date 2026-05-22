/**
 * Claude Connections — shared types.
 *
 * These mirror the Rust structs in `src-tauri/src/claude/*.rs`. Mori uses
 * `#[serde(rename_all = "camelCase")]` on the Rust side, so the snake_case
 * field names from rusqlite reach the frontend camelCased.
 *
 * The frontend treats every field as best-effort: Claude Desktop's schema
 * is product-internal and may change between releases, and Claude Code
 * sessions can legitimately omit fields (e.g. tool-only sessions with no
 * user messages). We never throw on missing pieces — we just render
 * whatever we got and let the user decide what's useful.
 */

export type ClaudeSource = "desktop" | "code";

export type ClaudeDesktopDiscovery = {
  found: boolean;
  dbPath?: string;
  schemaTables: string[];
  rawSchema?: string;
  error?: string;
  /** Directory we looked in, regardless of whether we found anything. */
  searchedIn?: string;
};

export type ClaudeConversationMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  source: ClaudeSource;
  /** Claude project label (Desktop only — Claude Code doesn't expose this). */
  projectName?: string;
};

export type ClaudeMessageRole = "human" | "assistant" | "system" | (string & {});

/**
 * Coarse classifier for a Claude message. Lets the UI tell apart
 *  - real user input from tool-result envelopes (which arrive as `human`
 *    role but are not user-authored text)
 *  - assistant tool invocations from plain text replies
 *
 * Older payloads omit this field (the Rust side started emitting it after
 * the Connections viewer landed). When absent we treat the message as a
 * normal turn.
 */
export type ClaudeMessageSubkind = "" | "tool_result" | "tool_use";

export type ClaudeMessage = {
  id: string;
  role: ClaudeMessageRole;
  content: string;
  createdAt: string;
  subkind?: ClaudeMessageSubkind;
};

export type ClaudeConversationDetail = ClaudeConversationMeta & {
  messages: ClaudeMessage[];
};

/**
 * Aggregated token usage for a Claude Code session. Mirrors the Rust
 * `ClaudeTokenUsage` — deduped by assistant `message.id` so repeated
 * streaming-chunk lines are counted once. All zero when the session
 * carried no usage records (e.g. very old logs).
 */
export type ClaudeTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** inputTokens + outputTokens — the headline figure. */
  totalTokens: number;
  /** Distinct assistant messages that carried a usage record. */
  assistantTurns: number;
  /** Last model id seen (e.g. "claude-opus-4-7"). Empty if unknown. */
  model: string;
};

export const EMPTY_CLAUDE_TOKEN_USAGE: ClaudeTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
  assistantTurns: 0,
  model: "",
};

export type ClaudeCodeSessionMeta = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startedAt: string;
  messageCount: number;
  /** Best-effort title — the first user message, truncated. */
  title: string;
  /** Token usage aggregated from the session's assistant messages. */
  tokenUsage?: ClaudeTokenUsage;
};

export type ClaudeCodeSessionDetail = ClaudeCodeSessionMeta & {
  messages: ClaudeMessage[];
};
