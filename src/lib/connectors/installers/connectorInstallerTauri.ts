/**
 * Desktop bridge for connector status detection.
 *
 * `detect_connector_status` (Rust) reports the raw on-disk facts; this module
 * is the thin TypeScript surface over it plus a runtime guard. The browser
 * prototype cannot read `~/.claude` / `~/.codex`, so `loadConnectorStatus`
 * returns the honest desktop-only status model instead of throwing.
 */
import { resolveResource } from "@tauri-apps/api/path";
import { isTauriRuntime } from "../../desktop/environment";
import { invokeTauriCommand } from "../../desktop/tauriCommands";
import {
  buildClaudeHookCommand,
  buildConnectorStatusViewModels,
  type ClaudeHookInstallResult,
  type ClaudeHookUninstallResult,
  type ConnectorDetectionResult,
  type ConnectorStatusViewModel,
} from "./connectorInstaller";

export type ClaudeHookScope =
  | { scope: "global" }
  | { scope: "project"; projectPath: string };

export function isConnectorStatusDetectionAvailable(): boolean {
  return isTauriRuntime();
}

/**
 * Raw detection from the desktop side. Throws via the shared
 * desktop-unavailable error in browser mode; callers that want the honest
 * fallback model should use `loadConnectorStatus` instead.
 */
export async function detectConnectorStatus(): Promise<ConnectorDetectionResult[]> {
  return invokeTauriCommand("detect_connector_status", undefined);
}

/**
 * Connections-hub status model. In browser mode (or if detection fails) this
 * returns the desktop-only model rather than an error, so the panel always
 * renders an honest state.
 */
export async function loadConnectorStatus(): Promise<ConnectorStatusViewModel[]> {
  if (!isConnectorStatusDetectionAvailable()) {
    return buildConnectorStatusViewModels({
      runtimeSupportsDetection: false,
      results: [],
    });
  }
  try {
    const results = await detectConnectorStatus();
    return buildConnectorStatusViewModels({
      runtimeSupportsDetection: true,
      results,
    });
  } catch {
    return buildConnectorStatusViewModels({
      runtimeSupportsDetection: false,
      results: [],
    });
  }
}

function requireDesktop(): void {
  if (!isTauriRuntime()) {
    throw new Error(
      "Claude 훅 연결은 Mori 데스크톱 앱에서만 가능합니다 (settings.json을 직접 수정합니다).",
    );
  }
}

/**
 * Wire the Mori hook into Claude Code's settings.json. `command` is the
 * OS-aware command string (see `buildClaudeHookCommand`). Throws in browser
 * mode; the safe merge / idempotency live in the Rust command.
 */
export async function installClaudeHook(
  target: ClaudeHookScope,
  command: string,
): Promise<ClaudeHookInstallResult> {
  requireDesktop();
  return invokeTauriCommand("install_claude_hook", {
    scope: target.scope,
    command,
    projectPath: target.scope === "project" ? target.projectPath : undefined,
  });
}

/** Remove the Mori hook from Claude Code's settings.json (other hooks survive). */
export async function uninstallClaudeHook(
  target: ClaudeHookScope,
): Promise<ClaudeHookUninstallResult> {
  requireDesktop();
  return invokeTauriCommand("uninstall_claude_hook", {
    scope: target.scope,
    projectPath: target.scope === "project" ? target.projectPath : undefined,
  });
}

/**
 * One-click connect: resolve the bundled hook-script directory, build the
 * OS-aware command (platform inferred from the resolved path separators), and
 * install it. Desktop only; the modal drives this.
 */
export async function connectClaudeHook(
  target: ClaudeHookScope,
): Promise<ClaudeHookInstallResult> {
  requireDesktop();
  const dir = await resolveResource("connectors/claude-code");
  const platform = /^[a-zA-Z]:[\\/]/.test(dir) || dir.includes("\\") ? "win32" : "posix";
  return installClaudeHook(target, buildClaudeHookCommand(dir, platform));
}
