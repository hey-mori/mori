import { useEffect, useState } from "react";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import {
  loadConnectorStatus,
  type ConnectorStatusViewModel,
} from "../../lib/connectors/installers";

type PanelState =
  | { status: "loading" }
  | { status: "ready"; models: ConnectorStatusViewModel[] };

/**
 * Connection status panel for the 소스 overview. Renders the read-only status
 * the installer adapter derives from `detect_connector_status` — which agent
 * is present, whether its capture is wired, and how much it can read. In
 * browser mode the adapter returns the honest desktop-only model, so the panel
 * never invents a connected state. Reuses the `sources-group` /
 * `sources-recent-list` styling so it adds no new stylesheet rules.
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
    <section className="sources-panel" aria-label="연결 상태">
      <header className="sources-group-head">
        <h2>연결 상태</h2>
      </header>
      <ul className="sources-recent-list">
        {state.models.map((model) => (
          <li key={model.id}>
            <strong>
              {model.displayName}{" "}
              <BaseStatusBadge tone={model.display.tone}>
                {model.display.label}
              </BaseStatusBadge>
            </strong>
            <span>{model.detail.join(" · ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
