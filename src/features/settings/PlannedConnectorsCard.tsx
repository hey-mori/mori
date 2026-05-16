import {
  Bot,
  Boxes,
  Code2,
  FileText,
  Folder,
  Globe,
  Layers,
  MessageSquare,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriFeatureStatusBadge } from "../../components/ui/MoriFeatureStatusBadge";
import { MoriPlannedAction } from "../../components/ui/MoriPlannedAction";
import type { FeatureId } from "../../app/featureStatus";
import { getPlannedConnectorRows } from "../../lib/settings/settingsStatus";
import {
  getCaptureMethodLabel,
  getRawDataPolicyLabel,
} from "../../lib/evidence/provenance";
import { getTrustDisplay } from "../../lib/evidence/trust";

const ICONS: Record<string, LucideIcon> = {
  terminal: Terminal,
  fileSystem: Folder,
  editor: Code2,
  vscode: Code2,
  cursor: Code2,
  browserTab: Globe,
  docs: FileText,
  slack: MessageSquare,
  notion: Layers,
  figma: Boxes,
  codexTranscript: Code2,
};

/**
 * Bridge from the legacy `sourceRegistry` ids to the canonical
 * `featureStatus.ts` ids. When an integration row maps cleanly to a feature,
 * the status badge + setup/test buttons read from the registry. When the
 * legacy integration has no feature counterpart yet (slack / notion / figma
 * etc.), we fall back to the legacy "Planned" badge so we don't fabricate
 * registry rows just to render this card.
 */
const FEATURE_ID_BY_INTEGRATION: Record<string, FeatureId | undefined> = {
  terminal: "connector.terminalShellIntegration",
  fileSystem: "connector.fileDocumentImport",
  editor: "connector.vscodeExtension",
  vscode: "connector.vscodeExtension",
  cursor: "connector.cursorExtension",
  browserTab: "connector.browserExtension",
  codexTranscript: "connector.codexDesktopImport",
  // slack / notion / figma / docs have no feature row yet — they stay on
  // the fallback Badge.
};

export function PlannedConnectorsCard() {
  const rows = getPlannedConnectorRows();
  return (
    <section className="settings-card" aria-label="Planned connectors">
      <header className="settings-card-head">
        <div>
          <h3>예정된 커넥터</h3>
          <p>
            아래 커넥터는 모두 <strong>Planned</strong> 상태입니다. 활성화되어 있지 않으며, 사용자가 직접 setup하기
            전까지 Mori는 해당 데이터에 접근하지 않습니다.
          </p>
        </div>
        <Badge tone="gray">{rows.length}개 계획됨</Badge>
      </header>
      <ul className="settings-connector-grid">
        {rows.map(({ integration, willAccess, willNotAccess }) => {
          const Icon = ICONS[integration.id] ?? Sparkles;
          const featureId = FEATURE_ID_BY_INTEGRATION[integration.id];
          return (
            <li key={integration.id}>
              <article className="settings-connector-card">
                <header>
                  <span className="settings-connector-icon">
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{integration.label}</strong>
                    <span>{integration.description}</span>
                  </div>
                  {featureId ? (
                    <MoriFeatureStatusBadge feature={featureId} />
                  ) : (
                    <Badge tone="gray">Planned</Badge>
                  )}
                </header>
                <dl>
                  <div>
                    <dt>캡처 방식</dt>
                    <dd>{getCaptureMethodLabel(integration.captureMode)}</dd>
                  </div>
                  <div>
                    <dt>원본 데이터</dt>
                    <dd>{getRawDataPolicyLabel(integration.rawDataPolicy)}</dd>
                  </div>
                  <div>
                    <dt>기본 신뢰도</dt>
                    <dd>{getTrustDisplay(integration.trustDefault).label}</dd>
                  </div>
                </dl>
                <section>
                  <h4>Mori가 접근할 항목 (활성화 시)</h4>
                  <ul>
                    {willAccess.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>Mori가 절대 하지 않는 것</h4>
                  <ul className="muted">
                    {willNotAccess.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
                <p className="settings-connector-privacy">{integration.privacyNote}</p>
                <footer>
                  {featureId ? (
                    <MoriPlannedAction feature={featureId} label="Setup" />
                  ) : (
                    <Button disabled title="다음 마일스톤에서 활성화됩니다.">
                      Setup · Planned
                    </Button>
                  )}
                  <Button disabled title="연결 테스트는 다음 마일스톤에서 활성화됩니다.">
                    Test · Planned
                  </Button>
                </footer>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
