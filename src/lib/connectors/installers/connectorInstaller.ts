/**
 * Connector installer adapter layer.
 *
 * Mori captures agent work through more than one mechanism: Claude Code wires
 * a hook into its `settings.json` (a *config-hook*), while Codex is read back
 * from its own session history under `~/.codex/sessions` (a
 * *session-discovery*). Those mechanisms differ, and they may change again as
 * the agents evolve, so this module keeps one small adapter contract in front
 * of all of them. Adding or changing a capture method is a registry entry
 * plus a `captureModel` branch, not a fan-out across the UI.
 *
 * This file is pure. The desktop (Tauri) side supplies the raw
 * `ConnectorDetectionResult[]`; `buildConnectorStatusViewModels` turns those
 * facts into an honest, tone-tagged status model for the Connections hub. The
 * browser build passes `runtimeSupportsDetection: false`, so the panel says
 * detection needs the desktop app instead of inventing a connected state.
 */
import {
  getProductAvailabilityDisplay,
  type ProductAvailabilityState,
  type ProductStateDisplay,
} from "../../product-state/productState";

/** Agents Mori can detect a capture connection for. */
export type ConnectorInstallerId = "claude-code" | "codex-cli";

/**
 * How a connector captures. `config-hook` installs into the tool's own
 * config (Claude hook); `session-discovery` reads the tool's own session
 * history read-only (Codex). The status surface must describe both honestly,
 * since only `config-hook` has anything to "install".
 */
export type ConnectorCaptureModel = "config-hook" | "session-discovery";

export type ConnectorInstallerMeta = {
  id: ConnectorInstallerId;
  displayName: string;
  captureModel: ConnectorCaptureModel;
};

const REGISTRY: readonly ConnectorInstallerMeta[] = [
  { id: "claude-code", displayName: "Claude Code", captureModel: "config-hook" },
  { id: "codex-cli", displayName: "Codex CLI", captureModel: "session-discovery" },
];

export function listConnectorInstallers(): ConnectorInstallerMeta[] {
  return REGISTRY.map((entry) => ({ ...entry }));
}

export function getConnectorInstallerMeta(
  id: ConnectorInstallerId,
): ConnectorInstallerMeta | undefined {
  return REGISTRY.find((entry) => entry.id === id);
}

/**
 * Raw detection facts the desktop side reports for one connector. This is the
 * contract a future `detect_connector_status` Tauri command fulfils.
 */
export type ConnectorDetectionResult = {
  id: ConnectorInstallerId;
  /** Is the underlying tool present (CLI on PATH, config dir present, …)? */
  toolInstalled: boolean;
  /** Tool version string, if the detector could read one. */
  toolVersion?: string;
  /**
   * config-hook only: is Mori's hook currently wired into the tool's config?
   * Left undefined for session-discovery connectors.
   */
  hookInstalled?: boolean;
  /** config-hook only: where the hook is installed, when it is. */
  hookScope?: "global" | "project" | null;
  /** session-discovery only: how many sessions Mori can read back. */
  discoveredSessionCount?: number;
};

export type ConnectorStatusViewModel = {
  id: ConnectorInstallerId;
  displayName: string;
  captureModel: ConnectorCaptureModel;
  availability: ProductAvailabilityState;
  /** Canonical label / description / tone from the product-state model. */
  display: ProductStateDisplay;
  /** Short, honest Korean detail lines for the panel. */
  detail: string[];
  /** Whether an install action applies now (config-hook, tool present, not yet hooked). */
  canInstall: boolean;
};

export type BuildConnectorStatusInput = {
  /** False in browser mode — detection requires the desktop app. */
  runtimeSupportsDetection: boolean;
  results: ConnectorDetectionResult[];
};

export function buildConnectorStatusViewModels(
  input: BuildConnectorStatusInput,
): ConnectorStatusViewModel[] {
  const byId = new Map(input.results.map((result) => [result.id, result]));
  return REGISTRY.map((meta) =>
    buildOne(meta, input.runtimeSupportsDetection, byId.get(meta.id)),
  );
}

function buildOne(
  meta: ConnectorInstallerMeta,
  runtimeSupportsDetection: boolean,
  result: ConnectorDetectionResult | undefined,
): ConnectorStatusViewModel {
  const base = {
    id: meta.id,
    displayName: meta.displayName,
    captureModel: meta.captureModel,
  };

  if (!runtimeSupportsDetection) {
    return {
      ...base,
      availability: "desktopOnly",
      display: getProductAvailabilityDisplay("desktopOnly"),
      detail: ["연결 상태 감지는 Mori 데스크톱 앱에서만 가능합니다."],
      canInstall: false,
    };
  }

  if (!result || !result.toolInstalled) {
    return {
      ...base,
      availability: "unavailable",
      display: getProductAvailabilityDisplay("unavailable"),
      detail: [`${meta.displayName}을(를) 찾지 못했습니다.`],
      canInstall: false,
    };
  }

  const versionLine = result.toolVersion ? [`버전 ${result.toolVersion}`] : [];

  if (meta.captureModel === "config-hook") {
    if (result.hookInstalled) {
      const scope = result.hookScope === "project" ? "프로젝트" : "전역";
      return {
        ...base,
        availability: "available",
        display: getProductAvailabilityDisplay("available"),
        detail: [...versionLine, `hook 연결됨 · ${scope}`],
        canInstall: false,
      };
    }
    return {
      ...base,
      availability: "requiresSetup",
      display: getProductAvailabilityDisplay("requiresSetup"),
      detail: [...versionLine, "설치됨. hook이 아직 연결되지 않았습니다."],
      canInstall: true,
    };
  }

  // session-discovery
  const count = result.discoveredSessionCount ?? 0;
  if (count > 0) {
    return {
      ...base,
      availability: "available",
      display: getProductAvailabilityDisplay("available"),
      detail: [...versionLine, `세션 ${count}개를 기록에서 불러올 수 있습니다.`],
      canInstall: false,
    };
  }
  return {
    ...base,
    availability: "partial",
    display: getProductAvailabilityDisplay("partial"),
    detail: [...versionLine, "설치됨. 불러올 세션 기록이 아직 없습니다."],
    canInstall: false,
  };
}
