/**
 * Bridge between the 소스 page's anchor-agent providers and the connector
 * installer status model.
 *
 * The 소스 page groups sources into providers keyed by agent id (`claude`,
 * `codex`, …). The connector installer adapter reports live connection status
 * keyed by installer id (`claude-code`, `codex-cli`, …). This pure module maps
 * one onto the other so the inspector can show an agent's real, detected
 * connection state inline, instead of leaving it only in the 연동 설정 modal.
 *
 * Evidence providers (Git, 메모, …) and any agent with no installer entry map
 * to `null`, so the inspector simply omits the live-status block rather than
 * inventing one. Every anchor agent in the registry is backed today.
 */
import type {
  ConnectorInstallerId,
  ConnectorStatusViewModel,
} from "../connectors/installers";

/** Anchor-agent provider id → connector installer id. */
const PROVIDER_TO_INSTALLER: Record<string, ConnectorInstallerId> = {
  claude: "claude-code",
  codex: "codex-cli",
  opencode: "opencode",
  antigravity: "antigravity",
  continue: "continue",
  cline: "cline",
  cursor: "cursor",
};

/** The installer id that backs a provider's live status, or null when none. */
export function installerIdForProvider(
  providerId: string,
): ConnectorInstallerId | null {
  return PROVIDER_TO_INSTALLER[providerId] ?? null;
}

/**
 * The live connection-status model for a provider, or null when the provider
 * has no installer backing or the model set has not loaded / lacks it.
 */
export function findConnectStatusForProvider(
  providerId: string,
  models: ConnectorStatusViewModel[],
): ConnectorStatusViewModel | null {
  const installerId = installerIdForProvider(providerId);
  if (!installerId) return null;
  return models.find((model) => model.id === installerId) ?? null;
}
