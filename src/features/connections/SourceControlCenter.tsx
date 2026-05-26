import {
  Bot,
  Boxes,
  Braces,
  Check,
  ChevronDown,
  Chrome,
  ClipboardCopy,
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
import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  buildConnectorControlCenter,
  describeControlCenterAvailability,
  getConnectorSetupGuide,
  partitionControlCenterSurfaces,
  type ControlCenterAiPlatform,
  type ControlCenterImportKind,
  type ControlCenterSurface,
} from "../../lib/connectors";
import type { CaptureSurfaceToolFamily, ConnectorSetupGuide } from "../../lib/connectors";

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
 * Source Control Center — a compact, honest inventory of every way work can
 * enter Mori, built entirely from the capture-surface matrix via the pure
 * `buildConnectorControlCenter` view-model. It leads with the sources the user
 * can act on (available + needs-setup) as dense rows, and folds the planned
 * catalogue into a disclosure so a wall of inert "예정" cards never buries the
 * real import paths. It can never imply a connected state that does not exist:
 * planned sources stay inert, desktop-only sources disable in the browser, and
 * each row states what Mori can and cannot read.
 */
export function SourceControlCenter({
  isDesktop,
  hasActiveSession,
  onImport,
  onOpenRepositorySettings,
}: SourceControlCenterProps) {
  const { counts, actionable, planned } = useMemo(() => {
    const vm = buildConnectorControlCenter({ isDesktop, hasActiveSession });
    return { counts: vm.counts, ...partitionControlCenterSurfaces(vm) };
  }, [isDesktop, hasActiveSession]);

  return (
    <section className="source-cc" aria-label="소스 연결">
      <header className="source-cc-head">
        <div className="source-cc-head-text">
          <h2>소스 연결</h2>
          <p>모든 가져오기는 명시적이며, 검토를 거쳐야 타임라인에 들어갑니다.</p>
        </div>
        <div className="source-cc-counts">
          <Badge tone="green">{counts.available} 사용 가능</Badge>
          {counts.needsSetup > 0 ? (
            <Badge tone="orange">{counts.needsSetup} 설정 필요</Badge>
          ) : null}
          {counts.needsDesktopApp > 0 ? (
            <Badge tone="blue">{counts.needsDesktopApp} 데스크톱</Badge>
          ) : null}
          {counts.planned > 0 ? <Badge tone="gray">{counts.planned} 예정</Badge> : null}
        </div>
      </header>

      <div className="source-cc-list" role="list">
        {actionable.map((surface) => (
          <SourceRow
            key={surface.id}
            surface={surface}
            onImport={onImport}
            onOpenRepositorySettings={onOpenRepositorySettings}
          />
        ))}
      </div>

      {planned.length > 0 ? (
        <details className="source-cc-planned">
          <summary>
            <span className="source-cc-planned-label">예정된 소스 {planned.length}개</span>
            <small>설계만 완료 — 무엇을 읽고 읽지 않을지 미리 확인할 수 있습니다.</small>
          </summary>
          <div className="source-cc-list is-planned" role="list">
            {planned.map((surface) => (
              <SourceRow
                key={surface.id}
                surface={surface}
                onImport={onImport}
                onOpenRepositorySettings={onOpenRepositorySettings}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function SourceRow({
  surface,
  onImport,
  onOpenRepositorySettings,
}: {
  surface: ControlCenterSurface;
  onImport: (kind: ControlCenterImportKind, platform?: ControlCenterAiPlatform) => void;
  onOpenRepositorySettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const availability = describeControlCenterAvailability(surface.availability);
  const Icon = FAMILY_ICON[surface.toolFamily] ?? Bot;
  const detailId = `source-detail-${surface.id}`;
  // When a step-by-step setup guide exists it supersedes the one-line
  // "해야 할 일" / "설정" meta, so those rows are dropped to avoid repeating it.
  const guide = getConnectorSetupGuide(surface.id);

  return (
    <div className={`source-row is-${surface.availability}${open ? " is-open" : ""}`} role="listitem">
      <div className="source-row-main">
        <button
          type="button"
          className="source-row-toggle"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={`source-row-icon tone-${availability.tone}`}>
            <Icon size={15} aria-hidden="true" />
          </span>
          <span className="source-row-body">
            <span className="source-row-title">{surface.label}</span>
          </span>
          <Badge tone={availability.tone}>{availability.label}</Badge>
          <ChevronDown size={15} aria-hidden="true" className="source-row-caret" />
        </button>
        <div className="source-row-action">
          <RowAction
            surface={surface}
            onImport={onImport}
            onOpenRepositorySettings={onOpenRepositorySettings}
          />
        </div>
      </div>
      {open ? (
        <div className="source-row-detail" id={detailId}>
          <p className="source-row-status-line">{surface.statusDescription.short}</p>
          {guide ? <SetupGuide guide={guide} /> : null}
          <p className="source-row-privacy" role="note">
            {surface.privacyBoundary}
          </p>
          <div className="source-row-access">
            <div className="source-row-access-block">
              <strong className="source-row-can">Mori가 접근</strong>
              <ul>
                {surface.whatMoriCanAccess.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="source-row-access-block">
              <strong className="source-row-cannot">Mori가 접근하지 않음</strong>
              <ul>
                {surface.whatMoriNeverAccesses.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
          <dl className="source-row-meta">
            {guide ? null : (
              <>
                <div>
                  <dt>해야 할 일</dt>
                  <dd>{surface.userActionRequired}</dd>
                </div>
                <div>
                  <dt>설정</dt>
                  <dd>{surface.setupRequirement}</dd>
                </div>
              </>
            )}
            <div>
              <dt>다음 단계</dt>
              <dd>{surface.nextStep}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function RowAction({
  surface,
  onImport,
  onOpenRepositorySettings,
}: {
  surface: ControlCenterSurface;
  onImport: (kind: ControlCenterImportKind, platform?: ControlCenterAiPlatform) => void;
  onOpenRepositorySettings: () => void;
}) {
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
  // the row never looks actionable.
  return (
    <span className="source-row-inert" aria-disabled="true">
      {action.label}
    </span>
  );
}

/**
 * In-app setup steps for a docs-template connector — the hook / CLI wrappers /
 * local-capture bridge. The parent only renders this when a guide exists, so
 * the detail stays lean for sources that need no setup.
 */
function SetupGuide({ guide }: { guide: ConnectorSetupGuide }) {
  return (
    <div className="source-row-setup">
      <strong className="source-row-setup-title">설정 방법</strong>
      <ol className="source-row-setup-steps">
        {guide.steps.map((step, index) => (
          <li key={index}>
            <span className="source-row-setup-text">{step.text}</span>
            {step.command ? <CopyableCommand command={step.command} /> : null}
          </li>
        ))}
      </ol>
      <p className="source-row-setup-note">{guide.importNote}</p>
    </div>
  );
}

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }
  return (
    <div className="source-row-command">
      <code>{command}</code>
      <button
        type="button"
        className="source-row-command-copy"
        onClick={copy}
        aria-label={copied ? "복사됨" : "명령 복사"}
        title={copied ? "복사됨" : "명령 복사"}
      >
        {copied ? <Check size={13} aria-hidden="true" /> : <ClipboardCopy size={13} aria-hidden="true" />}
      </button>
    </div>
  );
}
