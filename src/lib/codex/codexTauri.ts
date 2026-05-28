import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type { CodexSessionDetail, CodexSessionMeta } from "./types";

export class CodexBridgeUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Codex session import requires the Mori desktop app (Tauri). The browser prototype cannot read ~/.codex/sessions.",
    );
    this.name = "CodexBridgeUnavailableError";
    this.reason = "browser-runtime";
  }
}

export function isCodexBridgeAvailable(): boolean {
  return isTauriRuntime();
}

export async function discoverCodexSessions(): Promise<CodexSessionMeta[]> {
  if (!isCodexBridgeAvailable()) {
    throw new CodexBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_codex_sessions", undefined);
}

export async function getCodexSession(sessionPath: string): Promise<CodexSessionDetail> {
  const trimmed = sessionPath.trim();
  if (!trimmed) throw new Error("sessionPath is required.");
  if (!isCodexBridgeAvailable()) {
    throw new CodexBridgeUnavailableError();
  }
  return invokeTauriCommand("get_codex_session", { sessionPath: trimmed });
}
