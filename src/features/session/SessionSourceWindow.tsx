import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronsDown, ChevronUp, FileWarning, Loader2, RotateCw } from "lucide-react";
import { useSessionStore } from "../../app/sessionStore";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { EmptyState } from "../../components/layout/EmptyState";
import type { ClaudeMessage } from "../../lib/claude/types";
import {
  coverageLabel,
  MAX_RETAINED_WINDOWS,
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
  // One conversation per session view: refs (reading anchor, first scroll)
  // never carry from one session or open to the next.
  return <SessionWindowConversation key={`${state.sessionId}:${state.openToken}`} state={state} />;
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
        error.kind === "unavailable" || error.kind === "tooLarge" ? undefined : (
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
  tooLarge: {
    title: "아직 열 수 없는 긴 대화입니다",
    description: "이 에이전트의 긴 대화는 아직 나눠 읽지 못합니다. 원본 파일은 그대로입니다.",
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

/** The message the reader is looking at, and where it sits in the scroller. */
type ReadingAnchor = { sessionId: string; openToken: number; messageId: string; top: number };

function scrollerOf(element: Element | null): Element | null {
  return element?.closest(".page-shell-scroll") ?? null;
}

/** The first message at least partly below the scroller's top edge. */
function readingAnchor(list: Element, scroller: Element, state: LoadedState): ReadingAnchor | null {
  const top = scroller.getBoundingClientRect().top;
  for (const item of list.querySelectorAll<HTMLElement>("[data-message-id]")) {
    const rect = item.getBoundingClientRect();
    if (rect.bottom > top + 1) {
      return { sessionId: state.sessionId, openToken: state.openToken, messageId: item.dataset.messageId!, top: rect.top - top };
    }
  }
  return null;
}

function SessionWindowConversation({ state }: { state: LoadedState }) {
  const loadEarlier = useSessionStore((store) => store.loadEarlierSessionWindow);
  const loadNewer = useSessionStore((store) => store.loadNewerSessionWindow);
  const loadLatest = useSessionStore((store) => store.loadLatestSessionWindow);
  const sectionRef = useRef<HTMLElement>(null);
  // The message being read when a page was requested. After the page lands,
  // that same message is put back where it was, whether windows were added
  // above it or let go of below or above. Keyed to the view it was taken in,
  // so it is never applied to another session or a reopened view.
  const anchor = useRef<ReadingAnchor | null>(null);
  const toBottom = useRef(true);
  const firstStart = state.spans[0]!.startOffset;
  const lastEnd = state.spans[state.spans.length - 1]!.endOffset;

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const scroller = scrollerOf(section);
    if (!section || !scroller) return;
    if (toBottom.current) {
      // Opening, or jumping to the latest: the newest message first.
      toBottom.current = false;
      anchor.current = null;
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    const saved = anchor.current;
    anchor.current = null;
    if (!saved || saved.sessionId !== state.sessionId || saved.openToken !== state.openToken) return;
    const item = section.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(saved.messageId)}"]`);
    if (!item) return;
    const moved = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top - saved.top;
    scroller.scrollTop += moved;
  }, [state.sessionId, state.openToken, firstStart, lastEnd]);

  const keepPlace = () => {
    const section = sectionRef.current;
    const scroller = scrollerOf(section);
    anchor.current = section && scroller ? readingAnchor(section, scroller, state) : null;
  };
  const requestEarlier = () => {
    keepPlace();
    void loadEarlier();
  };
  const requestNewer = () => {
    keepPlace();
    void loadNewer();
  };
  const requestLatest = () => {
    toBottom.current = true;
    void loadLatest();
  };

  const reachedStart = state.startOffset === 0;
  const atLatest = state.released.length === 0;
  // "전체" only when nothing was left out: an oversized record that was skipped
  // means the range is whole but its content is not.
  const headline =
    reachedStart && atLatest
      ? state.omittedRecords > 0
        ? "대화 전체 범위 표시 중"
        : "대화 전체 표시 중"
      : atLatest
        ? "최근 대화 일부 표시 중"
        : "이전 대화 일부 표시 중";
  const coverage = state.status === "partial" ? coverageLabel(state) : null;
  const pageError = state.pageError;
  return (
    <section className="session-window" aria-label="원본 대화" ref={sectionRef}>
      <header className="session-window-head">
        <span className="session-window-coverage">
          {headline}
          <InfoHint label="표시 범위">
            이 대화는 한 번에 가져오기에 길어서 끝에서부터 나눠 읽습니다. 한 번에 {MAX_RETAINED_WINDOWS}구간까지
            보여 주고, 더 이전으로 가면 가장 최근 구간을 잠시 내려놓습니다. 내려놓은 구간은 아래의 다음 대화
            보기로 다시 읽습니다. 표시된 메시지 수는 지금 보이는 부분의 수입니다. 분석과 보고서는 전체를 가져온
            세션에서만 제공합니다.
          </InfoHint>
        </span>
        <span className="session-window-meta">
          메시지 {state.events.length.toLocaleString("ko-KR")}개{coverage ? ` · ${coverage}` : ""}
        </span>
      </header>

      {reachedStart ? (
        <p className="session-window-start">대화의 시작</p>
      ) : (
        <div className="session-window-earlier">
          {pageError?.direction === "earlier" ? (
            <PageFailure error={pageError.error} what="이전 대화" onRetry={requestEarlier} onLatest={requestLatest} />
          ) : (
            <PageButton busy={state.paging === "earlier"} icon={ChevronUp} onClick={requestEarlier} disabled={state.paging !== null}>
              {state.paging === "earlier" ? "이전 대화 읽는 중…" : "이전 대화 더 보기"}
            </PageButton>
          )}
        </div>
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

      {atLatest ? null : (
        <div className="session-window-newer">
          {pageError && pageError.direction !== "earlier" ? (
            <PageFailure error={pageError.error} what="다음 대화" onRetry={requestNewer} onLatest={requestLatest} />
          ) : (
            <>
              <PageButton busy={state.paging === "newer"} icon={ChevronDown} onClick={requestNewer} disabled={state.paging !== null}>
                {state.paging === "newer" ? "다음 대화 읽는 중…" : "다음 대화 보기"}
              </PageButton>
              <PageButton busy={state.paging === "latest"} icon={ChevronsDown} onClick={requestLatest} disabled={state.paging !== null}>
                최신 대화로
              </PageButton>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function PageButton({
  busy,
  icon,
  onClick,
  disabled,
  children,
}: {
  busy: boolean;
  icon: typeof ChevronUp;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={busy ? Loader2 : icon}
      className={busy ? "is-loading" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function PageFailure({
  error,
  what,
  onRetry,
  onLatest,
}: {
  error: SessionWindowError;
  what: string;
  onRetry: () => void;
  onLatest: () => void;
}) {
  if (error.kind === "changed") {
    return (
      <p className="session-window-earlier-error" role="alert">
        원본 대화가 바뀌어 {what}를 이어 읽을 수 없습니다.
        <Button size="sm" variant="ghost" icon={RotateCw} onClick={onLatest}>
          최신 대화로 다시 열기
        </Button>
      </p>
    );
  }
  return (
    <p className="session-window-earlier-error" role="alert">
      {what}를 읽지 못했습니다.
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
    <li className={`session-window-message is-${kind}`} data-message-id={message.id}>
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
