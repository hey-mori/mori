import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type { OpenCodeSessionDetail, OpenCodeSessionMeta } from "./types";

export class OpenCodeBridgeUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "OpenCode session import requires the Mori desktop app (Tauri). The browser prototype cannot read the OpenCode storage directory.",
    );
    this.name = "OpenCodeBridgeUnavailableError";
    this.reason = "browser-runtime";
  }
}

export function isOpenCodeBridgeAvailable(): boolean {
  return isTauriRuntime();
}

export async function discoverOpenCodeSessions(): Promise<OpenCodeSessionMeta[]> {
  if (!isOpenCodeBridgeAvailable()) {
    throw new OpenCodeBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_opencode_sessions", undefined);
}

export async function getOpenCodeSession(
  sessionPath: string,
): Promise<OpenCodeSessionDetail> {
  const trimmed = sessionPath.trim();
  if (!trimmed) throw new Error("sessionPath is required.");
  if (!isOpenCodeBridgeAvailable()) {
    throw new OpenCodeBridgeUnavailableError();
  }
  return invokeTauriCommand("get_opencode_session", { sessionPath: trimmed });
}
