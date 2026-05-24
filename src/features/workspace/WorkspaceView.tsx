import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  FolderGit2,
  FolderKanban,
  PlugZap,
  Search,
} from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
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
import { describeWorkspaceSessionStatus } from "../../lib/workspace/workspaceSummary";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import {
  formatSidebarRelative,
  shortProjectLabel,
} from "../../lib/sidebar/sessionList";
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
  const archiveSession = useMoriSessionStore((state) => state.archiveSession);
  const unarchiveSession = useMoriSessionStore((state) => state.unarchiveSession);
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const openSessionDetail = useMoriAppStore((state) => state.openSession);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  // Increments after a row-level lifecycle write so the sessions list re-reads.
  const [revision, setRevision] = useState(0);

  const [filters, setFilters] = useState<SessionsBrowserFilters>(
    DEFAULT_SESSIONS_BROWSER_FILTERS,
  );

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
        storedSessions: mergeDemoSessionSummaries(repository.listStoredSessions()),
        filters,
      }),
    // `view`/`draft`/`mode` cover active-session changes; the row list is
    // re-derived whenever any of those change. `revision` ticks after a
    // row-level lifecycle write (archive / unarchive) so the list refreshes
    // without a store subscription on every saved row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId, view, mode, draft, repository, filters, revision],
  );

  const openSession = (row: SessionRow) => {
    if (row.isActive) {
      openSessionDetail("flow");
      return;
    }
    if (row.savedAt !== null && loadBrowserSession(row.sessionId)) {
      openSessionDetail("flow");
    }
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
            </>
          }
          end={
            <>
              {/* 보관 토글은 보관할 게 있을 때만 노출 — 0건이면 토글 자체가 사라져 툴바가 더 깔끔해진다. */}
              {model.archivedCount > 0 ? (
                <button
                  type="button"
                  className={`workspace-archive-toggle${filters.archive === "archived" ? " is-active" : ""}`}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      archive: prev.archive === "archived" ? "active" : "archived",
                    }))
                  }
                  title={filters.archive === "archived" ? "활성 세션만 보기" : "보관된 세션 보기"}
                >
                  <Archive size={13} aria-hidden="true" />
                  보관 {model.archivedCount}
                </button>
              ) : null}
              <SegmentedControl
                ariaLabel="정렬"
                value={filters.sort}
                onChange={(sort) => setFilters((prev) => ({ ...prev, sort }))}
                options={[
                  { value: "recent", label: "최근순" },
                  { value: "title", label: "이름순" },
                ]}
              />
            </>
          }
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
              데모 세션입니다. 가져오기로 실제 세션이 들어오면 프로젝트별로 정리됩니다.
            </NoticeBanner>
          ) : null}
          {model.groups.map((group) => (
            <section key={group.key} className="workspace-group" aria-label={group.label}>
              <header className="workspace-group-head">
                <span
                  className="workspace-group-title"
                  title={group.label}
                >
                  <FolderGit2 size={13} aria-hidden="true" />
                  <span className="workspace-group-name">
                    {shortProjectLabel(group.label)}
                  </span>
                  <span className="workspace-group-path">{group.label}</span>
                </span>
                <Badge tone="gray">{group.sessions.length}개</Badge>
              </header>
              <ul className="workspace-rows">
                {group.sessions.map((row) => (
                  <SessionRowItem
                    key={row.sessionId}
                    row={row}
                    selected={false}
                    onSelect={() => openSession(row)}
                    onOpen={() => openSession(row)}
                    onArchive={() => handleArchive(row)}
                    onUnarchive={() => handleUnarchive(row)}
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
  onArchive,
  onUnarchive,
}: {
  row: SessionRow;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
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

  // The active session and bundled demo rows can't be archived (the demo is
  // a fixture; the active session must stay reachable). Other captured rows
  // get a hover-revealed archive / restore button so a user can tidy without
  // a separate inspector panel.
  const canArchive = row.savedAt !== null && !row.isActive;

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
            {row.startedAt || row.savedAt ? (
              <span
                className="workspace-row-span"
                title={row.spanLabel ?? undefined}
              >
                {formatSidebarRelative(row.startedAt ?? row.savedAt ?? "")}
              </span>
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
          {canArchive ? (
            <button
              type="button"
              className="workspace-row-action"
              onClick={(event) => {
                event.stopPropagation();
                if (row.isArchived) onUnarchive();
                else onArchive();
              }}
              aria-label={row.isArchived ? "보관 해제" : "보관"}
              title={row.isArchived ? "보관 해제 — 다시 활성 목록으로 돌립니다" : "보관 — 활성 목록에서 숨깁니다 (삭제는 아님)"}
            >
              {row.isArchived ? (
                <ArchiveRestore size={14} aria-hidden="true" />
              ) : (
                <Archive size={14} aria-hidden="true" />
              )}
            </button>
          ) : null}
        </span>
      </div>
    </li>
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
