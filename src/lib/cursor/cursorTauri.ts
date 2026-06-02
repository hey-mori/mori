import { isTauriRuntime } from "../desktop/environment";
import { invokeTauriCommand } from "../desktop/tauriCommands";
import type { CursorSessionDetail, CursorSessionMeta } from "./types";

export class CursorBridgeUnavailableError extends Error {
  readonly reason: "browser-runtime";
  constructor() {
    super(
      "Cursor session import requires the Mori desktop app (Tauri). The browser prototype cannot read Cursor's state.vscdb database.",
    );
    this.name = "CursorBridgeUnavailableError";
    this.reason = "browser-runtime";
  }
}

export function isCursorBridgeAvailable(): boolean {
  return isTauriRuntime();
}

export async function discoverCursorSessions(): Promise<CursorSessionMeta[]> {
  if (!isCursorBridgeAvailable()) {
    throw new CursorBridgeUnavailableError();
  }
  return invokeTauriCommand("discover_cursor_sessions", undefined);
}

export async function getCursorSession(sessionPath: string): Promise<CursorSessionDetail> {
  const trimmed = sessionPath.trim();
  if (!trimmed) throw new Error("sessionPath is required.");
  if (!isCursorBridgeAvailable()) {
    throw new CursorBridgeUnavailableError();
  }
  return invokeTauriCommand("get_cursor_session", { sessionPath: trimmed });
}
