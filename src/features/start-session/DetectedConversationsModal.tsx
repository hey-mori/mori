import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { focusFirstElement, trapTabKey } from "../../components/ui/focusTrap";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import {
  formatClaudeRelativeKo,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import {
  listAgentWorkSessions,
  type AgentWorkAgentId,
  type AgentWorkSessionMeta,
} from "../../lib/trace/sources/ai/workSessions";

/**
 * 작업 대화 둘러보기 — a two-pane modal for browsing an agent's detected work
 * conversations *and seeing what each one was about* before turning it into a
 * Mori session. The left pane is the searchable, recency-sorted, project-grouped
 * list; the right pane previews the highlighted conversation's content (the
 * opening ask, a few turns, scale + window) by loading its detail on demand.
 *
 * Detection is desktop-only and real for Claude today. In the browser, or for
 * an agent without detection, the list pane states the honest reason instead of
 * faking a list. Confirming a conversation lifts the choice to the caller; the
 * session is created through the normal 세션 생성 flow, so the project / name
 * step is preserved.
 */

const time = (value?: string) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Centre a list-pane state (spinner / empty / error) both ways. */
const LIST_STATE_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 240,
  height: "100%",
  padding: 24,
  textAlign: "center",
};

export function DetectedConversationsModal({
  agentName,
  agentId,
  supported,
  initialSelectedFilePath,
  onPick,
  onClose,
}: {
  agentName: string;
  agentId: AgentWorkAgentId;
  supported: boolean;
  initialSelectedFilePath: string | null;
  onPick: (meta: AgentWorkSessionMeta) => void;
  onClose: () => void;
}) {
  const bridge = isClaudeBridgeAvailable();
  const [sessions, setSessions] = useState<AgentWorkSessionMeta[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [query, setQuery] = useState("");
  const [activePath, setActivePath] = useState<string | null>(initialSelectedFilePath);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!bridge || !supported) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      setSessions(await listAgentWorkSessions(agentId));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [agentId, bridge, supported]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes the modal; Tab is trapped inside it. Focus the first
  // focusable element on mount so the modal is immediately keyboard-actionable,
  // matching SettingsSheet.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      trapTabKey(event, dialogRef.current);
    }
    document.addEventListener("keydown", onKey);
    const raf = window.requestAnimationFrame(() => focusFirstElement(dialogRef.current));
    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(q) ||
        session.projectName.toLowerCase().includes(q),
    );
  }, [sessions, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, AgentWorkSessionMeta[]>();
    for (const session of filtered) {
      const list = map.get(session.projectName) ?? [];
      list.push(session);
      map.set(session.projectName, list);
    }
    for (const list of map.values()) list.sort((a, b) => time(b.startedAt) - time(a.startedAt));
    return [...map.entries()].sort((a, b) => time(b[1][0]?.startedAt) - time(a[1][0]?.startedAt));
  }, [filtered]);

  const activeMeta = sessions.find((session) => session.filePath === activePath) ?? null;

  function confirm() {
    if (!activeMeta) return;
    onPick(activeMeta);
    onClose();
  }

  return createPortal(
    <div
      className="detected-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="detected-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detected-modal-title"
        tabIndex={-1}
      >
        <header className="detected-modal-head">
          <h2 id="detected-modal-title">기록에서 불러오기</h2>
          <button type="button" className="detected-modal-close" onClick={onClose} aria-label="닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="detected-modal-body">
          <div className="detected-modal-list">
            <div className="detected-modal-search-row">
              <div className="start-detected-search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  placeholder=""
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="대화 검색"
                />
              </div>
              <button
                type="button"
                className="start-detected-refresh"
                onClick={() => void load()}
                title="새로고침"
                aria-label="새로고침"
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </div>

            <div className="detected-modal-scroll">
              <ConversationList
                agentName={agentName}
                supported={supported}
                bridge={bridge}
                status={status}
                sessionCount={sessions.length}
                grouped={grouped}
                searchActive={query.trim().length > 0}
                activePath={activePath}
                onActivate={setActivePath}
              />
            </div>
          </div>

          <div className="detected-modal-preview">
            <ConversationPreview
              session={activeMeta}
            />
          </div>
        </div>

        <footer className="detected-modal-foot">
          <Button variant="primary" disabled={!activeMeta} onClick={confirm}>
            불러오기
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function ConversationList({
  agentName,
  supported,
  bridge,
  status,
  sessionCount,
  grouped,
  searchActive,
  activePath,
  onActivate,
}: {
  agentName: string;
  supported: boolean;
  bridge: boolean;
  status: "idle" | "loading" | "ready" | "error";
  sessionCount: number;
  grouped: [string, AgentWorkSessionMeta[]][];
  searchActive: boolean;
  activePath: string | null;
  onActivate: (filePath: string | null) => void;
}) {
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => new Set());
  const activeProject = useMemo(() => {
    if (!activePath) return null;
    return grouped.find(([, sessions]) =>
      sessions.some((session) => session.filePath === activePath),
    )?.[0] ?? null;
  }, [activePath, grouped]);

  useEffect(() => {
    if (!activeProject) return;
    setOpenProjects((current) => {
      if (current.has(activeProject)) return current;
      const next = new Set(current);
      next.add(activeProject);
      return next;
    });
  }, [activeProject]);

  function toggleProject(project: string) {
    setOpenProjects((current) => {
      const next = new Set(current);
      if (next.has(project)) {
        next.delete(project);
      } else {
        next.add(project);
      }
      return next;
    });
  }

  // Non-list states (loading / empty / error / unsupported) render centred
  // both ways inside the list pane. Inline-styled so they don't depend on a
  // CSS file the autonomous loop is rewriting.
  let state: ReactNode = null;
  if (!supported) {
    state = <p className="start-import-note">{agentName} 작업 기록 자동 감지는 준비 중입니다.</p>;
  } else if (!bridge) {
    state = (
      <p className="start-import-note">
        데스크톱 앱에서 {agentName} 작업 기록을 자동으로 감지합니다. 브라우저에서는 붙여넣기를
        사용하세요.
      </p>
    );
  } else if (status === "loading" || status === "idle") {
    state = (
      <>
        <RefreshCw size={22} aria-hidden="true" className="start-import-spin" />
        <p className="start-import-note" style={{ margin: 0 }}>작업 기록을 불러오는 중...</p>
      </>
    );
  } else if (status === "error") {
    state = (
      <>
        <AlertCircle size={20} aria-hidden="true" />
        <p className="start-import-note" style={{ margin: 0 }}>작업 기록을 읽지 못했습니다.</p>
      </>
    );
  } else if (sessionCount === 0) {
    state = <p className="start-import-note">감지된 대화가 없습니다.</p>;
  } else if (grouped.length === 0) {
    state = <p className="start-import-note">검색 결과가 없습니다.</p>;
  }

  if (state) {
    return <div style={LIST_STATE_STYLE}>{state}</div>;
  }

  return (
    <div className="start-detected" role="radiogroup" aria-label="불러올 대화">
      {grouped.map(([project, projectSessions]) => {
        const open = searchActive || openProjects.has(project) || activeProject === project;
        const ToggleIcon = open ? ChevronDown : ChevronRight;
        const latest = projectSessions[0]?.startedAt;
        return (
          <section key={project} className={`start-detected-group${open ? " is-open" : ""}`}>
            <button
              type="button"
              className="start-detected-group-head"
              aria-expanded={open}
              onClick={() => toggleProject(project)}
            >
              <ToggleIcon className="start-detected-group-toggle" size={13} aria-hidden="true" />
              <FolderGit2 size={13} aria-hidden="true" />
              <strong title={project}>{shortProjectLabel(project)}</strong>
              <span className="start-detected-group-meta">
                <span>{projectSessions.length}건</span>
                {latest ? <span>{formatClaudeRelativeKo(latest)}</span> : null}
              </span>
            </button>
            {open ? (
              <ul>
                {projectSessions.map((session) => {
                  const selected = activePath === session.filePath;
                  return (
                    <li key={session.filePath}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`start-detected-row${selected ? " is-selected" : ""}`}
                        onClick={() => onActivate(selected ? null : session.filePath)}
                      >
                        <span className="start-detected-main">
                          <strong>{session.title}</strong>
                          <span className="start-detected-meta">
                            메시지 {session.messageCount} · {formatClaudeRelativeKo(session.startedAt)}
                          </span>
                        </span>
                        <span
                          className={`pick-mark${selected ? " is-selected" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ConversationPreview({ session }: { session: AgentWorkSessionMeta | null }) {
  if (!session) {
    return (
      <div className="detected-preview-empty">
        <MessageSquare size={24} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="detected-preview">
      <header className="detected-preview-head">
        <h3>{session.title}</h3>
        <p className="detected-preview-project" title={session.projectPath}>
          <FolderGit2 size={12} aria-hidden="true" /> {shortProjectLabel(session.projectName)}
        </p>
      </header>

      <div className="detected-preview-stats">
        <span>
          <MessageSquare size={12} aria-hidden="true" /> 메시지 {session.messageCount}
        </span>
        <span>
          <Clock size={12} aria-hidden="true" /> {formatClaudeRelativeKo(session.startedAt)}
        </span>
      </div>
    </div>
  );
}
