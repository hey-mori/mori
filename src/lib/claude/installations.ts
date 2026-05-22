/**
 * Local AI tool discovery — types and Tauri bridge.
 *
 * Mirrors `src-tauri/src/claude/installations.rs`. The shape is deliberately
 * narrow: one report per call, one card per detected tool. Status strings
 * are validated against a typed union so we never render an unknown badge
 * by accident.
 *
 * The UI is expected to call this once per page mount (and on refresh). The
 * Rust side stats directories only — there is no content read.
 */

import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";

export type LocalAiToolStatus =
  | "data-found"
  | "active"
  | "logs-only"
  | "cache-only"
  | "empty"
  | "unsupported"
  | "not-found";

export type DetectedTool = {
  id: string;
  label: string;
  description: string;
  path: string;
  status: LocalAiToolStatus;
  canImport: boolean;
  sessionCount: number | null;
  notes: string;
};

export type LocalAiToolReport = {
  tools: DetectedTool[];
  searchedPaths: string[];
};

/**
 * Probe the local filesystem for AI tools. Always resolves; tools that
 * aren't installed simply come back with `status: "not-found"`. The promise
 * rejects only when the Tauri runtime itself is unavailable.
 */
export async function discoverLocalAiTools(): Promise<LocalAiToolReport> {
  if (!isTauriRuntime()) {
    throw new Error(
      "Local AI tool discovery requires the Mori desktop app (Tauri). The browser prototype cannot read filesystem paths.",
    );
  }
  const raw = await invokeTauriCommand("discover_local_ai_tools", undefined);
  return raw;
}

/**
 * Tone vocabulary that maps each status to a calm, semantic badge tone.
 * Kept here (not on the Rust side) so the UI can rebind without a recompile.
 */
export function getToolStatusTone(
  status: LocalAiToolStatus,
): "green" | "amber" | "gray" | "muted" {
  switch (status) {
    case "data-found":
      return "green";
    case "active":
      return "green";
    case "logs-only":
    case "cache-only":
    case "empty":
      return "gray";
    case "unsupported":
      return "amber";
    case "not-found":
    default:
      return "muted";
  }
}

/** Short Korean label for the status badge — same vocabulary across cards. */
export function getToolStatusLabel(status: LocalAiToolStatus): string {
  switch (status) {
    case "data-found":
      return "사용 가능";
    case "active":
      return "감지됨";
    case "logs-only":
      return "로그만 있음";
    case "cache-only":
      return "캐시만 있음";
    case "empty":
      return "데이터 없음";
    case "unsupported":
      return "미지원";
    case "not-found":
    default:
      return "설치 안 됨";
  }
}
