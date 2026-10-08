import { useLayoutEffect, useRef, useState } from "react";
import { ChevronUp, FileWarning, Loader2, RotateCw } from "lucide-react";
import { useSessionStore } from "../../app/sessionStore";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { EmptyState } from "../../components/layout/EmptyState";
import type { ClaudeMessage } from "../../lib/claude/types";
import {
  loadedPercent,
  type SessionWindowError,
  type SessionWindowState,
} from "../../lib/session/sessionWindow";
import { useSessionResolver } from "./useSessionResolver";

/** Characters of a message shown before it folds; keeps a long window's DOM small. */
const CLIP_CHARS = 700;
const TOOL_CLIP_CHARS = 160;

/**
 * The conversation of a transcript too long to import, read from its end.
 *
 * Read-only and partial by construction: it shows what was read, says that it
 * is part of the session, and reaches back on request. Analysis, report and
 * import stay out of reach here because they would treat this part as the
 * whole session.
 */
export function SessionSourceWindow({ state }: { state: SessionWindowState }) {
  if (state.status === "loading") {
    return (
      <div className="session-window-status" role="status" aria-live="polite">
        <Loader2 className="session-window-spin" size={18} aria-hidden="true" />
        <span>대화를 읽는 중…</span>
      </div>
    );
  }
  if (state.status === "error") return <SessionWindowFailure sessionId={state.sessionId} error={state.error} />;
  return <SessionWindowConversation state={state} />;
}

function SessionWindowFailure({ sessionId, error }: { sessionId: string; error: SessionWindowError }) {
  const resolveSession = useSessionResolver();
  const [retrying, setRetrying] = useState(false);
  const copy = FAILURE_COPY[error.kind];
  return (
    <EmptyState
      icon={FileWarning}
      tone="danger"
      title={copy.title}
      description={copy.description}
      actions={
        error.kind === "unavailable" ? undefined : (
          <Button
            icon={RotateCw}
            size="sm"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              void resolveSession(sessionId).finally(() => setRetrying(false));
            }}
          >
            다시 시도
          </Button>
        )
      }
    />
  );
}

const FAILURE_COPY: Record<SessionWindowError["kind"], { title: string; description: string }> = {
  missing: {
    title: "원본 대화를 찾을 수 없습니다",
    description: "파일이 이동했거나 삭제되었을 수 있습니다.",
  },
  changed: {
    title: "원본 대화가 바뀌었습니다",
    description: "읽는 동안 파일이 교체되었습니다. 다시 열면 최신 내용을 읽습니다.",
  },
  unavailable: {
    title: "데스크톱 앱에서만 열 수 있습니다",
    description: "브라우저에서는 원본 대화 파일을 읽을 수 없습니다.",
  },
  refused: {
    title: "이 파일은 열 수 없습니다",
    description: "에이전트 기록 폴더 밖이거나 대화 형식이 아닙니다.",
  },
  error: {
    title: "대화를 읽지 못했습니다",
    description: "잠시 후 다시 시도해 주세요.",
  },
};

type LoadedState = Extract<SessionWindowState, { status: "partial" | "full" }>;

