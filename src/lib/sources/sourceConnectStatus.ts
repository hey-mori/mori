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
 * Providers with no installer entry yet (OpenCode, Cursor) map to `null`, so
 * the inspector simply omits the live-status block rather than inventing one.
 */
import type {
  ConnectorInstallerId,
  ConnectorStatusViewModel,
} from "../connectors/installers";

/** Anchor-agent provider id → connector installer id. */
const PROVIDER_TO_INSTALLER: Record<string, ConnectorInstallerId> = {
  claude: "claude-code",
  codex: "codex-cli",
  antigravity: "antigravity",
  continue: "continue",
  cline: "cline",
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
