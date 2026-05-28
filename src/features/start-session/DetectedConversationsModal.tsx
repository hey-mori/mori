import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Clock,
  Code2,
  Cpu,
  FolderGit2,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import {
  discoverClaudeCodeSessions,
  formatClaudeRelativeKo,
  getClaudeCodeSession,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import type {
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
  ClaudeMessage,
} from "../../lib/claude/types";

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

/** A real user turn — excludes tool-result envelopes that arrive as `human`. */
function isUserTurn(message: ClaudeMessage): boolean {
  return message.role === "human" && message.subkind !== "tool_result";
}

/** A real assistant turn — excludes tool-call envelopes. */
function isReplyTurn(message: ClaudeMessage): boolean {
  return message.role === "assistant" && message.subkind !== "tool_use";
}

function oneLine(content: string, max: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export function DetectedConversationsModal({
  agentName,
  supported,
  initialSelectedFilePath,
  onPick,
  onClose,
}: {
  agentName: string;
  supported: boolean;
  initialSelectedFilePath: string | null;
  onPick: (meta: ClaudeCodeSessionMeta) => void;
  onClose: () => void;
}) {
  const bridge = isClaudeBridgeAvailable();
  const [sessions, setSessions] = useState<ClaudeCodeSessionMeta[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [query, setQuery] = useState("");
  const [activePath, setActivePath] = useState<string | null>(initialSelectedFilePath);
  const [detail, setDetail] = useState<ClaudeCodeSessionDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const load = useCallback(async () => {
    if (!bridge || !supported) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      setSessions(await discoverClaudeCodeSessions());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [bridge, supported]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes the modal from anywhere.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Load the highlighted conversation's content for the preview pane.
  useEffect(() => {
    if (!activePath) {
      setDetail(null);
      setDetailStatus("idle");
      return;
    }
    let cancelled = false;
    setDetailStatus("loading");
    getClaudeCodeSession(activePath)
      .then((loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        setDetailStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setDetailStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [activePath]);

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
    const map = new Map<string, ClaudeCodeSessionMeta[]>();
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
        className="detected-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${agentName} 작업 대화 둘러보기`}
      >
        <header className="detected-modal-head">
          <h2>기록에서 불러오기</h2>
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
                activePath={activePath}
                onActivate={setActivePath}
              />
            </div>
          </div>

          <div className="detected-modal-preview">
            <ConversationPreview
              agentName={agentName}
              hasSelection={Boolean(activeMeta)}
              status={detailStatus}
              detail={detail}
            />
          </div>
        </div>

        <footer className="detected-modal-foot">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!activeMeta} onClick={confirm}>
            이 대화로 진행
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
  activePath,
  onActivate,
}: {
  agentName: string;
  supported: boolean;
  bridge: boolean;
  status: "idle" | "loading" | "ready" | "error";
  sessionCount: number;
  grouped: [string, ClaudeCodeSessionMeta[]][];
  activePath: string | null;
  onActivate: (filePath: string) => void;
}) {
  if (!supported) {
    return <p className="start-import-note">{agentName} 작업 기록 자동 감지는 준비 중입니다.</p>;
  }
  if (!bridge) {
    return (
      <p className="start-import-note">
        데스크톱 앱에서 {agentName} 작업 기록을 자동으로 감지합니다. 브라우저에서는 붙여넣기를
        사용하세요.
      </p>
    );
  }
  if (status === "loading" || status === "idle") {
    return (
      <p className="start-import-note">
        <RefreshCw size={14} aria-hidden="true" className="start-import-spin" /> 작업 기록을 불러오는 중...
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="start-import-note">
        <AlertCircle size={14} aria-hidden="true" /> 작업 기록을 읽지 못했습니다.
      </p>
    );
  }
  if (sessionCount === 0) {
    return <p className="start-import-note">감지된 대화가 없습니다.</p>;
  }
  if (grouped.length === 0) {
    return <p className="start-import-note">검색 결과가 없습니다.</p>;
  }

  return (
    <div className="start-detected" role="radiogroup" aria-label="불러올 대화">
      {grouped.map(([project, projectSessions]) => (
        <section key={project} className="start-detected-group">
          <header className="start-detected-group-head">
            <FolderGit2 size={13} aria-hidden="true" />
            <strong title={project}>{shortProjectLabel(project)}</strong>
            <span>{projectSessions.length}</span>
          </header>
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
                    onClick={() => onActivate(session.filePath)}
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
        </section>
      ))}
    </div>
  );
}

function ConversationPreview({
  agentName,
  hasSelection,
  status,
  detail,
}: {
  agentName: string;
  hasSelection: boolean;
  status: "idle" | "loading" | "ready" | "error";
  detail: ClaudeCodeSessionDetail | null;
}) {
  if (!hasSelection) {
    return (
      <div className="detected-preview-empty">
        <MessageSquare size={24} aria-hidden="true" />
      </div>
    );
  }
  if (status === "loading" || status === "idle") {
    return (
      <div className="detected-preview-empty">
        <RefreshCw size={20} aria-hidden="true" className="start-import-spin" />
        <p>대화를 불러오는 중...</p>
      </div>
    );
  }
  if (status === "error" || !detail) {
    return (
      <div className="detected-preview-empty">
        <AlertCircle size={20} aria-hidden="true" />
        <p>대화를 불러오지 못했습니다.</p>
      </div>
    );
  }

  const firstAsk = detail.messages.find(isUserTurn)?.content ?? null;
  const turns = detail.messages.filter((message) => isUserTurn(message) || isReplyTurn(message));
  const previewTurns = turns.slice(0, 6);
  const codeBlocks = detail.messages.filter((message) => message.content.includes("```")).length;
  const lastStamp = [...detail.messages].reverse().find((message) => message.createdAt)?.createdAt;
  const model = detail.tokenUsage?.model;

  return (
    <div className="detected-preview">
      <header className="detected-preview-head">
        <h3>{detail.title}</h3>
        <p className="detected-preview-project" title={detail.projectPath}>
          <FolderGit2 size={12} aria-hidden="true" /> {shortProjectLabel(detail.projectName)}
        </p>
      </header>

      <div className="detected-preview-stats">
        <span>
          <MessageSquare size={12} aria-hidden="true" /> 메시지 {detail.messageCount}
        </span>
        <span>
          <Clock size={12} aria-hidden="true" /> {formatClaudeRelativeKo(detail.startedAt)}
          {lastStamp && lastStamp !== detail.startedAt ? ` ~ ${formatClaudeRelativeKo(lastStamp)}` : ""}
        </span>
        {codeBlocks > 0 ? (
          <span>
            <Code2 size={12} aria-hidden="true" /> 코드블록 {codeBlocks}
          </span>
        ) : null}
        {model ? (
          <span>
            <Cpu size={12} aria-hidden="true" /> {model}
          </span>
        ) : null}
      </div>

      {firstAsk ? (
        <section className="detected-preview-ask">
          <h4>첫 요청</h4>
          <p>{oneLine(firstAsk, 360)}</p>
        </section>
      ) : null}

      {previewTurns.length > 0 ? (
        <section className="detected-preview-thread">
          <h4>대화 미리보기</h4>
          <ul>
            {previewTurns.map((message, index) => {
              const mine = isUserTurn(message);
              return (
                <li key={message.id || index} className={mine ? "is-user" : "is-reply"}>
                  <span className="detected-preview-role">{mine ? "나" : agentName}</span>
                  <span className="detected-preview-text">{oneLine(message.content, 160)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
