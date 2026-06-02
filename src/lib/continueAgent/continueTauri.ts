import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type { ContinueSessionDetail, ContinueSessionMeta } from "./types";

export class ContinueBridgeUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Continue session import requires the Mori desktop app (Tauri). The browser prototype cannot read ~/.continue/sessions.",
    );
    this.name = "ContinueBridgeUnavailableError";
    this.reason = "browser-runtime";
  }
}

export function isContinueBridgeAvailable(): boolean {
  return isTauriRuntime();
}

export async function discoverContinueSessions(): Promise<ContinueSessionMeta[]> {
  if (!isContinueBridgeAvailable()) {
    throw new ContinueBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_continue_sessions", undefined);
}

export async function getContinueSession(
  sessionPath: string,
): Promise<ContinueSessionDetail> {
  const trimmed = sessionPath.trim();
  if (!trimmed) throw new Error("sessionPath is required.");
  if (!isContinueBridgeAvailable()) {
    throw new ContinueBridgeUnavailableError();
  }
  return invokeTauriCommand("get_continue_session", { sessionPath: trimmed });
}