function SessionWindowConversation({ state }: { state: LoadedState }) {
  const loadEarlier = useSessionStore((store) => store.loadEarlierSessionWindow);
  const resolveSession = useSessionResolver();
  const listRef = useRef<HTMLDivElement>(null);
  // Distance from the bottom before an earlier window is prepended, so the
  // message the user was reading stays where it was.
  const anchorFromBottom = useRef<number | null>(null);
  const firstPaint = useRef(true);

  useLayoutEffect(() => {
    const scroller = listRef.current?.closest(".page-shell-scroll");
    if (!scroller) return;
    if (firstPaint.current) {
      // Recent work first: open at the latest message.
      firstPaint.current = false;
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    if (anchorFromBottom.current !== null) {
      scroller.scrollTop = scroller.scrollHeight - anchorFromBottom.current;
      anchorFromBottom.current = null;
    }
  }, [state.startOffset]);

  const requestEarlier = () => {
    const scroller = listRef.current?.closest(".page-shell-scroll");
    if (scroller) anchorFromBottom.current = scroller.scrollHeight - scroller.scrollTop;
    void loadEarlier();
  };

  const partial = state.status === "partial";
  return (
    <section className="session-window" aria-label="원본 대화" ref={listRef}>
      <header className="session-window-head">
        <span className="session-window-coverage">
          {partial ? "최근 대화 일부 표시 중" : "대화 전체 표시 중"}
          <InfoHint label="표시 범위">
            이 대화는 한 번에 가져오기에 길어서 끝에서부터 나눠 읽습니다. 표시된 메시지 수는 읽은 부분의
            수입니다. 분석과 보고서는 전체를 가져온 세션에서만 제공합니다.
          </InfoHint>
        </span>
        <span className="session-window-meta">
          메시지 {state.events.length.toLocaleString("ko-KR")}개
          {partial ? ` · 원본의 약 ${loadedPercent(state)}%` : ""}
        </span>
      </header>

      {partial ? (
        <div className="session-window-earlier">
          {state.earlierError ? (
            <EarlierFailure error={state.earlierError} onRetry={requestEarlier} onReopen={() => void resolveSession(state.sessionId)} />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon={state.loadingEarlier ? Loader2 : ChevronUp}
              className={state.loadingEarlier ? "is-loading" : undefined}
              disabled={state.loadingEarlier}
              onClick={requestEarlier}
            >
              {state.loadingEarlier ? "이전 대화 읽는 중…" : "이전 대화 더 보기"}
            </Button>
          )}
        </div>
      ) : (
        <p className="session-window-start">대화의 시작</p>
      )}

      {state.omittedRecords > 0 ? (
        <p className="session-window-omitted">
          너무 큰 기록 {state.omittedRecords}개는 표시하지 않았습니다 ({formatBytes(state.omittedBytes)})
        </p>
      ) : null}

      {state.events.length === 0 ? (
        <p className="session-window-empty">이 구간에는 표시할 메시지가 없습니다.</p>
      ) : (
        <ol className="session-window-list">
          {state.events.map((message) => (
            <WindowMessage key={message.id} message={message} />
          ))}
        </ol>
      )}
    </section>
  );
}

function EarlierFailure({
  error,
  onRetry,
  onReopen,
}: {
  error: SessionWindowError;
  onRetry: () => void;
  onReopen: () => void;
}) {
  if (error.kind === "changed") {
    return (
      <p className="session-window-earlier-error" role="alert">
        원본 대화가 바뀌어 이전 부분을 이어 읽을 수 없습니다.
        <Button size="sm" variant="ghost" icon={RotateCw} onClick={onReopen}>
          최신 대화로 다시 열기
        </Button>
      </p>
    );
  }
  return (
    <p className="session-window-earlier-error" role="alert">
      이전 대화를 읽지 못했습니다.
      <Button size="sm" variant="ghost" icon={RotateCw} onClick={onRetry}>
        다시 시도
      </Button>
    </p>
  );
}

function WindowMessage({ message }: { message: ClaudeMessage }) {
  const [open, setOpen] = useState(false);
  const kind = messageKind(message);
  const limit = kind === "tool" ? TOOL_CLIP_CHARS : CLIP_CHARS;
  const long = message.content.length > limit;
  const text = open || !long ? message.content : `${message.content.slice(0, limit)}…`;
  return (
    <li className={`session-window-message is-${kind}`}>
      <div className="session-window-message-head">
        <span className="session-window-role">{ROLE_LABEL[kind]}</span>
        {message.createdAt ? <time dateTime={message.createdAt}>{clockLabel(message.createdAt)}</time> : null}
      </div>
      <p className="session-window-text">{text}</p>
      {long ? (
        <button type="button" className="session-window-fold" onClick={() => setOpen((value) => !value)}>
          {open ? "접기" : "펼치기"}
        </button>
      ) : null}
    </li>
  );
}

type MessageKind = "user" | "assistant" | "tool" | "system";

const ROLE_LABEL: Record<MessageKind, string> = {
  user: "나",
  assistant: "Claude",
  tool: "도구",
  system: "시스템",
};

function messageKind(message: ClaudeMessage): MessageKind {
  if (message.subkind === "tool_result" || message.subkind === "tool_use") return "tool";
  if (message.role === "human") return "user";
  if (message.role === "assistant") return "assistant";
  return "system";
}

function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
