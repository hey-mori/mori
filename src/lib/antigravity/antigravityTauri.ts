import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type { AntigravitySessionDetail, AntigravitySessionMeta } from "./types";

export class AntigravityBridgeUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Antigravity session import requires the Mori desktop app (Tauri). The browser prototype cannot read ~/.gemini/antigravity.",
    );
    this.name = "AntigravityBridgeUnavailableError";
    this.reason = "browser-runtime";
  }
}

export function isAntigravityBridgeAvailable(): boolean {
  return isTauriRuntime();
}

export async function discoverAntigravitySessions(): Promise<AntigravitySessionMeta[]> {
  if (!isAntigravityBridgeAvailable()) {
    throw new AntigravityBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_antigravity_sessions", undefined);
}

export async function getAntigravitySession(
  sessionPath: string,
): Promise<AntigravitySessionDetail> {
  const trimmed = sessionPath.trim();
  if (!trimmed) throw new Error("sessionPath is required.");
  if (!isAntigravityBridgeAvailable()) {
    throw new AntigravityBridgeUnavailableError();
  }
  return invokeTauriCommand("get_antigravity_session", { sessionPath: trimmed });
}
