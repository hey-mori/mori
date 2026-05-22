/**
 * Claude Connections — public surface.
 *
 * The feature is intentionally small: a typed Tauri bridge for reading
 * Claude Desktop / Claude Code artefacts, plus a converter from a Claude
 * conversation into a Mori `NormalizedImportCandidate` that flows through
 * the same Import Review path as pasted transcripts.
 */
export {
  ClaudeBridgeUnavailableError,
  discoverClaudeCodeSessions,
  discoverClaudeDesktop,
  formatClaudeTimestamp,
  getClaudeCodeSession,
  getClaudeDesktopConversation,
  isClaudeBridgeAvailable,
  listClaudeDesktopConversations,
  shortMessagePreview,
} from "./claudeTauri";
export {
  buildImportCandidateFromClaudeCodeSession,
  buildImportCandidateFromClaudeConversation,
  pairMessagesIntoTurns,
} from "./claudeImport";
export { EMPTY_CLAUDE_TOKEN_USAGE } from "./types";
export type {
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
  ClaudeConversationDetail,
  ClaudeConversationMeta,
  ClaudeDesktopDiscovery,
  ClaudeMessage,
  ClaudeMessageRole,
  ClaudeMessageSubkind,
  ClaudeSource,
  ClaudeTokenUsage,
} from "./types";
export {
  classifyMessage,
  computeConversationStats,
  formatTokenCount,
} from "./conversationStats";
export type { ConversationStats } from "./conversationStats";
export {
  discoverLocalAiTools,
  getToolStatusLabel,
  getToolStatusTone,
} from "./installations";
export type {
  DetectedTool,
  LocalAiToolReport,
  LocalAiToolStatus,
} from "./installations";
