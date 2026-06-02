import type { SourceRef, TimelineEvent } from "../../domain/types";

export type NormalizedImportCandidate = {
  source: SourceRef;
  events: TimelineEvent[];
};

export type NormalizeBaseInput = {
  projectId: string;
  sessionId: string;
  capturedAt?: string;
};

export type NormalizeManualNoteInput = NormalizeBaseInput & {
  title?: string;
  note: string;
};

export type NormalizeUrlSourceInput = NormalizeBaseInput & {
  title: string;
  url: string;
  selectedText?: string;
};

/**
 * AI transcript platform options
 */
export type AiTranscriptPlatform =
  | "claude"
  | "chatgpt"
  | "codex"
  | "antigravity"
  | "opencode"
  | "continue"
  | "cline"
  | "cursor"
  | "other";

/**
 * Parsed transcript turn structure (optional, for enhanced parsing)
 */
export type AiTranscriptTurn = {
  role: "user" | "assistant" | "system" | "unknown";
  content: string;
  hasCodeBlocks?: boolean;
  hasToolUse?: boolean;
};

/**
 * Transcript parse summary metadata
 */
export type AiTranscriptParseSummary = {
  platform: AiTranscriptPlatform;
  turnCount: number;
  userTurns: number;
  assistantTurns: number;
  codeBlockCount: number;
  estimatedTokens: number;
};

/**
 * Input for AI transcript normalization
 */
export type NormalizeAiTranscriptInput = NormalizeBaseInput & {
  title?: string;
  text: string;
  platform: AiTranscriptPlatform;
};

/**
 * Legacy AI conversation input (for backward compatibility)
 */
export type NormalizeAiConversationTextInput = NormalizeBaseInput & {
  title?: string;
  text: string;
  provider?: string;
};
