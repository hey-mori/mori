import {
  Bot,
  Boxes,
  Braces,
  ChevronDown,
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
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import {
  buildConnectorControlCenter,
  describeControlCenterAvailability,
  getConnectorSetupGuide,
  type ControlCenterAvailability,
  type ControlCenterAiPlatform,
  type ControlCenterGroup,
  type ControlCenterImportKind,
  type ControlCenterSurface,
} from "../../lib/connectors";
import type { CaptureSurfaceToolFamily } from "../../lib/connectors";
import { ConnectorSetupGuidePanel } from "../sources/ConnectorSetupGuide";

export type SourceControlCenterProps = {
  /** True when running inside the Tauri desktop app. */
  isDesktop: boolean;
  /** True when an editable (non-demo) session is active, so imports can land. */
  hasActiveSession: boolean;
  /** Open the Evidence import drawer on the requested tab. */
  onImport: (kind: ControlCenterImportKind, platform?: ControlCenterAiPlatform) => void;
  /** Open Settings → Repositories (the git-capture setup surface). */
  onOpenRepositorySettings: () => void;
  /**
   * Optional controlled selection. When provided, the parent owns which source
   * family is open so the same selection can drive a sibling surface (the
   * 새 세션 page's "새 대화 시작" action keys off it). Omit for self-managed state.
   */
  selectedFamily?: CaptureSurfaceToolFamily | null;
  onSelectFamily?: (family: CaptureSurfaceToolFamily) => void;
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

const AVAILABILITY_PRIORITY: ControlCenterAvailability[] = [
  "available",
  "needsSetup",
  "needsDesktopApp",
  "planned",
  "unavailable",
];

/** A family's leading status + how many sources it holds, for its category tile. */
function summarizeGroup(group: ControlCenterGroup): {
  availability: ControlCenterAvailability;
  count: number;
} {
  let best: ControlCenterAvailability = "unavailable";
  let bestRank = AVAILABILITY_PRIORITY.length;
  for (const surface of group.surfaces) {
    const rank = AVAILABILITY_PRIORITY.indexOf(surface.availability);
    if (rank < bestRank) {
      bestRank = rank;
      best = surface.availability;
    }
  }
  return { availability: best, count: group.surfaces.length };
}

/**
 * Source Control Center — a calm, categorised hub for every way work can enter
 * Mori. Built from the capture-surface matrix via `buildConnectorControlCenter`.
 *
 * The page reads in two moves instead of one long marketplace list: pick a
 * source *family* from the icon grid, then act on that family's sources in the
 * panel below. It can never imply a connected state that does not exist —
 * planned sources stay inert, desktop-only sources disable in the browser, and
 * each source states what Mori can and cannot read.
 */
export function SourceControlCenter({
  isDesktop,
  hasActiveSession,
  onImport,
  onOpenRepositorySettings,
  selectedFamily: controlledFamily,
  onSelectFamily,
}: SourceControlCenterProps) {
  const { groups, counts } = useMemo(
    () => buildConnectorControlCenter({ isDesktop, hasActiveSession }),
    [isDesktop, hasActiveSession],
  );

  // A session is anchored by an AI agent; everything else attaches evidence to
  // it. Split the families along that line so the hub reads "start a session"
  // (agent) then "add evidence" (rest), instead of one flat marketplace.
  const agentGroups = groups.filter((group) => group.role === "agent");
  const evidenceGroups = groups.filter((group) => group.role === "evidence");

  // Open on an agent family that can actually start a session today, so the
  // panel never lands on a planned-only or evidence-only category first.
  const defaultFamily =
    (agentGroups.find((group) => group.surfaces.some((s) => s.availability === "available")) ??
      agentGroups[0] ??
      groups[0])?.family ?? null;
  const [internalFamily, setInternalFamily] = useState<CaptureSurfaceToolFamily | null>(null);
  // Controlled when the parent passes `selectedFamily`; self-managed otherwise.
  const activeFamily = controlledFamily !== undefined ? controlledFamily : internalFamily;
  const setActiveFamily = onSelectFamily ?? setInternalFamily;
  const selectedFamily = activeFamily ?? defaultFamily;
  const selectedGroup =
    groups.find((group) => group.family === selectedFamily) ?? groups[0] ?? null;

  return (
    <section className="source-cc" aria-label="세션 연동">
      <header className="source-cc-head">
        <div className="source-cc-head-text">
          <h2>
            세션 연동
            <InfoHint align="start" label="세션 연동 안내">
              AI 에이전트 하나가 작업 세션이 됩니다. 에이전트를 고르면 그 작업의 자료(Git · 터미널 ·
              파일)를 같은 세션에 붙입니다. 모든 가져오기는 검토를 거쳐 타임라인에 들어갑니다.
            </InfoHint>
          </h2>
        </div>
        <ReadinessSummary counts={counts} />
      </header>

      <CategoryCluster
        title="AI 에이전트"
        groups={agentGroups}
        selectedFamily={selectedFamily}
        onSelect={setActiveFamily}
      />
      <CategoryCluster
        title="자료"
        groups={evidenceGroups}
        selectedFamily={selectedFamily}
        onSelect={setActiveFamily}
        muted
      />

      {selectedGroup ? (
        <div
          className="source-cc-panel"
          role="tabpanel"
          aria-label={`${selectedGroup.label} 소스`}
        >
          <div className="source-cc-panel-head">
            <strong>{selectedGroup.label}</strong>
          </div>
          <div className="source-cc-panel-list" role="list">
            {selectedGroup.surfaces.map((surface) => (
              <SourceRow
                key={surface.id}
                surface={surface}
                onImport={onImport}
                onOpenRepositorySettings={onOpenRepositorySettings}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Compact, calm status legend: a coloured dot + count per readiness bucket. */
function ReadinessSummary({
  counts,
}: {
  counts: ReturnType<typeof buildConnectorControlCenter>["counts"];
}) {
  const items: Array<{ n: number; tone: string; label: string }> = [
    { n: counts.available, tone: "green", label: "사용 가능" },
    { n: counts.needsSetup, tone: "orange", label: "설정 필요" },
    { n: counts.needsDesktopApp, tone: "blue", label: "데스크톱" },
    { n: counts.planned, tone: "gray", label: "예정" },
  ].filter((item) => item.n > 0);
  return (
    <ul className="source-cc-summary" aria-label="소스 상태 요약">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`source-cc-dot tone-${item.tone}`} aria-hidden="true" />
          <strong>{item.n}</strong>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * A labeled row of category tiles for one role. The agent cluster leads ("start
 * a session"); the evidence cluster is muted ("add evidence to a session"). Both
 * drive the same selected-family panel below, so picking either kind opens its
 * sources in place.
 */
function CategoryCluster({
  title,
  groups,
  selectedFamily,
  onSelect,
  muted,
}: {
  title: string;
  groups: ControlCenterGroup[];
  selectedFamily: CaptureSurfaceToolFamily | null;
  onSelect: (family: CaptureSurfaceToolFamily) => void;
  muted?: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <div className={`source-cc-cluster${muted ? " is-muted" : ""}`}>
      <div className="source-cc-cluster-head">
        <strong>{title}</strong>
      </div>
      <div className="source-cc-categories" role="tablist" aria-label={title}>
        {groups.map((group) => (
          <CategoryTile
            key={group.family}
            group={group}
            selected={group.family === selectedFamily}
            onSelect={() => onSelect(group.family)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryTile({
  group,
  selected,
  onSelect,
}: {
  group: ControlCenterGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = FAMILY_ICON[group.family] ?? Bot;
  const summary = summarizeGroup(group);
  const status = describeControlCenterAvailability(summary.availability);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`source-cc-tile is-${summary.availability}${selected ? " is-selected" : ""}`}
      onClick={onSelect}
    >
      <span className={`source-cc-tile-icon tone-${status.tone}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="source-cc-tile-name">{group.label}</span>
      <span className="source-cc-tile-status">
        <span className={`source-cc-dot tone-${status.tone}`} aria-hidden="true" />
        {status.label}
      </span>
    </button>
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
  // Available sources need no status flag — the enabled action says it all.
  // Everything else carries a quiet chip so the row explains why it can't run yet.
  const showStatus = surface.availability !== "available";
  const detailId = `source-detail-${surface.id}`;
  // A step-by-step setup guide, when present, supersedes the one-line
  // "해야 할 일" / "설정" meta so the detail never repeats itself.
  const guide = getConnectorSetupGuide(surface.id);

  return (
    <div
      className={`source-row is-${surface.availability}${open ? " is-open" : ""}`}
      role="listitem"
    >
      <div className="source-row-main">
        <button
          type="button"
          className="source-row-toggle"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="source-row-title">{surface.label}</span>
          {surface.recommended ? (
            <span className="source-row-recommended">추천</span>
          ) : null}
          {showStatus ? (
            <span className={`source-row-status tone-${availability.tone}`}>
              {availability.label}
            </span>
          ) : null}
          <ChevronDown size={14} aria-hidden="true" className="source-row-caret" />
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
          {guide ? <ConnectorSetupGuidePanel guide={guide} /> : null}
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

/** Short, icon-led verb for an import action — the row title already names the source. */
function importVerb(kind: ControlCenterImportKind | undefined): string {
  switch (kind) {
    case "note":
      return "작성";
    case "url":
      return "추가";
    case "ai":
      return "붙여넣기";
    default:
      return "가져오기";
  }
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
        title={action.disabledReason ?? action.label}
        onClick={() => action.importKind && onImport(action.importKind, action.importPlatform)}
      >
        {importVerb(action.importKind)}
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
        title={action.disabledReason ?? action.label}
        onClick={onOpenRepositorySettings}
      >
        설정
      </Button>
    );
  }
  // `none` — planned / unavailable. An inert chip so the row never looks actionable.
  return (
    <span className="source-row-inert" aria-disabled="true">
      {action.label}
    </span>
  );
}
