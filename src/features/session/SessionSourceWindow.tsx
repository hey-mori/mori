import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronsDown, ChevronUp, FileWarning, Loader2, RotateCw, Search, X } from "lucide-react";
import { useSessionStore } from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { useProjectSearchStore } from "../../app/projectSearchStore";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import { EmptyState } from "../../components/layout/EmptyState";
import type { ClaudeCodeSearchHit, ClaudeMessage } from "../../lib/claude/types";
import {
  canSearchMore,
  normalizeQuery,
  SEARCH_QUERY_MAX_CHARS,
  searchStatusLine,
  splitOnPhrase,
  type SessionSearchState,
} from "../../lib/session/sessionSearch";
import {
  coverageLabel,
  filePositionLabel,
  isAtLatest,
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
  // The last search jump the viewport moved for: a jump moves it once, and
  // paging afterwards keeps the reading place as usual.
  const appliedFocus = useRef<number | null>(null);
  const firstStart = state.spans[0]!.startOffset;
  const lastEnd = state.spans[state.spans.length - 1]!.endOffset;
  const focus = state.focus;
  const search = useSessionStore((store) => store.sessionSearch);
  const closeSearch = useSessionStore((store) => store.closeSessionSearch);
  const ownSearch =
    search && search.sessionId === state.sessionId && search.openToken === state.openToken ? search : null;
  const [searchOpen, setSearchOpen] = useState(ownSearch !== null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const scroller = scrollerOf(section);
    if (!section || !scroller) return;
    if (focus && appliedFocus.current !== focus.seq) {
      // A search result was opened: show its message, whatever was in view.
      appliedFocus.current = focus.seq;
      toBottom.current = false;
      anchor.current = null;
      // The last element with the id: the matched record is the last of its
      // id in the view (paging drops later and earlier repeats of an id).
      const items = section.querySelectorAll<HTMLElement>(`[data-message-id="${CSS.escape(focus.messageId)}"]`);
      const item = items[items.length - 1];
      if (item) {
        const offset = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += offset - Math.max(0, (scroller.clientHeight - item.offsetHeight) / 2);
        item.focus({ preventScroll: true });
      }
      return;
    }
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
  }, [state.sessionId, state.openToken, firstStart, lastEnd, focus]);

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
  const atLatest = isAtLatest(state);
  const focusIndex = focus ? state.events.map((event) => event.id).lastIndexOf(focus.messageId) : -1;
  // A repeated id (two records sharing a uuid) still gets its own row key.
  const seen = new Map<string, number>();
  const rowKey = (id: string) => {
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    return count === 0 ? id : `${id}#${count}`;
  };
  const position = atLatest ? null : filePositionLabel(state);
  const toggleSearch = () => {
    if (searchOpen) closeSearch();
    setSearchOpen((open) => !open);
  };
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
      <div className="session-window-top">
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
          <span className="session-window-head-side">
            <BackToProjectSearch sessionId={state.sessionId} />
            <span className="session-window-meta">
              메시지 {state.events.length.toLocaleString("ko-KR")}개{coverage ? ` · ${coverage}` : ""}
              {position ? ` · ${position}` : ""}
            </span>
            <Button size="sm" variant="ghost" icon={searchOpen ? X : Search} onClick={toggleSearch} aria-expanded={searchOpen}>
              {searchOpen ? "찾기 닫기" : "이 대화에서 찾기"}
            </Button>
          </span>
        </header>

        {searchOpen ? <TranscriptSearch state={state} search={ownSearch} /> : null}
      </div>

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
          {state.events.map((message, index) => (
            <WindowMessage key={rowKey(message.id)} message={message} focus={index === focusIndex ? focus : null} />
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

function WindowMessage({
  message,
  focus,
}: {
  message: ClaudeMessage;
  focus: { query: string; wholeWords: boolean; seq: number } | null;
}) {
  const [open, setOpen] = useState(focus !== null);
  // A search result opened at this message: show it whole, so the match is
  // never folded away.
  const focusSeq = focus?.seq ?? null;
  useEffect(() => {
    if (focusSeq !== null) setOpen(true);
  }, [focusSeq]);
  const kind = messageKind(message);
  const limit = kind === "tool" ? TOOL_CLIP_CHARS : CLIP_CHARS;
  const long = message.content.length > limit;
  const text = open || !long ? message.content : `${message.content.slice(0, limit)}…`;
  return (
    <li
      className={`session-window-message is-${kind}${focus ? " is-search-focus" : ""}`}
      data-message-id={message.id}
      tabIndex={focus ? -1 : undefined}
      aria-label={focus ? "검색 결과 메시지" : undefined}
    >
      <div className="session-window-message-head">
        <span className="session-window-role">{ROLE_LABEL[kind]}</span>
        {message.createdAt ? <time dateTime={message.createdAt}>{clockLabel(message.createdAt)}</time> : null}
      </div>
      <p className="session-window-text">
        {focus
          ? splitOnPhrase(text, focus.query, focus.wholeWords).map((part, index) =>
              part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
            )
          : text}
      </p>
      {long ? (
        <button type="button" className="session-window-fold" onClick={() => setOpen((value) => !value)}>
          {open ? "접기" : "펼치기"}
        </button>
      ) : null}
    </li>
  );
}

/**
 * The way back to the project search a result opened this session from. A
 * navigation context only: it says where the user came from, never that the
 * session belongs to the project (that is the breadcrumb's job).
 */
function BackToProjectSearch({ sessionId }: { sessionId: string }) {
  const projectId = useProjectSearchStore((store) =>
    store.search && store.openedSessionId === sessionId ? store.search.projectId : null,
  );
  const query = useProjectSearchStore((store) => store.search?.query ?? "");
  const openProjectContext = useAppStore((store) => store.openProjectContext);
  if (!projectId) return null;
  return (
    <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => openProjectContext(projectId)} title={`"${query}" 검색 결과로`}>
      프로젝트 검색 결과
    </Button>
  );
}

/**
 * Search inside this transcript: a phrase, bounded steps from the end back,
 * and results that open the view at their message. The list folds after a
 * result is opened and stays one click away.
 */
function TranscriptSearch({ state, search }: { state: LoadedState; search: SessionSearchState | null }) {
  const start = useSessionStore((store) => store.searchSessionWindow);
  const more = useSessionStore((store) => store.searchMoreSessionWindow);
  const cancel = useSessionStore((store) => store.cancelSessionSearch);
  const openHit = useSessionStore((store) => store.openSessionSearchHit);
  const [query, setQuery] = useState(search?.query ?? "");
  const [partial, setPartial] = useState(search ? !search.wholeWords : false);
  const [listOpen, setListOpen] = useState(true);
  const searching = search?.status === "searching";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizeQuery(query)) return;
    setListOpen(true);
    void start(query, !partial);
  };
  const togglePartial = () => {
    const next = !partial;
    setPartial(next);
    // A search already showing is run again under the new rule.
    if (search && normalizeQuery(query)) {
      setListOpen(true);
      void start(query, !next);
    }
  };
  const select = (hit: ClaudeCodeSearchHit) => {
    setListOpen(false);
    void openHit(hit);
  };
  const retryable = search && (search.status === "changed" || search.status === "error");
  return (
    <div className="session-search" role="search" aria-label="이 대화에서 찾기">
      <form className="session-search-form" onSubmit={submit}>
        <input
          className="session-search-input"
          type="search"
          value={query}
          maxLength={SEARCH_QUERY_MAX_CHARS}
          placeholder="이 대화에서 찾을 문구"
          aria-label="찾을 문구"
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching ? (
          <Button size="sm" variant="ghost" onClick={cancel}>
            멈추기
          </Button>
        ) : (
          <Button size="sm" type="submit" icon={Search} disabled={!normalizeQuery(query)}>
            찾기
          </Button>
        )}
        <button
          type="button"
          className={`search-mode-toggle${partial ? " is-on" : ""}`}
          aria-pressed={partial}
          onClick={togglePartial}
          title="단어 중간에 들어 있는 경우도 찾습니다"
        >
          부분 일치
        </button>
        <InfoHint label="이 대화에서 찾기">
          원본 대화 파일을 지금 읽어서 최근부터 이전 순서로 찾습니다. 대소문자는 구분하지 않고, 화면에 보이는 메시지
          내용만 찾습니다. 영문과 숫자는 단어 단위로 찾아서 "Candidate B"가 "candidate build"에 걸리지 않습니다. 단어 중간도
          찾으려면 부분 일치를 켜세요. 한글은 조사가 붙어도 찾습니다. 결과와 검색어는 저장하지 않습니다. 찾기를 시작한
          뒤에 추가된 내용은 포함되지 않습니다.
        </InfoHint>
      </form>

      {search ? (
        <div className="session-search-body">
          <p className="session-search-status" role="status" aria-live="polite">
            {searching ? <Loader2 className="session-window-spin" size={12} aria-hidden="true" /> : null}
            <span>{searchStatusLine(search)}</span>
            {search.unsearchableRecords > 0 && !(search.status === "idle" && search.reachedStart) ? (
              <span className="session-search-note">· 너무 큰 기록 {search.unsearchableRecords}개는 찾지 못했습니다</span>
            ) : null}
            {search.hits.length > 0 ? (
              <button type="button" className="session-search-toggle" onClick={() => setListOpen((open) => !open)}>
                {listOpen ? "결과 접기" : `결과 ${search.hits.length}개 보기`}
              </button>
            ) : null}
          </p>
          {search.openError ? (
            <p className="session-search-error" role="alert">
              {search.openError.error.kind === "changed"
                ? "이 결과의 원본이 바뀌었습니다. 다시 찾아 주세요."
                : "이 결과를 열지 못했습니다."}
            </p>
          ) : null}
          {listOpen && search.hits.length > 0 ? (
            <ol className="session-search-results">
              {search.hits.map((hit) => (
                <li key={`${hit.recordStart}:${hit.messageId}`}>
                  <button
                    type="button"
                    className={`session-search-hit${state.focus?.messageId === hit.messageId ? " is-current" : ""}`}
                    onClick={() => select(hit)}
                    disabled={search.opening !== null}
                  >
                    <span className="session-search-hit-head">
                      <span className="session-window-role">{ROLE_LABEL[messageKind(hit)]}</span>
                      {hit.createdAt ? <time dateTime={hit.createdAt}>{clockLabel(hit.createdAt)}</time> : null}
                      {hit.matchesInMessage > 1 ? <span>이 메시지에 {hit.matchesInMessage}곳</span> : null}
                      {search.opening === hit.messageId ? <Loader2 className="session-window-spin" size={11} aria-hidden="true" /> : null}
                    </span>
                    <span className="session-search-snippet">
                      {hit.snippetBefore}
                      <mark>{hit.snippetMatch}</mark>
                      {hit.snippetAfter}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          {canSearchMore(search) ? (
            <Button size="sm" variant="ghost" icon={ChevronUp} onClick={() => void more()}>
              이전 부분에서 더 찾기
            </Button>
          ) : null}
          {retryable ? (
            <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => void start(search.query, search.wholeWords)}>
              다시 찾기
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type MessageKind = "user" | "assistant" | "tool" | "system";

const ROLE_LABEL: Record<MessageKind, string> = {
  user: "나",
  assistant: "Claude",
  tool: "도구",
  system: "시스템",
};

function messageKind(message: { role: string; subkind?: string }): MessageKind {
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
