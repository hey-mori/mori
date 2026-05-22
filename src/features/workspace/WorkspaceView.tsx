import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  FileText,
  Flag,
  FolderGit2,
  FolderKanban,
  Lightbulb,
  ListChecks,
  Pencil,
  PlugZap,
  Search,
  X,
} from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { useMoriAppStore } from "../../app/store";
import {
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { formatDate } from "../../lib/formatting/time";
import {
  buildWorkspaceSummary,
  describeWorkspaceSessionStatus,
} from "../../lib/workspace/workspaceSummary";
import {
  DEFAULT_SESSIONS_BROWSER_FILTERS,
  buildSessionsBrowserModel,
  describeSessionOrigin,
  type SessionRow,
  type SessionsBrowserFilters,
} from "../../lib/workspace/sessionsBrowser";

/**
 * Workspace — the first-class "projects → sessions" browser.
 *
 * Under the "1 Claude conversation = 1 Mori session" model the user
 * accumulates many small sessions, often re-importing past conversations into
 * new ones. This page is where they see every session at a glance, grouped by
 * its source project (the Claude project path), open one to keep working,
 * report on it, and tidy it with safe lifecycle actions — rename and archive
 * (non-destructive; never delete). The right rail inspects the selected
 * session; when the selection is the active session it also shows the live
 * reconstruction counts.
 */
export function WorkspaceView() {
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const draft = useMoriSessionStore((state) => state.draft);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);
  const renameSession = useMoriSessionStore((state) => state.renameSession);
  const archiveSession = useMoriSessionStore((state) => state.archiveSession);
  const unarchiveSession = useMoriSessionStore((state) => state.unarchiveSession);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);

  const [filters, setFilters] = useState<SessionsBrowserFilters>(
    DEFAULT_SESSIONS_BROWSER_FILTERS,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A monotonically-increasing tick so lifecycle writes (rename / archive)
  // re-read the stored sessions without a store subscription on the list.
  const [revision, setRevision] = useState(0);

  const activeSessionId = draft?.session.id ?? view.session.id;

  const model = useMemo(
    () =>
      buildSessionsBrowserModel({
        active: {
          sessionId: activeSessionId,
          title: view.session.title,
          status: view.session.status,
          sourceLabel: view.session.sourceLabel?.trim() || null,
          startedAt: view.session.startedAt || null,
          endedAt: view.session.endedAt || null,
          isDemo: mode === "demo",
          isStored: Boolean(draft),
        },
        storedSessions: repository.listStoredSessions(),
        filters,
      }),
    // `revision` forces a re-read after a lifecycle write; `view`/`draft`/`mode`
    // cover active-session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId, view, mode, draft, repository, filters, revision],
  );

  const summary = useMemo(
    () =>
      buildWorkspaceSummary({
        view,
        mode,
        storedSessions: repository.listStoredSessions(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, mode, repository, revision],
  );

  // Resolve the currently-selected row. Default to the active session so the
  // inspector is never empty on first paint.
  const allRows = useMemo(
    () => model.groups.flatMap((group) => group.sessions),
    [model.groups],
  );
  const selectedRow =
    allRows.find((row) => row.sessionId === selectedId) ??
    allRows.find((row) => row.isActive) ??
    allRows[0] ??
    null;

  const openSession = (row: SessionRow) => {
    if (row.isActive) {
      setCurrentView("timeline");
      return;
    }
    if (row.savedAt !== null && loadBrowserSession(row.sessionId)) {
      setCurrentView("timeline");
    }
  };

  const openReport = (row: SessionRow) => {
    if (row.isActive) {
      setCurrentView("reports");
      return;
    }
    if (row.savedAt !== null && loadBrowserSession(row.sessionId)) {
      setCurrentView("reports");
    }
  };

  const handleRename = (row: SessionRow, title: string) => {
    if (renameSession(row.sessionId, title)) setRevision((value) => value + 1);
  };

  const handleArchive = (row: SessionRow) => {
    if (archiveSession(row.sessionId)) setRevision((value) => value + 1);
  };

  const handleUnarchive = (row: SessionRow) => {
    if (unarchiveSession(row.sessionId)) setRevision((value) => value + 1);
  };

  const hasResults = model.visibleCount > 0;
  // "Empty" honestly means the user has no real sessions yet — only the
  // bundled demo exists. That is when the Connections call-to-action is the
  // right nudge; a filtered-to-nothing list shows a lighter empty hint.
  const onlyDemo = model.realSessionCount === 0;

  return (
    <PageShell
      className="workspace-page"
      header={
        <PageHeader
          title="워크스페이스"
          subtitle="가져온 Claude 대화와 직접 시작한 작업이 세션으로 쌓입니다. 프로젝트별로 한눈에 보고, 열고, 정리하고, 리포트로 종합하세요."
        />
      }
      actionBar={
        <ActionBar
          label="세션 필터"
          start={
            <>
              <label className="workspace-search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="search"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, query: event.target.value }))
                  }
                  placeholder="제목 또는 프로젝트로 검색"
                  aria-label="세션 검색"
                />
              </label>
              <SegmentedControl
                ariaLabel="출처 필터"
                value={filters.origin}
                onChange={(origin) => setFilters((prev) => ({ ...prev, origin }))}
                options={[
                  { value: "all", label: "전체" },
                  { value: "imported", label: "가져옴" },
                  { value: "manual", label: "수동" },
                ]}
              />
              <SegmentedControl
                ariaLabel="보관 필터"
                value={filters.archive}
                onChange={(archive) => setFilters((prev) => ({ ...prev, archive }))}
                options={[
                  { value: "active", label: "활성" },
                  {
                    value: "archived",
                    label: model.archivedCount > 0
                      ? `보관 ${model.archivedCount}`
                      : "보관",
                  },
                  { value: "all", label: "모두" },
                ]}
              />
            </>
          }
          end={
            <SegmentedControl
              ariaLabel="정렬"
              value={filters.sort}
              onChange={(sort) => setFilters((prev) => ({ ...prev, sort }))}
              options={[
                { value: "recent", label: "최근" },
                { value: "title", label: "제목" },
              ]}
            />
          }
        />
      }
      aside={
        <SessionInspector
          row={selectedRow}
          summary={selectedRow?.isActive ? summary : null}
          onOpen={openSession}
          onOpenReport={openReport}
          onRename={handleRename}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
        />
      }
    >
      {!hasResults ? (
        onlyDemo && filters.archive !== "archived" && filters.origin !== "imported" && !filters.query.trim() ? (
          <EmptyState
            icon={FolderKanban}
            title="아직 세션이 없습니다"
            description="연결에서 Claude 대화를 가져오거나 새 세션을 시작하면 여기에 프로젝트별로 쌓입니다."
            actions={
              <Button
                variant="primary"
                icon={PlugZap}
                onClick={() => setCurrentView("connections")}
              >
                연결로 이동
              </Button>
            }
          />
        ) : (
          <EmptyState
            compact
            icon={Search}
            title="조건에 맞는 세션이 없습니다"
            description="검색어나 필터를 조정해 보세요."
          />
        )
      ) : (
        <div className="workspace-groups">
          {onlyDemo ? (
            <NoticeBanner
              tone="info"
              actions={
                <Button
                  variant="secondary"
                  icon={PlugZap}
                  onClick={() => setCurrentView("connections")}
                >
                  연결로 이동
                </Button>
              }
            >
              지금은 데모 세션만 있습니다. 연결에서 Claude 대화를 가져오면 실제 세션이 프로젝트별로
              쌓입니다.
            </NoticeBanner>
          ) : null}
          {model.groups.map((group) => (
            <section key={group.key} className="workspace-group" aria-label={group.label}>
              <header className="workspace-group-head">
                <span className="workspace-group-title" title={group.label}>
                  <FolderGit2 size={13} aria-hidden="true" />
                  <span>{group.label}</span>
                </span>
                <Badge tone="gray">{group.sessions.length}개</Badge>
              </header>
              <ul className="workspace-rows">
                {group.sessions.map((row) => (
                  <SessionRowItem
                    key={row.sessionId}
                    row={row}
                    selected={row.sessionId === selectedRow?.sessionId}
                    onSelect={() => setSelectedId(row.sessionId)}
                    onOpen={() => openSession(row)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ─── Session row ────────────────────────────────────────────────────────────

function SessionRowItem({
  row,
  selected,
  onSelect,
  onOpen,
}: {
  row: SessionRow;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const status = describeWorkspaceSessionStatus(row.status);
  const origin = describeSessionOrigin(row.origin);
  const classes = [
    "workspace-row",
    selected ? "is-selected" : "",
    row.isActive ? "is-active" : "",
    row.isArchived ? "is-archived" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li>
      <div
        className={classes}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        onDoubleClick={onOpen}
      >
        <div className="workspace-row-main">
          <span className="workspace-row-title" title={row.title}>
            {row.title}
          </span>
          <span className="workspace-row-meta">
            <MoriStatusBadge tone={origin.tone}>{origin.label}</MoriStatusBadge>
            {row.isActive ? <span className="workspace-row-active-dot">진행 중</span> : null}
            {row.spanLabel ? (
              <span className="workspace-row-span">{row.spanLabel}</span>
            ) : null}
          </span>
        </div>
        <span className="workspace-row-status">
          <MoriStatusBadge tone={status.tone}>{status.label}</MoriStatusBadge>
          {row.isArchived ? (
            <span className="workspace-row-archived-tag" title="보관됨">
              <Archive size={12} aria-hidden="true" />
            </span>
          ) : null}
        </span>
      </div>
    </li>
  );
}

// ─── Inspector ──────────────────────────────────────────────────────────────

type WorkspaceSummary = ReturnType<typeof buildWorkspaceSummary>;

function SessionInspector({
  row,
  summary,
  onOpen,
  onOpenReport,
  onRename,
  onArchive,
  onUnarchive,
}: {
  row: SessionRow | null;
  summary: WorkspaceSummary | null;
  onOpen: (row: SessionRow) => void;
  onOpenReport: (row: SessionRow) => void;
  onRename: (row: SessionRow, title: string) => void;
  onArchive: (row: SessionRow) => void;
  onUnarchive: (row: SessionRow) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  // Reset the rename editor whenever the selection changes.
  useEffect(() => {
    setRenaming(false);
    setDraftTitle(row?.title ?? "");
  }, [row?.sessionId, row?.title]);

  if (!row) {
    return (
      <InspectorPanel ariaLabel="세션 상세">
        <EmptyState
          compact
          icon={FolderKanban}
          title="세션을 선택하세요"
          description="왼쪽에서 세션을 선택하면 상세 정보와 작업이 표시됩니다."
        />
      </InspectorPanel>
    );
  }

  const status = describeWorkspaceSessionStatus(row.status);
  const origin = describeSessionOrigin(row.origin);
  const canOpen = row.isActive || row.savedAt !== null;

  const commitRename = () => {
    onRename(row, draftTitle);
    setRenaming(false);
  };

  return (
    <InspectorPanel
      ariaLabel="세션 상세"
      title={row.title}
      subtitle={row.sourceLabel ?? (row.origin === "demo" ? "데모 세션" : "수동 세션")}
      headerExtras={
        <MoriStatusBadge tone={status.tone}>{status.label}</MoriStatusBadge>
      }
      footer={
        <div className="workspace-inspector-actions">
          <Button
            variant="primary"
            onClick={() => onOpen(row)}
            disabled={!canOpen}
            title={
              canOpen
                ? "이 세션으로 전환하고 타임라인을 엽니다."
                : "아직 저장되지 않은 세션은 열 수 없습니다."
            }
          >
            열기
          </Button>
          <Button
            variant="secondary"
            icon={FileText}
            onClick={() => onOpenReport(row)}
            disabled={!canOpen}
            title="이 세션으로 전환하고 리포트를 엽니다."
          >
            리포트 보기
          </Button>
          {!renaming ? (
            <Button
              variant="ghost"
              icon={Pencil}
              onClick={() => setRenaming(true)}
              disabled={row.origin === "demo"}
              title={
                row.origin === "demo"
                  ? "데모 세션은 이름을 바꿀 수 없습니다."
                  : "세션 이름을 바꿉니다."
              }
            >
              이름 변경
            </Button>
          ) : null}
          {row.origin === "demo" ? null : row.isArchived ? (
            <Button
              variant="ghost"
              icon={ArchiveRestore}
              onClick={() => onUnarchive(row)}
              title="보관을 해제하고 기본 목록으로 되돌립니다."
            >
              보관 해제
            </Button>
          ) : (
            <Button
              variant="ghost"
              icon={Archive}
              onClick={() => onArchive(row)}
              title="세션을 보관합니다. 삭제하지 않으며 보관 필터에서 다시 볼 수 있습니다."
            >
              보관
            </Button>
          )}
        </div>
      }
    >
      {renaming ? (
        <div className="workspace-rename" role="group" aria-label="세션 이름 변경">
          <input
            type="text"
            value={draftTitle}
            autoFocus
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") setRenaming(false);
            }}
            aria-label="새 세션 이름"
          />
          <Button variant="primary" icon={Check} onClick={commitRename}>
            저장
          </Button>
          <Button variant="ghost" icon={X} onClick={() => setRenaming(false)}>
            취소
          </Button>
        </div>
      ) : null}

      <dl className="workspace-detail-grid">
        <div>
          <dt>프로젝트</dt>
          <dd>{row.sourceLabel ?? (row.origin === "demo" ? "데모" : "수동 세션")}</dd>
        </div>
        <div>
          <dt>출처</dt>
          <dd>
            <MoriStatusBadge tone={origin.tone}>{origin.label}</MoriStatusBadge>
          </dd>
        </div>
        <div>
          <dt>분량</dt>
          <dd>{row.spanLabel ?? "정보 없음"}</dd>
        </div>
        <div>
          <dt>저장</dt>
          <dd>{row.savedAt ? formatDate(row.savedAt) : "저장 전"}</dd>
        </div>
      </dl>

      {row.isArchived ? (
        <p className="workspace-detail-note">
          <Archive size={13} aria-hidden="true" />
          <span>보관된 세션입니다. 삭제되지 않았으며 언제든 다시 열 수 있습니다.</span>
        </p>
      ) : null}

      {summary ? (
        <section className="workspace-counts" aria-label="재구성된 항목">
          <h4>
            <Activity size={13} aria-hidden="true" />
            <span>재구성된 항목</span>
          </h4>
          <ul>
            <li>
              <span className="workspace-count-icon" aria-hidden="true">
                <Activity size={14} />
              </span>
              <span>이벤트</span>
              <b>{summary.counts.events}</b>
            </li>
            <li>
              <span className="workspace-count-icon" aria-hidden="true">
                <Flag size={14} />
              </span>
              <span>
                이슈
                {summary.counts.issues > 0
                  ? ` · 해결 ${summary.counts.resolvedIssues}`
                  : ""}
              </span>
              <b>{summary.counts.issues}</b>
            </li>
            <li>
              <span className="workspace-count-icon" aria-hidden="true">
                <Lightbulb size={14} />
              </span>
              <span>결정</span>
              <b>{summary.counts.decisions}</b>
            </li>
            <li>
              <span className="workspace-count-icon" aria-hidden="true">
                <ListChecks size={14} />
              </span>
              <span>
                다음 작업
                {summary.counts.nextActions > 0
                  ? ` · 완료 ${summary.counts.completedNextActions}`
                  : ""}
              </span>
              <b>{summary.counts.nextActions}</b>
            </li>
          </ul>
          <p className="workspace-counts-note">
            현재 활성 세션에서 재구성된 항목 수입니다. 세션을 분석하면 갱신됩니다.
          </p>
        </section>
      ) : (
        <p className="workspace-detail-note">
          <CalendarClock size={13} aria-hidden="true" />
          <span>
            이 세션을 열면 타임라인 · 증거 · 검토 · 리포트에서 재구성된 항목을 볼 수
            있습니다.
          </span>
        </p>
      )}
    </InspectorPanel>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div className="workspace-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`workspace-segmented-option${
            option.value === value ? " is-active" : ""
          }`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
