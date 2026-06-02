import { Bot, Code2, Infinity, Rocket, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import {
  loadConnectorStatus,
  type ConnectorInstallerId,
  type ConnectorStatusViewModel,
} from "../../lib/connectors/installers";

const ICONS: Record<ConnectorInstallerId, LucideIcon> = {
  "claude-code": Sparkles,
  "codex-cli": Code2,
  antigravity: Rocket,
  continue: Infinity,
  cline: Bot,
};

type PanelState =
  | { status: "loading" }
  | { status: "ready"; models: ConnectorStatusViewModel[] };

/**
 * Connection status panel for the 소스 overview. Renders the read-only status
 * the installer adapter derives from `detect_connector_status`: which agent
 * is present, whether its capture is wired, and how much it can read. In
 * browser mode the adapter returns the honest desktop-only model, so the panel
 * never invents a connected state.
 *
 * Retired: intentionally not rendered today, since showing connection status
 * to the user was judged unnecessary. The component, its styling
 * (`.sources-connection-status`), and the detection backend
 * (`detect_connector_status` + the installer adapter) are kept intact so the
 * panel can be re-wired into a view with a single render line if needed.
 */
export function ConnectorStatusPanel() {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadConnectorStatus().then((models) => {
      if (!cancelled) setState({ status: "ready", models });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") return null;

  return (
    <section className="sources-panel sources-connection-status" aria-label="연동 상태">
      <header className="sources-group-head">
        <h2>연동 상태</h2>
      </header>
      <ul>
        {state.models.map((model) => {
          const Icon = ICONS[model.id] ?? Bot;
          return (
            <li key={model.id}>
              <span className="scs-icon">
                <Icon size={15} aria-hidden="true" />
              </span>
              <span className="scs-name">{model.displayName}</span>
              <BaseStatusBadge tone={model.display.tone}>
                {model.display.label}
              </BaseStatusBadge>
              <span className="scs-detail">{model.detail.join(" · ")}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
