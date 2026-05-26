import {
  Bot,
  Boxes,
  Braces,
  Chrome,
  Code2,
  FileText,
  FolderOpen,
  GitBranch,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { HelpDisclosure } from "../../components/layout/HelpDisclosure";
import {
  buildConnectorControlCenter,
  describeControlCenterAvailability,
  type ControlCenterAiPlatform,
  type ControlCenterImportKind,
  type ControlCenterSurface,
} from "../../lib/connectors";
import type { CaptureSurfaceToolFamily } from "../../lib/connectors";

export type SourceControlCenterProps = {
  /** True when running inside the Tauri desktop app. */
  isDesktop: boolean;
  /** True when an editable (non-demo) session is active, so imports can land. */
  hasActiveSession: boolean;
  /** Open the Evidence import drawer on the requested tab. */
  onImport: (kind: ControlCenterImportKind, platform?: ControlCenterAiPlatform) => void;
  /** Open Settings → Repositories (the git-capture setup surface). */
  onOpenRepositorySettings: () => void;
};

const FAMILY_ICON: Record<CaptureSurfaceToolFamily, LucideIcon> = {
  claude: Sparkles,
  codex: Code2,
  opencode: Braces,
  git: GitBranch,
  terminal: Terminal,
  manual: FileText,
  document: FolderOpen,
  ide: Boxes,
  browser: Chrome,
  analysis: Bot,
};

/**
 * Source Control Center — the honest, runtime-aware inventory of every way
 * work can enter Mori. Built entirely from the capture-surface matrix via the
 * pure `buildConnectorControlCenter` view-model, so it can never imply a
 * connected state that does not exist: planned sources stay inert, desktop-only
 * sources disable themselves in the browser, and each card states what Mori
 * can and cannot read.
 */
export function SourceControlCenter({
  isDesktop,
  hasActiveSession,
  onImport,
  onOpenRepositorySettings,
}: SourceControlCenterProps) {
  const vm = useMemo(
    () => buildConnectorControlCenter({ isDesktop, hasActiveSession }),
    [isDesktop, hasActiveSession],
  );

  return (
    <section className="source-cc" aria-label="소스 연결">
      <header className="source-cc-head">
        <div>
          <h2>소스 연결</h2>
          <p>
            Mori로 가져올 수 있는 모든 경로입니다. 각 소스가 지금 사용 가능한지, 무엇을
            읽고 무엇을 읽지 않는지 솔직하게 보여줍니다. 모든 가져오기는 명시적이며,
            검토를 거쳐야 타임라인에 들어갑니다.
          </p>
        </div>
        <div className="source-cc-counts">
          <Badge tone="green">{vm.counts.available} 사용 가능</Badge>
          {vm.counts.needsSetup > 0 ? (
            <Badge tone="orange">{vm.counts.needsSetup} 설정 필요</Badge>
          ) : null}
          {vm.counts.needsDesktopApp > 0 ? (
            <Badge tone="blue">{vm.counts.needsDesktopApp} 데스크톱</Badge>
          ) : null}
          <Badge tone="gray">{vm.counts.planned} 예정</Badge>
        </div>
      </header>

      <div className="source-cc-groups">
        {vm.groups.map((group) => {
          const Icon = FAMILY_ICON[group.family] ?? Bot;
          return (
            <div key={group.family} className="source-cc-group">
              <h3 className="source-cc-group-label">
                <Icon size={14} aria-hidden="true" />
                <span>{group.label}</span>
              </h3>
              <div className="source-cc-grid">
                {group.surfaces.map((surface) => (
                  <SurfaceCard
                    key={surface.id}
                    surface={surface}
                    onImport={onImport}
                    onOpenRepositorySettings={onOpenRepositorySettings}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SurfaceCard({
  surface,
  onImport,
  onOpenRepositorySettings,
}: {
  surface: ControlCenterSurface;
  onImport: (kind: ControlCenterImportKind, platform?: ControlCenterAiPlatform) => void;
  onOpenRepositorySettings: () => void;
}) {
  const availability = describeControlCenterAvailability(surface.availability);
  const isInert = surface.availability === "planned" || surface.availability === "unavailable";
  return (
    <article className={`source-cc-card is-${surface.availability}`}>
      <div className="source-cc-card-head">
        <strong className="source-cc-card-title">{surface.label}</strong>
        <Badge tone={availability.tone}>{availability.label}</Badge>
      </div>
      <p className="source-cc-card-status">{surface.statusDescription.short}</p>
      <p className="source-cc-card-privacy" role="note">
        {surface.privacyBoundary}
      </p>

      <HelpDisclosure label="접근 범위 · 형식" ariaLabel={`${surface.label} 상세`}>
        <div className="source-cc-detail">
          <div className="source-cc-detail-block">
            <strong className="source-cc-detail-can">Mori가 접근</strong>
            <ul>
              {surface.whatMoriCanAccess.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="source-cc-detail-block">
            <strong className="source-cc-detail-cannot">Mori가 접근하지 않음</strong>
            <ul>
              {surface.whatMoriNeverAccesses.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <dl className="source-cc-detail-meta">
            <div>
              <dt>해야 할 일</dt>
              <dd>{surface.userActionRequired}</dd>
            </div>
            <div>
              <dt>설정</dt>
              <dd>{surface.setupRequirement}</dd>
            </div>
            <div>
              <dt>다음 단계</dt>
              <dd>{surface.nextStep}</dd>
            </div>
          </dl>
        </div>
      </HelpDisclosure>

      <div className="source-cc-card-footer">
        {renderAction(surface, onImport, onOpenRepositorySettings, isInert)}
      </div>
    </article>
  );
}

function renderAction(
  surface: ControlCenterSurface,
  onImport: (kind: ControlCenterImportKind, platform?: ControlCenterAiPlatform) => void,
  onOpenRepositorySettings: () => void,
  isInert: boolean,
) {
  const { action } = surface;
  if (action.kind === "evidenceImport") {
    return (
      <Button
        variant={action.enabled ? "primary" : "secondary"}
        size="sm"
        icon={Plus}
        disabled={!action.enabled}
        title={action.disabledReason}
        onClick={() => action.importKind && onImport(action.importKind, action.importPlatform)}
      >
        {action.label}
      </Button>
    );
  }
  if (action.kind === "repositorySettings") {
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={SettingsIcon}
        disabled={!action.enabled}
        title={action.disabledReason}
        onClick={onOpenRepositorySettings}
      >
        {action.label}
      </Button>
    );
  }
  // `none` — planned / unavailable. Render an inert, clearly disabled chip so
  // the card never looks actionable.
  return (
    <span className={`source-cc-inert${isInert ? " is-planned" : ""}`} aria-disabled="true">
      {action.label}
    </span>
  );
}
