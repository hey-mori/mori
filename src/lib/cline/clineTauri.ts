import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type { ClineSessionDetail, ClineSessionMeta } from "./types";

export class ClineBridgeUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Cline session import requires the Mori desktop app (Tauri). The browser prototype cannot read the VS Code globalStorage tasks directory.",
    );
    this.name = "ClineBridgeUnavailableError";
    this.reason = "browser-runtime";
  }
}

export function isClineBridgeAvailable(): boolean {
  return isTauriRuntime();
}

export async function discoverClineSessions(): Promise<ClineSessionMeta[]> {
  if (!isClineBridgeAvailable()) {
    throw new ClineBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_cline_sessions", undefined);
}

export async function getClineSession(sessionPath: string): Promise<ClineSessionDetail> {
  const trimmed = sessionPath.trim();
  if (!trimmed) throw new Error("sessionPath is required.");
  if (!isClineBridgeAvailable()) {
    throw new ClineBridgeUnavailableError();
  }
  return invokeTauriCommand("get_cline_session", { sessionPath: trimmed });
}
