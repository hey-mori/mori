import {
  AlertCircle,
  Bot,
  Boxes,
  ChevronDown,
  Chrome,
  Code2,
  FolderGit2,
  HardDrive,
  KeyRound,
  Layers,
  Maximize2,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { HelpDisclosure } from "../../components/layout/HelpDisclosure";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { PageShell } from "../../components/layout/PageShell";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { useMoriReviewStore } from "../../app/reviewStore";
import {
  discoverClaudeCodeSessions,
  formatClaudeRelativeKo,
  getClaudeCodeSession,
  isClaudeBridgeAvailable,
  shortMessagePreview,
} from "../../lib/claude/claudeTauri";
import { buildImportCandidateFromClaudeCodeSession } from "../../lib/claude/claudeImport";
import {
  computeConversationStats,
  formatTokenCount,
  type ConversationStats,
} from "../../lib/claude/conversationStats";
import {
  discoverLocalAiTools,
  getToolStatusLabel,
  getToolStatusTone,
  type DetectedTool,
  type LocalAiToolReport,
} from "../../lib/claude/installations";
import type {
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
} from "../../lib/claude/types";
import { isTauriRuntime } from "../../lib/desktop";
import { ConversationViewer } from "./ConversationViewer";
import { SourceControlCenter } from "./SourceControlCenter";
import { WorkBundlePanel } from "../import/WorkBundlePanel";

type SessionsState = {
  status: "idle" | "loading" | "ready" | "error";
  sessions: ClaudeCodeSessionMeta[];
  error: string | null;
};

type ToolsState = {
  status: "idle" | "loading" | "ready" | "error";
  report: LocalAiToolReport | null;
  error: string | null;
};

type Selection = {
  filePath: string;
  detail: ClaudeCodeSessionDetail | null;
  loading: boolean;
  error: string | null;
} | null;

type ImportStatus = {
  tone: "ok" | "info" | "error";
  message: string;
} | null;

const DEFAULT_SESSIONS: SessionsState = {
  status: "idle",
  sessions: [],
  error: null,
};

const DEFAULT_TOOLS: ToolsState = {
  status: "idle",
  report: null,
  error: null,
};

/**
 * Icon vocabulary for the detected-tools grid. Each tool id maps to a calm
 * lucide glyph that hints at what the tool is — Claude (sparkles), Chrome
 * extension (Chrome), Codex (code), OpenAI (KeyRound for the credentials
 * directory), etc. Anything we don't have a specific icon for falls through
 * to a neutral robot.
 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  "claude-projects": Sparkles,
  "claude-chrome-host": Chrome,
  "claude-nest-3p": Boxes,
  "claude-3p": Layers,
  "claude-cli-nodejs": Terminal,
  "claude-roaming": HardDrive,
  "codex-cli": Code2,
  "openai-cli": KeyRound,
};

export function ConnectionsView() {
  const bridgeAvailable = isClaudeBridgeAvailable();
  const draft = useMoriSessionStore((state) => state.draft);
  const view = useMoriSessionStore(selectSessionView);
  const importAsNewSession = useMoriSessionStore((state) => state.importAsNewSession);
  const startReview = useMoriReviewStore((state) => state.startReview);
  // `navigate` routes the post-import "evidence" landing into the unified
  // Session Detail workspace (its 증거 tab), where Import Review renders.
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const requestEvidenceImport = useMoriAppStore((state) => state.requestEvidenceImport);
  const openSettingsSheet = useMoriAppStore((state) => state.openSettingsSheet);
  const isDemoSession = !draft;
  const desktopRuntime = isTauriRuntime();

  const [tools, setTools] = useState<ToolsState>(DEFAULT_TOOLS);
  const [sessions, setSessions] = useState<SessionsState>(DEFAULT_SESSIONS);
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Project / session ids drive the imported source. We fall back to the
  // demo session ids when no draft is active so the preview still works
  // (the import button itself stays disabled in that mode).
  const projectId = view.project.id;
  const sessionId = draft?.session.id ?? view.session.id;

  const loadTools = useCallback(async () => {
    if (!bridgeAvailable) return;
    setTools((prev) => ({ ...prev, status: "loading", error: null }));
    try {
      const report = await discoverLocalAiTools();
      setTools({ status: "ready", report, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTools({ status: "error", report: null, error: message });
    }
  }, [bridgeAvailable]);

  const loadSessions = useCallback(async () => {
    if (!bridgeAvailable) return;
    setSessions((prev) => ({ ...prev, status: "loading", error: null }));
    try {
      const list = await discoverClaudeCodeSessions();
      setSessions({ status: "ready", sessions: list, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSessions({ status: "error", sessions: [], error: message });
    }
  }, [bridgeAvailable]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    void loadTools();
    void loadSessions();
  }, [bridgeAvailable, loadTools, loadSessions]);

  function handleRefresh() {
    void loadTools();
    void loadSessions();
    setSelection(null);
    setImportStatus(null);
  }

  function handleSelectSession(meta: ClaudeCodeSessionMeta) {
    setSelection({
      filePath: meta.filePath,
      detail: null,
      loading: true,
      error: null,
    });
    setImportStatus(null);
    setViewerOpen(false);
    getClaudeCodeSession(meta.filePath)
      .then((detail) => {
        setSelection({
          filePath: meta.filePath,
          detail,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setSelection({
          filePath: meta.filePath,
          detail: null,
          loading: false,
          error: message,
        });
      });
  }

  function handleImportAsNewSession() {
    if (!selection || !selection.detail) return;
    const detail = selection.detail;
    try {
      const capturedAt = new Date().toISOString();
      // Build against the demo/placeholder ids first; importAsNewSession
      // mints the real session and re-binds the candidate to it.
      const candidate = buildImportCandidateFromClaudeCodeSession(detail, {
        projectId,
        sessionId,
        capturedAt,
      });
      const { startedAt, endedAt } = deriveConversationWindow(detail, capturedAt);
      const { candidate: reboundCandidate } = importAsNewSession({
        candidate,
        title: detail.title,
        startedAt,
        endedAt,
        projectLabel: detail.projectName || undefined,
      });
      startReview(reboundCandidate, "ai-transcript");
      setImportStatus({
        tone: "ok",
        message:
          "새 세션을 만들고 Import Review로 이동했습니다. 적용 전까지 세션은 비어 있으며, 취소하면 빈 세션은 자동으로 정리됩니다.",
      });
      setViewerOpen(false);
      setCurrentView("evidence");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportStatus({ tone: "error", message });
    }
  }

  function handleImportIntoCurrentSession() {
    if (!selection || !selection.detail) return;
    if (isDemoSession) {
      setImportStatus({
        tone: "info",
        message:
          "현재 활성 세션이 없습니다. '새 세션으로 가져오기'를 사용하거나 세션을 먼저 시작하세요.",
      });
      return;
    }
    try {
      const capturedAt = new Date().toISOString();
      const candidate = buildImportCandidateFromClaudeCodeSession(selection.detail, {
        projectId,
        sessionId,
        capturedAt,
      });
      // The import is committed by Import Review's Apply (the review's
      // commit callback calls addImport with the accepted subset), so we
      // only open the review here — no eager write to the session.
      startReview(candidate, "ai-transcript");
      setImportStatus({
        tone: "ok",
        message: "현재 세션의 Import Review로 이동했습니다. 적용하면 타임라인에 추가됩니다.",
      });
      setViewerOpen(false);
      setCurrentView("evidence");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportStatus({ tone: "error", message });
    }
  }

  // Filter sessions by the search query — matches title or decoded project
  // path. Empty query passes everything through, so the input is purely
  // additive and never hides the list by accident.
  const filteredSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions.sessions;
    return sessions.sessions.filter((session) => {
      const title = session.title.toLowerCase();
      const project = session.projectName.toLowerCase();
      return title.includes(needle) || project.includes(needle);
    });
  }, [query, sessions.sessions]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClaudeCodeSessionMeta[]>();
    for (const session of filteredSessions) {
      const list = map.get(session.projectName) ?? [];
      list.push(session);
      map.set(session.projectName, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredSessions]);

  const controlCenter = (
    <SourceControlCenter
      isDesktop={desktopRuntime}
      hasActiveSession={!isDemoSession}
      onImport={requestEvidenceImport}
      onOpenRepositorySettings={() => openSettingsSheet("repositories")}
    />
  );

  if (!bridgeAvailable) {
    return (
      <PageShell className="connections-page" maxWidth="detail">
        {controlCenter}
        <AdvancedBundleDisclosure />
        <ConnectionsBrowserHelp />
      </PageShell>
    );
  }

  const importableCount =
    tools.report?.tools.filter((tool) => tool.canImport).length ?? 0;
  const detectedCount =
    tools.report?.tools.filter((tool) => tool.status !== "not-found").length ?? 0;

  return (
    <PageShell
      className="connections-page"
      maxWidth="detail"
      actionBar={
        <ActionBar
          label="연결"
          start={
            <>
              {tools.report ? (
                <>
                  <Badge tone={importableCount > 0 ? "green" : "gray"}>
                    {detectedCount}개 감지 · {importableCount}개 가져오기 가능
                  </Badge>
                  <HelpDisclosure label="가져올 수 있는 도구" ariaLabel="가져오기 정책 설명">
                    <p>
                      로컬에 세션 파일이 있는 도구만 가져옵니다.
                    </p>
                    <p>
                      웹 채팅은 직접 붙여넣기로 기록하세요.
                    </p>
                  </HelpDisclosure>
                </>
              ) : null}
            </>
          }
          end={
            <Button icon={RefreshCw} onClick={handleRefresh}>
              새로고침
            </Button>
          }
        />
      }
    >
      {importStatus ? (
        <NoticeBanner
          tone={
            importStatus.tone === "ok"
              ? "success"
              : importStatus.tone === "error"
                ? "danger"
                : "info"
          }
          onDismiss={() => setImportStatus(null)}
        >
          {importStatus.message}
        </NoticeBanner>
      ) : null}

      {controlCenter}

      {/* The auto-detected AI work sessions are the centerpiece: one Claude
          conversation = one Mori work session. They lead the page; the manual
          multi-source bundle and tool detection fold away below as advanced /
          reference material. */}
      <section className="connections-section connections-sessions-section">
        <header className="connections-sessions-head">
          <h2>
            이어서 할 작업 세션
            <InfoHint align="start" label="작업 세션 안내">
              Claude에서 한 작업을 골라 Mori 작업 세션으로 가져옵니다. 대화 하나가 작업 세션 하나가
              되고, 그때 함께 쓴 Git · 터미널 · 파일을 같은 세션에 자료로 붙일 수 있습니다.
            </InfoHint>
          </h2>
          <Badge tone={sessions.sessions.length > 0 ? "purple" : "gray"}>
            {sessions.sessions.length}개 세션
          </Badge>
        </header>

        <div className="connections-sessions-toolbar">
          <ToolbarSearch
            value={query}
            onChange={setQuery}
            placeholder="제목 또는 프로젝트 경로로 검색"
            ariaLabel="Claude 세션 검색"
            className="connections-search"
          />
          {query && filteredSessions.length < sessions.sessions.length ? (
            <small className="connections-search-meta">
              {filteredSessions.length} / {sessions.sessions.length}개 표시
            </small>
          ) : null}
        </div>

        <SessionFeed
          state={sessions}
          grouped={grouped}
          hasQuery={query.trim().length > 0}
          filteredCount={filteredSessions.length}
          selection={selection}
          hasActiveSession={!isDemoSession}
          onSelect={handleSelectSession}
          onImportAsNewSession={handleImportAsNewSession}
          onImportIntoCurrentSession={handleImportIntoCurrentSession}
          onOpenViewer={() => setViewerOpen(true)}
        />
      </section>

      <AdvancedBundleDisclosure />

      {/* Tool inventory moved below sessions: it's reference material once
          the user is doing real work, so it folds away by default. */}
      <details className="connections-tools-disclosure mori-disclosure">
        <summary>
          <span>감지된 AI 도구 {detectedCount}개</span>
          <small>
            가져오기 지원 {importableCount}개
          </small>
        </summary>
        <div className="connections-tools-disclosure-body">
          <ToolGrid state={tools} />
        </div>
      </details>

      <ConversationViewer
        open={viewerOpen && Boolean(selection?.detail)}
        detail={selection?.detail ?? null}
        onClose={() => setViewerOpen(false)}
        onImportAsNewSession={handleImportAsNewSession}
        onImportIntoCurrentSession={handleImportIntoCurrentSession}
        hasActiveSession={!isDemoSession}
      />
    </PageShell>
  );
}

