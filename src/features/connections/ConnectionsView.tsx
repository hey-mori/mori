import {
  AlertCircle,
  Bot,
  Boxes,
  Chrome,
  Code2,
  HardDrive,
  KeyRound,
  Layers,
  Link2,
  Maximize2,
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
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { HelpDisclosure } from "../../components/layout/HelpDisclosure";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { PageShell } from "../../components/layout/PageShell";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { useMoriReviewStore } from "../../app/reviewStore";
import {
  discoverClaudeCodeSessions,
  formatClaudeTimestamp,
  getClaudeCodeSession,
  isClaudeBridgeAvailable,
  shortMessagePreview,
} from "../../lib/claude/claudeTauri";
import { buildImportCandidateFromClaudeCodeSession } from "../../lib/claude/claudeImport";
import {
  computeConversationStats,
  formatTokenCount,
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
import { ConversationViewer } from "./ConversationViewer";

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
  const isDemoSession = !draft;

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

  if (!bridgeAvailable) {
    return (
      <PageShell
        className="connections-page"
        actionBar={
          <ActionBar label="연결" title="연결" />
        }
      >
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
      actionBar={
        <ActionBar
          label="연결"
          title="연결"
          start={
            <>
              {tools.report ? (
                <>
                  <Badge tone={importableCount > 0 ? "green" : "gray"}>
                    {detectedCount}개 감지 · {importableCount}개 가져오기 가능
                  </Badge>
                  <HelpDisclosure label="가져올 수 있는 도구" ariaLabel="가져오기 정책 설명">
                    <p>
                      데이터가 PC에 로컬로 저장되는 도구만 가져올 수 있습니다 (Claude Desktop ·
                      Claude Code 등).
                    </p>
                    <p>
                      claude.ai 웹 채팅은 Anthropic 서버에 저장되므로 직접 가져올 수 없습니다. 필요하면
                      증거 허브에서 대화를 직접 붙여넣으세요.
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

      <section className="connections-section">
        <header className="connections-section-header">
          <div>
            <h2>감지된 AI 도구</h2>
          </div>
        </header>
        <ToolGrid state={tools} />
      </section>

      <section className="connections-section">
        <header className="connections-section-header">
          <div>
            <h2>Claude 세션</h2>
          </div>
          <Badge tone={sessions.sessions.length > 0 ? "purple" : "gray"}>
            {sessions.sessions.length}개 세션
          </Badge>
        </header>

        <div className="connections-sessions-toolbar">
          <label className="connections-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목 또는 프로젝트 경로로 검색"
              aria-label="Claude 세션 검색"
            />
          </label>
          {query && filteredSessions.length < sessions.sessions.length ? (
            <small className="connections-search-meta">
              {filteredSessions.length} / {sessions.sessions.length}개 표시
            </small>
          ) : null}
        </div>

        <div className="connections-sessions-layout">
          <div className="connections-sessions-list">
            <SessionsList
              state={sessions}
              grouped={grouped}
              hasQuery={query.trim().length > 0}
              filteredCount={filteredSessions.length}
              selectedPath={selection?.filePath ?? null}
              onSelect={handleSelectSession}
            />
          </div>
          <PreviewPanel
            selection={selection}
            hasActiveSession={!isDemoSession}
            onImportAsNewSession={handleImportAsNewSession}
            onImportIntoCurrentSession={handleImportIntoCurrentSession}
            onOpenViewer={() => setViewerOpen(true)}
          />
        </div>
      </section>

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
  return (
    <div className="connections-tools-grid">
      {ordered.map((tool) => (
        <ToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
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
        </div>
        <p className="connections-tool-description">{tool.description}</p>
        {tool.path ? (
          <code className="connections-tool-path" title={tool.path}>
            {tool.path}
          </code>
        ) : null}
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
        {tool.notes ? <p className="connections-tool-notes">{tool.notes}</p> : null}
      </div>
    </article>
  );
}

// ─── Sessions list ────────────────────────────────────────────────────────

function SessionsList({
  state,
  grouped,
  hasQuery,
  filteredCount,
  selectedPath,
  onSelect,
}: {
  state: SessionsState;
  grouped: Array<[string, ClaudeCodeSessionMeta[]]>;
  hasQuery: boolean;
  filteredCount: number;
  selectedPath: string | null;
  onSelect: (meta: ClaudeCodeSessionMeta) => void;
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
    <ul className="connections-list-items">
      {grouped.map(([projectName, sessions]) => (
        <li key={projectName} className="connections-list-group">
          <strong className="connections-list-group-label" title={projectName}>
            {projectName}
          </strong>
          <ul>
            {sessions.map((session) => {
              const active = session.filePath === selectedPath;
              return (
                <li key={session.filePath}>
                  <button
                    type="button"
                    className={`connections-list-item${active ? " is-active" : ""}`}
                    onClick={() => onSelect(session)}
                    aria-pressed={active}
                  >
                    <span className="connections-list-title">{session.title}</span>
                    <span className="connections-list-meta">
                      <Badge tone="purple">{session.messageCount}개 메시지</Badge>
                      {session.tokenUsage && session.tokenUsage.totalTokens > 0 ? (
                        <small className="connections-list-tokens">
                          {formatTokenCount(session.tokenUsage.totalTokens)} 토큰
                        </small>
                      ) : null}
                      <small>{formatClaudeTimestamp(session.startedAt)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

// ─── Preview pane ─────────────────────────────────────────────────────────

function PreviewPanel({
  selection,
  hasActiveSession,
  onImportAsNewSession,
  onImportIntoCurrentSession,
  onOpenViewer,
}: {
  selection: Selection;
  hasActiveSession: boolean;
  onImportAsNewSession: () => void;
  onImportIntoCurrentSession: () => void;
  onOpenViewer: () => void;
}) {
  if (!selection) {
    return (
      <InspectorPanel ariaLabel="세션 미리보기">
        <EmptyState
          compact
          icon={HardDrive}
          title="세션을 선택하세요"
          description="왼쪽에서 세션을 선택하면 미리보기와 가져오기가 표시됩니다."
        />
      </InspectorPanel>
    );
  }
  if (selection.loading) {
    return (
      <InspectorPanel ariaLabel="세션 미리보기">
        <ListSkeleton label="세션 내용을 불러오는 중..." />
      </InspectorPanel>
    );
  }
  if (selection.error) {
    return (
      <InspectorPanel ariaLabel="세션 미리보기">
        <EmptyState
          compact
          tone="danger"
          icon={AlertCircle}
          title="세션을 열 수 없습니다"
          description={selection.error}
        />
      </InspectorPanel>
    );
  }
  if (!selection.detail) return null;

  const detail = selection.detail;
  const previewMessages = detail.messages.slice(0, 12);
  const stats = computeConversationStats(detail.messages);

  return (
    <InspectorPanel
      ariaLabel="세션 미리보기"
      title={detail.title}
      subtitle={`Claude (Desktop · Code) · ${detail.projectName || "프로젝트 미지정"}`}
      headerExtras={
        <Button variant="secondary" icon={Maximize2} onClick={onOpenViewer}>
          전체 보기
        </Button>
      }
      footer={
        <>
          <div className="connections-preview-actions">
            <Button
              variant="primary"
              icon={Sparkles}
              onClick={onImportAsNewSession}
              title="이 대화를 위한 새 Mori 세션을 만들고 Import Review로 이동합니다."
            >
              새 세션으로 가져오기
            </Button>
            <Button
              variant="secondary"
              icon={Plus}
              onClick={onImportIntoCurrentSession}
              disabled={!hasActiveSession}
              title={
                hasActiveSession
                  ? "이 대화를 현재 활성 세션의 Import Review로 보냅니다."
                  : "현재 활성 세션이 없습니다. 새 세션으로 가져오거나 세션을 먼저 시작하세요."
              }
            >
              현재 세션에 추가
            </Button>
          </div>
          <HelpDisclosure label="가져오기 동작" ariaLabel="가져오기 동작 설명">
            <p>기본 동작은 대화마다 새 세션을 만드는 것입니다 (Claude 대화 1개 = Mori 세션 1개).</p>
            <p>가져온 항목은 Import Review에서 검토한 뒤 적용됩니다.</p>
          </HelpDisclosure>
        </>
      }
    >
      <ul className="connections-preview-stat-row" aria-label="대화 통계">
        <li>
          <strong>{stats.totalMessages}</strong>
          <small>메시지</small>
        </li>
        <li>
          <strong>{stats.humanMessages}</strong>
          <small>사용자 발화</small>
        </li>
        <li>
          <strong>{stats.assistantMessages}</strong>
          <small>Claude 응답</small>
        </li>
        <li>
          <strong>{stats.toolUses}</strong>
          <small>도구 호출</small>
        </li>
        {stats.durationLabel ? (
          <li>
            <strong>{stats.durationLabel}</strong>
            <small>소요 시간</small>
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
      <dl className="connections-preview-meta">
        <div>
          <dt>시작</dt>
          <dd>{formatClaudeTimestamp(detail.startedAt)}</dd>
        </div>
        <div>
          <dt>출처</dt>
          <dd>Claude (Desktop · Code)</dd>
        </div>
      </dl>
      <details className="connections-preview-pathbox">
        <summary>파일 경로 보기</summary>
        <code>{detail.filePath}</code>
      </details>

      {previewMessages.length === 0 ? (
        <p className="connections-preview-empty-copy">
          이 세션에는 표시할 메시지가 없습니다.
        </p>
      ) : (
        <>
          <ol className="connections-preview-messages">
            {previewMessages.map((message) => (
              <li key={message.id} className={`role-${message.role}`}>
                <span className="connections-preview-role">
                  {message.role === "human"
                    ? "사용자"
                    : message.role === "assistant"
                      ? "Claude"
                      : message.role}
                </span>
                <p>{shortMessagePreview(message.content, 280)}</p>
              </li>
            ))}
          </ol>
          {detail.messages.length > previewMessages.length ? (
            <button
              type="button"
              className="connections-preview-show-all"
              onClick={onOpenViewer}
            >
              + {detail.messages.length - previewMessages.length}개 메시지 전체 보기
            </button>
          ) : null}
        </>
      )}
    </InspectorPanel>
  );
}

// ─── small subcomponents ──────────────────────────────────────────────────

function ConnectionsBrowserHelp() {
  return (
    <EmptyState
      icon={Link2}
      title="데스크탑 앱에서만 사용할 수 있는 기능입니다"
      description="연결 기능은 PC에 저장된 Claude / Codex 파일을 감지합니다. 브라우저 프리뷰에서는 접근할 수 없으니 데스크탑 앱(Tauri)을 실행하세요."
    />
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
