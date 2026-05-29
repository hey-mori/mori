/**
 * Desktop bridge for connector status detection.
 *
 * `detect_connector_status` (Rust) reports the raw on-disk facts; this module
 * is the thin TypeScript surface over it plus a runtime guard. The browser
 * prototype cannot read `~/.claude` / `~/.codex`, so `loadConnectorStatus`
 * returns the honest desktop-only status model instead of throwing.
 */
import { isTauriRuntime } from "../../desktop/environment";
import { invokeTauriCommand } from "../../desktop/tauriCommands";
import {
  buildConnectorStatusViewModels,
  type ConnectorDetectionResult,
  type ConnectorStatusViewModel,
} from "./connectorInstaller";

export function isConnectorStatusDetectionAvailable(): boolean {
  return isTauriRuntime();
}

/**
 * Raw detection from the desktop side. Throws via the shared
 * desktop-unavailable error in browser mode — callers that want the honest
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
