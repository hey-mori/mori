import {
  Bot,
  Boxes,
  ChevronRight,
  Code2,
  FileText,
  Folder,
  GitCommit,
  Globe,
  Layers,
  Lock,
  MessageSquare,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  getHubCardActionLabel,
  type HubImportKind,
} from "../../lib/sources/integrationGroups";
import type {
  IntegrationStatus,
  SourceIntegration,
} from "../../lib/sources/sourceRegistry";

const CAPTURE_LABELS: Record<string, string> = {
  manual: "Manual input",
  explicitImport: "Explicit import",
  desktopCommand: "Desktop command",
  plannedConnector: "Planned connector",
  mock: "Demo data",
};

const RAW_LABELS: Record<string, string> = {
  retained: "Full data retained",
  summaryOnly: "Summary only",
  redacted: "Redacted",
  notCaptured: "Not captured",
};

const TRUST_TONE: Record<string, "green" | "blue" | "purple"> = {
  verified: "green",
  observed: "blue",
  inferred: "purple",
};

const STATUS_TONE: Record<IntegrationStatus, "green" | "blue" | "gray" | "orange"> = {
  implemented: "green",
  partial: "blue",
  planned: "gray",
  mockOnly: "orange",
  unavailable: "gray",
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  implemented: "Available",
  partial: "Partial",
  planned: "Planned",
  mockOnly: "Demo only",
  unavailable: "Unavailable",
};

const INTEGRATION_ICON: Record<string, LucideIcon> = {
  manualNote: FileText,
  url: Globe,
  aiConversation: Bot,
  claudeTranscript: Sparkles,
  chatgptTranscript: Bot,
  codexTranscript: Code2,
  gitDiff: GitCommit,
  tauriGitDiff: GitCommit,
  repository: Folder,
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
};

export function IntegrationCard({
  integration,
  selected,
  importKind,
  onPrimary,
  onInspect,
  primaryDisabled = false,
  primaryDisabledReason,
}: {
  integration: SourceIntegration;
  selected: boolean;
  /** When set, primary action opens the import flow with this kind. */
  importKind: HubImportKind | null;
  onPrimary?: () => void;
  onInspect: () => void;
  /** Force-disable the primary action (e.g. demo session) while keeping the card interactive. */
  primaryDisabled?: boolean;
  primaryDisabledReason?: string;
}) {
  const Icon = INTEGRATION_ICON[integration.id] ?? FileText;
  const isPlanned = integration.status === "planned";
  const isPartial = integration.status === "partial";
  const actionLabel = getHubCardActionLabel(integration);
  const canTakeAction = Boolean(importKind) && !isPlanned && Boolean(onPrimary) && !primaryDisabled;
  const trustTone = TRUST_TONE[integration.trustDefault] ?? "purple";

  return (
    <article
      className={`integration-card ${selected ? "is-selected" : ""} ${
        isPlanned ? "is-planned" : ""
      }`}
      aria-current={selected ? "true" : undefined}
    >
      <button
        type="button"
        className="integration-card-body"
        onClick={onInspect}
        aria-label={`${integration.label} 자세히 보기`}
      >
        <div className="integration-card-head">
          <span className={`integration-card-icon tone-${trustTone}`}>
            <Icon size={18} />
          </span>
          <div className="integration-card-titles">
            <strong>{integration.label}</strong>
            <span>{integration.description}</span>
          </div>
          <Badge tone={STATUS_TONE[integration.status]}>{STATUS_LABEL[integration.status]}</Badge>
        </div>
        <dl className="integration-card-meta">
          <div>
            <dt>Capture</dt>
            <dd>{CAPTURE_LABELS[integration.captureMode] ?? integration.captureMode}</dd>
          </div>
          <div>
            <dt>Raw data</dt>
            <dd>{RAW_LABELS[integration.rawDataPolicy] ?? integration.rawDataPolicy}</dd>
          </div>
          <div>
            <dt>Trust</dt>
            <dd className={`trust-${integration.trustDefault}`}>{integration.trustDefault}</dd>
          </div>
        </dl>
        <p className="integration-card-privacy">
          <Lock size={11} aria-hidden="true" />
          <span>{integration.privacyNote}</span>
        </p>
      </button>
      <footer className="integration-card-footer">
        {isPlanned ? (
          <Button disabled title="이 커넥터는 다음 마일스톤에서 활성화됩니다.">
            Planned
          </Button>
        ) : (
          <Button
            variant={canTakeAction ? "primary" : "secondary"}
            disabled={!canTakeAction}
            onClick={onPrimary}
            icon={ChevronRight}
            title={
              canTakeAction
                ? actionLabel
                : primaryDisabled
                  ? primaryDisabledReason ?? "이 세션에서는 추가할 수 없습니다."
                  : "이 항목은 가져오기 패널의 다른 탭에서 처리됩니다."
            }
          >
            {isPartial ? "Partial · 사용 가능" : actionLabel}
          </Button>
        )}
      </footer>
    </article>
  );
}
