/**
 * Tauri bridge for the Claude Connections feature.
 *
 * Every function in this module is a thin wrapper around `invoke` that
 * returns a friendly empty result (or a typed availability error) when
 * the browser prototype is in use. We never throw at the call site for
 * "no Tauri" — the UI is expected to check `isClaudeBridgeAvailable()`
 * first and render a setup-help empty state.
 */

import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type {
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
  ClaudeConversationDetail,
  ClaudeConversationMeta,
  ClaudeDesktopDiscovery,
} from "./types";

export class ClaudeBridgeUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Claude Connections require the Mori desktop app (Tauri). The browser prototype cannot read Claude Desktop or Claude Code files.",
    );
    this.name = "ClaudeBridgeUnavailableError";
    this.reason = "browser-runtime";
  }
}

export function isClaudeBridgeAvailable(): boolean {
  return isTauriRuntime();
}

export async function discoverClaudeDesktop(): Promise<ClaudeDesktopDiscovery> {
  if (!isClaudeBridgeAvailable()) {
    throw new ClaudeBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_claude_desktop", undefined);
}

export async function listClaudeDesktopConversations(): Promise<ClaudeConversationMeta[]> {
  if (!isClaudeBridgeAvailable()) {
    throw new ClaudeBridgeUnavailableError();
  }
  return invokeTauriCommand("list_claude_desktop_conversations", undefined);
}

export async function getClaudeDesktopConversation(
  conversationId: string,
): Promise<ClaudeConversationDetail> {
  const trimmed = conversationId.trim();
  if (!trimmed) {
    throw new Error("conversationId is required.");
  }
  if (!isClaudeBridgeAvailable()) {
    throw new ClaudeBridgeUnavailableError();
  }
  return invokeTauriCommand("get_claude_desktop_conversation", { conversationId: trimmed });
}

export async function discoverClaudeCodeSessions(): Promise<ClaudeCodeSessionMeta[]> {
  if (!isClaudeBridgeAvailable()) {
    throw new ClaudeBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_claude_code_sessions", undefined);
}

export async function getClaudeCodeSession(
  sessionPath: string,
): Promise<ClaudeCodeSessionDetail> {
  const trimmed = sessionPath.trim();
  if (!trimmed) {
    throw new Error("sessionPath is required.");
  }
  if (!isClaudeBridgeAvailable()) {
    throw new ClaudeBridgeUnavailableError();
  }
  return invokeTauriCommand("get_claude_code_session", { sessionPath: trimmed });
}

// ─── Pure formatting helpers (tested independently) ────────────────────────

/**
 * Friendly relative timestamp for the conversation list. Returns the raw
 * input unchanged when it cannot be parsed — Claude Desktop occasionally
 * stores epoch millis, ISO strings, or empty values, and we always want a
 * graceful fallback rather than a `NaN` label.
 */
export function formatClaudeTimestamp(value: string, now: number = Date.now()): string {
  if (!value) return "—";
  const epoch = parseEpochOrIso(value);
  if (epoch === null) return value;
  const diff = now - epoch;
  if (diff < 0) return new Date(epoch).toLocaleString();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epoch).toLocaleDateString();
}

/**
 * Korean relative-time label for a Claude timestamp ("방금", "12분 전",
 * "3시간 전", "어제", "5월 24일"). The sibling {@link formatClaudeTimestamp}
 * emits English ("3h ago"), which reads as machine output on Mori's Korean
 * surfaces; this is the Korean-first variant for those views. Accepts the same
 * epoch-or-ISO input.
 */
export function formatClaudeRelativeKo(value: string, now: number = Date.now()): string {
  if (!value) return "—";
  const epoch = parseEpochOrIso(value);
  if (epoch === null) return value;
  const diff = now - epoch;
  if (diff < 0) return new Date(epoch).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 2) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(epoch).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function parseEpochOrIso(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    // Heuristic: anything past 10^12 looks like milliseconds, else seconds.
    return num > 1e12 ? num : num * 1000;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return ms;
}

/**
 * Short summary string for a conversation message. We keep things short
 * because the preview pane shows three or four of these stacked above the
 * import button, and the user is meant to skim — not read in full.
 */
export function shortMessagePreview(content: string, max: number = 140): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}
