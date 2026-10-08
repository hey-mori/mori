import type { RepositoryObservation, SessionEvidence } from "../trace/sources/ai/sessionEvidence";

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
  /**
   * The assistant message's `stop_reason` (`end_turn`, `tool_use`,
   * `stop_sequence`, …), empty / absent for non-assistant messages and older
   * reads. `end_turn` / `stop_sequence` on a session's last message means the
   * turn finished and the agent is idle, the precise "not working" signal a
   * time window cannot give.
   */
  stopReason?: string;
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
  /** Filesystem last-modified time (ISO). The "active right now" signal;
   *  absent on older reads, so treat a missing value as `startedAt`. */
  modifiedAt?: string;
  /** Timestamp of the session's last timestamped record, "" when none was found. */
  lastActivityAt?: string;
  /** File size in bytes; lets Live Follow tail from near the end of a huge
   *  session instead of reading the whole history. Absent on older reads. */
  fileBytes?: number;
  messageCount: number;
  /** False when the reader's preview stopped at its byte budget, so
   *  `messageCount` is a lower bound for the file's head, not the total.
   *  Absent on older reads. */
  messageCountComplete?: boolean;
  /** Best-effort title — the first user message, truncated. */
  title: string;
  /** Token usage aggregated from the session's assistant messages. */
  tokenUsage?: ClaudeTokenUsage;
  /** What the transcript holds, from a complete read only. Absent on older reads. */
  activityClass?: string;
  /** The agent's recorded `entrypoint` (`cli`, `sdk-cli`, ...), "" if none. */
  entrypoint?: string;
  /** PR and branch observations with coverage; null when the file could not be
   *  scanned (unknown, not empty). Absent on older reads. */
  evidence?: SessionEvidence | null;
  /** The Git checkout the session's work belongs to; null when nothing
   *  establishes one. Absent on older reads. */
  repository?: RepositoryObservation | null;
};

/**
 * One file a Claude Code session's tool calls touched. Mirrors the Rust
 * `ClaudeFileTouch`. Extracted from a `tool_use` block's structured `input`
 * before the block is flattened into the rendered message text, so the file
 * provenance survives ("🔧 Edit: …" used to be all that reached the frontend).
 *
 * Faithful and minimal: one entry per touch (a file read three times appears
 * three times). The per-file rollup, and reconciling `path` against the
 * current filesystem to detect moves / deletions, are pure derivations done
 * downstream — not baked in here.
 */
export type ClaudeFileTouch = {
  /** Absolute path exactly as the tool recorded it. Not validated. */
  path: string;
  /** The tool, e.g. "Edit", "Write", "Read", "MultiEdit", "NotebookEdit". */
  tool: string;
  /** Coarse change kind: "wrote" | "edited" | "read" | "touched". */
  changeKind: ClaudeFileChangeKind;
  /** Timestamp of the enclosing JSONL line, or "" when absent. */
  at: string;
  /** Lines added, counted from the correlated result's `structuredPatch`. 0 when no patch. */
  additions: number;
  /** Lines removed, counted from `structuredPatch`. 0 when no patch. */
  deletions: number;
  /** Id of the assistant message (JSONL line) this touch came from — matches
   *  `ClaudeMessage.id`, so the import can attribute it to a turn / event. */
  messageId: string;
  /** Bounded preview of the change (changed lines only, capped). Empty when no patch. */
  diffPreview: string;
};

export type ClaudeFileChangeKind =
  | "wrote"
  | "edited"
  | "read"
  | "touched"
  | (string & {});

export type ClaudeCodeSessionDetail = ClaudeCodeSessionMeta & {
  messages: ClaudeMessage[];
  /**
   * Files this session's tool calls touched, in order. Older reads (before
   * this field shipped) and Claude Desktop conversations omit it; treat an
   * absent value as an empty list.
   */
  fileTouches?: ClaudeFileTouch[];
};

/**
 * Line accounting for a delta read. Mirrors the Rust `ClaudeDeltaStats`.
 * The invariant `rawLines === parsed + skipped + unparseable` always holds,
 * so a live-follow fidelity surface can show how many raw JSONL records became
 * events vs were dropped, and spot a silent parse regression.
 */
export type ClaudeDeltaStats = {
  /** Non-empty JSONL records in this delta. */
  rawLines: number;
  /** Records that became a message event. */
  parsed: number;
  /** Valid JSON that was not a human/assistant message with content. */
  skipped: number;
  /** Records that did not parse as JSON at all. */
  unparseable: number;
};

export const EMPTY_CLAUDE_DELTA_STATS: ClaudeDeltaStats = {
  rawLines: 0,
  parsed: 0,
  skipped: 0,
  unparseable: 0,
};

/**
 * The result of tailing a growing session file since a byte offset. Mirrors the
 * Rust `ClaudeCodeSessionDelta`. `newOffset` is where the next poll resumes; it
 * never lands mid-line (an in-progress trailing write is left unconsumed), so
 * feeding `newOffset` back on the next call never re-reads or splits a line.
 */
export type ClaudeCodeSessionDelta = {
  filePath: string;
  newOffset: number;
  events: ClaudeMessage[];
  fileTouches: ClaudeFileTouch[];
  stats: ClaudeDeltaStats;
};

/**
 * One bounded window of a long Claude Code transcript, read from its end.
 * Mirrors the Rust `ClaudeCodeSessionWindow`. It is part of the session, never
 * the whole: `events`, `fileTouches` and `stats` count this window only.
 * Pass `startOffset`, `sourceId` and `startAnchor` back for earlier history.
 */
export type ClaudeCodeSessionWindow = {
  filePath: string;
  sourceId: string;
  fileBytes: number;
  startOffset: number;
  startAnchor: string;
  /** Fingerprint of the last record before `endOffset`; with `endOffset` it
   *  reads this same window back after the transcript grows. "" when empty. */
  endAnchor: string;
  endOffset: number;
  reachedStart: boolean;
  events: ClaudeMessage[];
  fileTouches: ClaudeFileTouch[];
  stats: ClaudeDeltaStats;
  /** Records skipped because one alone exceeded a window; counted, not hidden. */
  omittedRecords: number;
  omittedBytes: number;
};
