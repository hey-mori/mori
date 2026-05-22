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
  MessageSquare,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { MoriPlannedAction } from "../../components/ui/MoriPlannedAction";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import {
  getHubCardActionLabel,
  type HubImportKind,
} from "../../lib/sources/integrationGroups";
import type { SourceIntegration } from "../../lib/sources/sourceRegistry";
import {
  getProductAvailabilityDisplay,
  productAvailabilityFromIntegrationStatus,
} from "../../lib/product-state/productState";
import { getTrustDisplay, getTrustTone } from "../../lib/evidence/trust";

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
  const actionLabel = getHubCardActionLabel(integration);
  const canTakeAction = Boolean(importKind) && !isPlanned && Boolean(onPrimary) && !primaryDisabled;
  const trustTone = getTrustTone(integration.trustDefault);
  const availability = getProductAvailabilityDisplay(
    productAvailabilityFromIntegrationStatus(integration.status),
  );

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
        title={integration.privacyNote}
      >
        <div className="integration-card-head">
          <span className={`integration-card-icon tone-${trustTone}`}>
            <Icon size={18} />
          </span>
          <div className="integration-card-titles">
            <strong>{integration.label}</strong>
            <span>{integration.description}</span>
          </div>
          <MoriStatusBadge tone={availability.tone}>{availability.label}</MoriStatusBadge>
        </div>
        <div className="integration-card-tags">
          <span className={`integration-card-trust trust-${integration.trustDefault}`}>
            {getTrustDisplay(integration.trustDefault).label}
          </span>
        </div>
      </button>
      <footer className="integration-card-footer">
        {isPlanned ? (
          <>
            <p className="integration-card-footer-note">
              다음 마일스톤에 제공됩니다. 지금은 가져올 수 없습니다.
            </p>
            <MoriPlannedAction
              icon={ChevronRight}
              label="예정"
              title="다음 마일스톤에 제공됩니다. 지금은 가져올 수 없습니다."
            />
          </>
        ) : canTakeAction ? (
          <Button
            variant="primary"
            onClick={onPrimary}
            icon={ChevronRight}
            title={actionLabel}
          >
            {actionLabel}
          </Button>
        ) : (
          <>
            <p className="integration-card-footer-note">
              {primaryDisabled
                ? primaryDisabledReason ?? "이 세션에서는 추가할 수 없습니다."
                : "가져오기 패널의 다른 탭에서 처리됩니다."}
            </p>
            <Button
              variant="secondary"
              disabled
              icon={ChevronRight}
              title={
                primaryDisabled
                  ? primaryDisabledReason ?? "이 세션에서는 추가할 수 없습니다."
                  : "이 항목은 가져오기 패널의 다른 탭에서 처리됩니다."
              }
            >
              {actionLabel}
            </Button>
          </>
        )}
      </footer>
    </article>
  );
}