/**
 * Derive the session window for an imported Claude conversation. The start
 * is the session's recorded start; the end is the timestamp of the last
 * message that carries one. Both fall back to `capturedAt` so the window is
 * always valid even for sparse / tool-only sessions.
 */
function deriveConversationWindow(
  detail: ClaudeCodeSessionDetail,
  capturedAt: string,
): { startedAt: string; endedAt: string } {
  const startedAt = detail.startedAt?.trim() || capturedAt;
  let endedAt = startedAt;
  for (const message of detail.messages) {
    const stamp = message.createdAt?.trim();
    if (stamp) endedAt = stamp;
  }
  return { startedAt, endedAt };
}

// ─── Tool grid ────────────────────────────────────────────────────────────

function ToolGrid({ state }: { state: ToolsState }) {
  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="connections-tools-grid">
        {[0, 1, 2, 3].map((index) => (
          <article key={index} className="connections-tool-card connections-tool-card-skeleton">
            <div className="connections-tool-icon" />
            <div className="connections-tool-body">
              <div className="connections-tool-skel-line" />
              <div className="connections-tool-skel-line is-short" />
            </div>
          </article>
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <EmptyState
        compact
        tone="danger"
        icon={AlertCircle}
        title="도구 감지에 실패했습니다"
        description={state.error ?? "알 수 없는 오류"}
      />
    );
  }
  if (!state.report) return null;
  const ordered = orderToolsForDisplay(state.report.tools);
  // Split usable tools from reference-only ones. The reference cards used
  // to crowd the grid even though they have no action — collapsing them
  // into a single disclosure recovers a screen of vertical space while
  // keeping them discoverable for the curious.
  const primary = ordered.filter((tool) => tool.canImport || isDetectedTool(tool));
  const reference = ordered.filter((tool) => !tool.canImport && !isDetectedTool(tool));
  return (
    <>
      <div className="connections-tools-grid">
        {primary.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
      {reference.length > 0 ? (
        <details className="connections-tools-reference">
          <summary>
            <span>참조 도구 {reference.length}개</span>
            <small>이 도구들은 감지만 합니다 — 가져오기는 별도 패스에서 지원됩니다.</small>
          </summary>
          <div className="connections-tools-grid is-reference">
            {reference.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function isDetectedTool(tool: DetectedTool): boolean {
  return tool.status !== "not-found";
}

/**
 * Sort: detected & importable first, then merely detected, then not-found
 * at the bottom. Within each band keep the Rust-defined order so the row
 * structure is stable across reloads.
 */
function orderToolsForDisplay(tools: DetectedTool[]): DetectedTool[] {
  const score = (tool: DetectedTool) => {
    if (tool.canImport) return 0;
    if (tool.status === "data-found" || tool.status === "active") return 1;
    if (tool.status === "logs-only" || tool.status === "cache-only" || tool.status === "empty") {
      return 2;
    }
    return 3;
  };
  return [...tools].sort((a, b) => score(a) - score(b));
}

function ToolCard({ tool }: { tool: DetectedTool }) {
  const Icon = TOOL_ICONS[tool.id] ?? Bot;
  const tone = getToolStatusTone(tool.status);
  const isDetected = tool.status !== "not-found";
  return (
    <article
      className={`connections-tool-card connections-tool-tone-${tone}${
        isDetected ? "" : " is-undetected"
      }`}
      title={tool.path ?? undefined}
    >
      <span className={`connections-tool-icon connections-tool-icon-${tone}`}>
        <Icon size={18} />
      </span>
      <div className="connections-tool-body">
        <div className="connections-tool-head">
          <strong>{tool.label}</strong>
          <span className={`connections-tool-status connections-tool-status-${tone}`}>
            {getToolStatusLabel(tool.status)}
          </span>
          {tool.description || tool.notes || tool.path ? (
            <InfoHint align="end" label={`${tool.label} 세부`}>
              <span className="connections-tool-hint">
                <span>{tool.description}</span>
                {tool.path ? <code>{tool.path}</code> : null}
                {tool.notes ? <span>{tool.notes}</span> : null}
              </span>
            </InfoHint>
          ) : null}
        </div>
        <div className="connections-tool-footer">
          {tool.canImport ? (
            <Badge tone="green">가져오기 지원</Badge>
          ) : (
            <Badge tone="gray">참조용</Badge>
          )}
          {tool.sessionCount !== null ? (
            <Badge tone="purple">{tool.sessionCount}개 세션</Badge>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ─── Session feed ─────────────────────────────────────────────────────────

/**
 * A single-column feed of resumable AI work sessions, grouped by project.
 * Replaces the old list + separate inspector pane: each row is a compact card,
 * and selecting one expands it inline to show the conversation preview and the
 * import actions. The surface now reads as a feed of work to continue rather
 * than a file browser with a detail pane.
 */
function SessionFeed({
  state,
  grouped,
  hasQuery,
  filteredCount,
  selection,
  hasActiveSession,
  onSelect,
  onImportAsNewSession,
  onImportIntoCurrentSession,
  onOpenViewer,
}: {
  state: SessionsState;
  grouped: Array<[string, ClaudeCodeSessionMeta[]]>;
  hasQuery: boolean;
  filteredCount: number;
  selection: Selection;
  hasActiveSession: boolean;
  onSelect: (meta: ClaudeCodeSessionMeta) => void;
  onImportAsNewSession: () => void;
  onImportIntoCurrentSession: () => void;
  onOpenViewer: () => void;
}) {
  if (state.status === "loading" || state.status === "idle") {
    return <ListSkeleton label="Claude 세션을 검색하는 중..." />;
  }
  if (state.status === "error") {
    return (
      <EmptyState
        compact
        tone="danger"
        icon={AlertCircle}
        title="세션을 읽을 수 없습니다"
        description={state.error ?? "알 수 없는 오류"}
      />
    );
  }
  if (state.sessions.length === 0) {
    return (
      <EmptyState
        compact
        icon={Terminal}
        title="Claude 세션이 없습니다"
        description="Claude Desktop 또는 Claude Code를 한 번 이상 사용하면 ~/.claude/projects 아래에 세션 파일이 생성됩니다."
      />
    );
  }
  if (hasQuery && filteredCount === 0) {
    return (
      <EmptyState
        compact
        icon={Search}
        title="검색 결과가 없습니다"
        description="다른 키워드를 시도하거나 검색을 비워 모든 세션을 표시하세요."
      />
    );
  }
  return (
    <div className="connections-session-feed">
      {grouped.map(([projectName, projectSessions]) => (
        <section key={projectName} className="connections-feed-group">
          <header className="connections-feed-group-head">
            <FolderGit2 size={13} aria-hidden="true" />
            <strong title={projectName}>{projectName}</strong>
            <span>{projectSessions.length}</span>
          </header>
          <ul>
            {projectSessions.map((session) => (
              <li key={session.filePath}>
                <SessionCard
                  session={session}
                  selection={
                    selection?.filePath === session.filePath ? selection : null
                  }
                  hasActiveSession={hasActiveSession}
                  onSelect={() => onSelect(session)}
                  onImportAsNewSession={onImportAsNewSession}
                  onImportIntoCurrentSession={onImportIntoCurrentSession}
                  onOpenViewer={onOpenViewer}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * One resumable work session. Collapsed it shows the title and a compact meta
 * line (agent · message count · tokens · relative time). When it is the
 * selected card, `selection` is non-null and the card expands inline with the
 * conversation preview and the import actions.
 */
function SessionCard({
  session,
  selection,
  hasActiveSession,
  onSelect,
  onImportAsNewSession,
  onImportIntoCurrentSession,
  onOpenViewer,
}: {
  session: ClaudeCodeSessionMeta;
  selection: Selection;
  hasActiveSession: boolean;
  onSelect: () => void;
  onImportAsNewSession: () => void;
  onImportIntoCurrentSession: () => void;
  onOpenViewer: () => void;
}) {
  const expanded = selection !== null;
  // Hook order stays stable across collapsed/expanded — stats only do real work
  // for the one expanded card whose detail has loaded.
  const detailMessages =
    selection && !selection.loading && !selection.error
      ? selection.detail?.messages
      : undefined;
  const stats = useMemo(
    () => computeConversationStats(detailMessages ?? []),
    [detailMessages],
  );

  return (
    <article className={`connections-session-card${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="connections-session-card-head"
        aria-expanded={expanded}
        onClick={onSelect}
      >
        <span className="connections-session-card-title">{session.title}</span>
        <span className="connections-session-card-meta">
          <span className="connections-list-agent">
            <Sparkles size={11} aria-hidden="true" />
            Claude
          </span>
          <span>{session.messageCount}개 메시지</span>
          {session.tokenUsage && session.tokenUsage.totalTokens > 0 ? (
            <span className="connections-list-tokens">
              {formatTokenCount(session.tokenUsage.totalTokens)} 토큰
            </span>
          ) : null}
          <span>{formatClaudeRelativeKo(session.startedAt)}</span>
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className="connections-session-card-caret"
        />
      </button>
      {expanded ? (
        <div className="connections-session-card-detail">
          {selection.loading ? (
            <ListSkeleton label="세션 내용을 불러오는 중..." />
          ) : selection.error ? (
            <EmptyState
              compact
              tone="danger"
              icon={AlertCircle}
              title="세션을 열 수 없습니다"
              description={selection.error}
            />
          ) : selection.detail ? (
            <SessionCardDetail
              detail={selection.detail}
              stats={stats}
              hasActiveSession={hasActiveSession}
              onImportAsNewSession={onImportAsNewSession}
              onImportIntoCurrentSession={onImportIntoCurrentSession}
              onOpenViewer={onOpenViewer}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** The expanded body of a selected session card: stats, message preview, actions. */
function SessionCardDetail({
  detail,
  stats,
  hasActiveSession,
  onImportAsNewSession,
  onImportIntoCurrentSession,
  onOpenViewer,
}: {
  detail: ClaudeCodeSessionDetail;
  stats: ConversationStats;
  hasActiveSession: boolean;
  onImportAsNewSession: () => void;
  onImportIntoCurrentSession: () => void;
  onOpenViewer: () => void;
}) {
  const previewMessages = detail.messages.slice(0, 4);
  const remaining = detail.messages.length - previewMessages.length;
  return (
    <>
      <ul className="connections-session-stats" aria-label="대화 통계">
        <li>
          <strong>{stats.totalMessages}</strong>
          <small>메시지</small>
        </li>
        <li>
          <strong>{stats.humanMessages}</strong>
          <small>사용자</small>
        </li>
        <li>
          <strong>{stats.assistantMessages}</strong>
          <small>Claude</small>
        </li>
        <li>
          <strong>{stats.toolUses}</strong>
          <small>도구</small>
        </li>
        {stats.durationLabel ? (
          <li>
            <strong>{stats.durationLabel}</strong>
            <small>시간</small>
          </li>
        ) : null}
        {detail.tokenUsage && detail.tokenUsage.totalTokens > 0 ? (
          <li
            title={`입력 ${detail.tokenUsage.inputTokens.toLocaleString()} · 출력 ${detail.tokenUsage.outputTokens.toLocaleString()} 토큰${detail.tokenUsage.model ? ` · ${detail.tokenUsage.model}` : ""}`}
          >
            <strong>{formatTokenCount(detail.tokenUsage.totalTokens)}</strong>
            <small>토큰</small>
          </li>
        ) : null}
      </ul>

      {previewMessages.length === 0 ? (
        <p className="connections-session-empty-copy">
          이 세션에는 표시할 메시지가 없습니다.
        </p>
      ) : (
        <ol className="connections-session-messages">
          {previewMessages.map((message) => (
            <li key={message.id} className={`role-${message.role}`}>
              <span className="connections-session-role">
                {message.role === "human"
                  ? "사용자"
                  : message.role === "assistant"
                    ? "Claude"
                    : message.role}
              </span>
              <p>{shortMessagePreview(message.content, 200)}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="connections-session-actions">
        <Button
          variant="primary"
          icon={Sparkles}
          onClick={onImportAsNewSession}
          title="이 대화를 척추로 새 Mori 작업 세션을 만들고 Import Review로 이동합니다."
        >
          새 작업 세션으로 가져오기
        </Button>
        <Button
          variant="secondary"
          icon={Plus}
          onClick={onImportIntoCurrentSession}
          disabled={!hasActiveSession}
          title={
            hasActiveSession
              ? "이 대화를 현재 작업 세션의 증거로 합칩니다 (Import Review를 거칩니다)."
              : "현재 활성 세션이 없습니다. 새 작업 세션으로 가져오거나 세션을 먼저 시작하세요."
          }
        >
          현재 세션에 합치기
        </Button>
        <Button variant="ghost" icon={Maximize2} onClick={onOpenViewer}>
          {remaining > 0 ? `전체 보기 · +${remaining}` : "전체 보기"}
        </Button>
      </div>

      <HelpDisclosure label="가져오기 동작" ariaLabel="가져오기 동작 설명">
        <p>기본 동작은 대화마다 새 작업 세션을 만드는 것입니다 — Claude 대화 1개 = Mori 작업 세션 1개.</p>
        <p>
          가져온 항목은 Import Review에서 검토한 뒤 적용되고, 같은 세션에 Git · 터미널 · 파일
          자료를 더 붙일 수 있습니다.
        </p>
      </HelpDisclosure>
    </>
  );
}

/**
 * Browser-mode footnote. The Source Control Center above is now the canonical
 * source inventory (every paste path is usable here; desktop-only sources are
 * marked as such), so this is just one honest line about what the desktop app
 * adds — no competing hero, no duplicate tool cards, no flow explainer.
 */
function ConnectionsBrowserHelp() {
  return (
    <p className="connections-desktop-note">
      <Monitor size={14} aria-hidden="true" />
      <span>
        데스크톱 앱(Tauri)에서는 <code>~/.claude</code> · <code>~/.codex</code>에 저장된 대화
        파일을 자동으로 감지해 세션으로 가져옵니다. 브라우저에서는 위 소스 목록의 붙여넣기
        경로를 사용하세요.
      </span>
    </p>
  );
}

/**
 * Manual multi-source bundle, demoted to an advanced disclosure. Importing an
 * AI conversation (above) is the canonical way to start a work session; this is
 * the rarer fallback for hand-assembling a session from several pasted sources
 * (transcript + git + terminal + note) when no auto-detected conversation
 * exists. The engine and review-before-apply preview are unchanged — only its
 * prominence is.
 */
function AdvancedBundleDisclosure() {
  return (
    <details className="connections-advanced-disclosure mori-disclosure">
      <summary>
        <span>고급 · 여러 소스를 직접 묶어 한 세션으로</span>
        <small>자동 감지된 대화가 없을 때 transcript · git · 터미널 · 메모를 손으로 붙여 가져오기</small>
      </summary>
      <div className="connections-advanced-disclosure-body">
        <WorkBundlePanel />
      </div>
    </details>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="connections-empty connections-empty-inline">
      <RefreshCw size={16} aria-hidden="true" className="connections-spin" />
      <p>{label}</p>
    </div>
  );
}
