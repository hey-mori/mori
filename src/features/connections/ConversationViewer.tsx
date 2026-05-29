/**
 * ConversationViewer — full-conversation drawer for a Claude Code session.
 *
 * The Connections preview pane only shows the first handful of messages so
 * the layout stays compact. Long sessions (hundreds of turns) need a real
 * reading surface before the user can decide whether to import: this
 * component opens a right-side drawer with chat-bubble styling, role
 * labels, tool-call highlighting, in-conversation search, and a sticky
 * action bar that re-exposes the import button.
 *
 * Performance: the message list is virtualised — only the rows inside the
 * viewport (plus a small overscan margin) are mounted, with top/bottom
 * spacers padding out the scrollbar. A 3–5k-message Claude Code session
 * therefore keeps a few dozen DOM nodes instead of thousands. The
 * visible-range math is a pure, unit-tested helper (`conversationWindow`);
 * this component only owns the DOM measurement and scroll plumbing. The
 * search field is debounced so the full-content scan doesn't run on every
 * keystroke.
 *
 * Accessibility: focus moves into the drawer on open, Escape closes it,
 * the search field is wired to a live count, and tool-result bodies are
 * collapsed into a native `<details>` so screen readers can skip them.
 */
import { Plus, Search, Sparkles, X } from "lucide-react";
import {
  type UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseDrawer } from "../../components/ui/BaseDrawer";
import { formatClaudeTimestamp } from "../../lib/claude/claudeTauri";
import {
  classifyMessage,
  computeConversationStats,
  formatTokenCount,
} from "../../lib/claude/conversationStats";
import type { ClaudeMessage } from "../../lib/claude/types";
import type { AgentWorkSessionDetail } from "../../lib/agents/workSessions";
import { computeVisibleRange, offsetForIndex } from "./conversationWindow";

/**
 * Vertical gap between bubbles (matches `.conversation-viewer-list` `gap` in
 * styles.css). We fold it into each row's effective height so the windowing
 * math and the absolutely-positioned slice stay aligned.
 */
const ROW_GAP = 12;

/**
 * Estimated bubble height (px) for rows we haven't measured yet, gap included.
 * A typical short turn is ~64px; we bias slightly high so the initial
 * scrollbar doesn't overshoot and snap back once real heights arrive.
 */
const ESTIMATED_ROW_HEIGHT = 96 + ROW_GAP;

/** Rows rendered above and below the viewport to hide scroll seams. */
const OVERSCAN = 8;

export type ConversationViewerProps = {
  open: boolean;
  detail: AgentWorkSessionDetail | null;
  onClose: () => void;
  /**
   * Default CTA — create a new Mori session for this conversation and open
   * its Import Review. The drawer never closes itself; the parent decides
   * (it usually navigates away from Connections, which unmounts this).
   */
  onImportAsNewSession: () => void;
  /**
   * Secondary CTA — send this conversation into the active session's Import
   * Review. Disabled when there is no active session.
   */
  onImportIntoCurrentSession: () => void;
  /** Whether a real (non-demo) session is currently active. */
  hasActiveSession: boolean;
};

/** Trim trailing whitespace and collapse extreme repetition for the preview pane. */
function shortToolBodyPreview(content: string): string {
  const stripped = content.replace(/^↳ 도구 (결과|오류):\s*/, "");
  const oneLine = stripped.split("\n", 1)[0] ?? "";
  return oneLine.trim();
}

export function ConversationViewer({
  open,
  detail,
  onClose,
  onImportAsNewSession,
  onImportIntoCurrentSession,
  hasActiveSession,
}: ConversationViewerProps) {
  const [query, setQuery] = useState("");
  // The query the content scan actually runs against — trails `query` by the
  // debounce window so fast typing doesn't trigger a scan + re-render per key.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Virtualisation state: scroll position + viewport height drive which rows
  // are mounted; the measured-height map refines our estimates as rows render.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const measuredHeights = useRef<Map<number, number>>(new Map());
  // Bumped whenever a measurement changes so the range memo recomputes.
  const [measureTick, setMeasureTick] = useState(0);

  const messages = detail?.messages ?? null;

  const rowHeight = useCallback(
    (index: number) => measuredHeights.current.get(index) ?? ESTIMATED_ROW_HEIGHT,
    // measureTick is read implicitly via the ref; listing it keeps the
    // callback identity in sync with measurement updates for the range memo.
    [measureTick],
  );

  // Reset search, scroll, and all measurements whenever the drawer reopens
  // with a different session. Heights from one conversation must not leak into
  // the next, and everything should restart from the top.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    measuredHeights.current.clear();
    setMeasureTick((tick) => tick + 1);
    setScrollTop(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [open, detail?.filePath]);

  // Debounce the search query so the full-content scan below runs at most once
  // per ~180ms of typing rather than on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  const stats = useMemo(
    () => computeConversationStats(detail?.messages ?? []),
    [detail?.messages],
  );

  const trimmed = debouncedQuery.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    if (!detail || !trimmed) return null;
    const set = new Set<string>();
    for (const message of detail.messages) {
      if (message.content.toLowerCase().includes(trimmed)) {
        set.add(message.id);
      }
    }
    return set;
  }, [detail, trimmed]);

  // First matched message index — used to scroll the match into view even
  // when its row isn't currently mounted (virtualisation means we can't rely
  // on a DOM node existing for `scrollIntoView`).
  const firstMatchIndex = useMemo(() => {
    if (!messages || !matchedIds || matchedIds.size === 0) return -1;
    return messages.findIndex((message) => matchedIds.has(message.id));
  }, [messages, matchedIds]);

  // Track the scroll container's viewport height (initial + on resize) so the
  // visible-range math has an accurate window.
  useLayoutEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (!node) return;
    setViewportHeight(node.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setViewportHeight(node.clientHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, detail?.sessionId]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const itemCount = messages?.length ?? 0;
  const range = useMemo(
    () =>
      computeVisibleRange({
        itemCount,
        scrollTop,
        viewportHeight: viewportHeight || 1,
        rowHeight,
        overscan: OVERSCAN,
      }),
    [itemCount, scrollTop, viewportHeight, rowHeight],
  );

  // When the (debounced) search yields a match, jump to it. The matched row
  // may be off-screen and therefore unmounted, so we can't `scrollIntoView` a
  // DOM node directly. Instead we record the target index and scroll the
  // container to its estimated offset; the second effect below snaps precisely
  // once the row is mounted and measured.
  const pendingMatchIndex = useRef<number>(-1);
  useEffect(() => {
    if (!open || firstMatchIndex < 0) return;
    const node = listRef.current;
    if (!node) return;
    pendingMatchIndex.current = firstMatchIndex;
    const target = offsetForIndex(firstMatchIndex, rowHeight);
    const centred = Math.max(0, target - node.clientHeight / 2 + ESTIMATED_ROW_HEIGHT / 2);
    node.scrollTo({ top: centred, behavior: "smooth" });
    // rowHeight intentionally omitted: the follow-up effect handles refinement
    // once real measurements arrive, so we don't re-trigger on every measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstMatchIndex, open]);

  // Once the pending match row is inside the rendered window, centre it
  // precisely with the real DOM node, then clear the flag so later manual
  // scrolling is left alone.
  useLayoutEffect(() => {
    const targetIndex = pendingMatchIndex.current;
    if (targetIndex < 0) return;
    if (targetIndex < range.startIndex || targetIndex > range.endIndex) return;
    const matchNode = listRef.current?.querySelector<HTMLElement>(
      "[data-search-match='true']",
    );
    if (matchNode) {
      matchNode.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingMatchIndex.current = -1;
    }
  }, [range.startIndex, range.endIndex, measureTick]);

  // Measure rendered rows after layout and store any height that differs from
  // our current value, refining future range calculations.
  const measureRow = useCallback((index: number, node: HTMLLIElement | null) => {
    if (!node) return;
    // Fold the inter-row gap into the stored height so cumulative offsets
    // match the visual layout (the gap sits between, not inside, bubbles).
    const height = node.offsetHeight + ROW_GAP;
    if (height <= ROW_GAP) return;
    if (measuredHeights.current.get(index) !== height) {
      measuredHeights.current.set(index, height);
      setMeasureTick((tick) => tick + 1);
    }
  }, []);

  if (!detail) {
    return <BaseDrawer open={open} onClose={onClose} ariaLabel="대화 전체 보기">{null}</BaseDrawer>;
  }

  return (
    <BaseDrawer open={open} onClose={onClose} ariaLabel="대화 전체 보기">
      <div className="conversation-viewer">
        <header className="conversation-viewer-header">
          <div className="conversation-viewer-title-row">
            <h2 title={detail.title}>{detail.title}</h2>
            <button
              type="button"
              className="conversation-viewer-close"
              onClick={onClose}
              aria-label="대화 보기 닫기"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="conversation-viewer-subtitle">
            {detail.agentName} · {detail.projectName || "프로젝트 미지정"}
          </p>
          <ul className="conversation-viewer-stats" aria-label="대화 통계">
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
              <small>{detail.agentName} 응답</small>
            </li>
            <li>
              <strong>{stats.toolUses}</strong>
              <small>도구 호출</small>
            </li>
            <li>
              <strong>{stats.toolResults}</strong>
              <small>도구 결과</small>
            </li>
            {stats.durationLabel ? (
              <li>
                <strong>{stats.durationLabel}</strong>
                <small>소요 시간</small>
              </li>
            ) : null}
          </ul>
          {detail.tokenUsage && detail.tokenUsage.totalTokens > 0 ? (
            <div className="conversation-viewer-tokens" aria-label="토큰 사용량">
              <span className="conversation-viewer-tokens-label">토큰</span>
              <span className="conversation-viewer-token-chip">
                입력 {formatTokenCount(detail.tokenUsage.inputTokens)}
              </span>
              <span className="conversation-viewer-token-chip">
                출력 {formatTokenCount(detail.tokenUsage.outputTokens)}
              </span>
              {detail.tokenUsage.cacheReadTokens > 0 ? (
                <span className="conversation-viewer-token-chip is-muted">
                  캐시 읽기 {formatTokenCount(detail.tokenUsage.cacheReadTokens)}
                </span>
              ) : null}
              <span
                className="conversation-viewer-token-chip is-total"
                title={`입력 ${detail.tokenUsage.inputTokens.toLocaleString()} · 출력 ${detail.tokenUsage.outputTokens.toLocaleString()} 토큰`}
              >
                합계 {formatTokenCount(detail.tokenUsage.totalTokens)}
              </span>
              {detail.tokenUsage.model ? (
                <span className="conversation-viewer-token-model">
                  {detail.tokenUsage.model}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="conversation-viewer-search">
            <label className="conversation-viewer-search-input">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="메시지 내용 검색"
                aria-label="대화 내용 검색"
              />
            </label>
            {matchedIds ? (
              <small className="conversation-viewer-search-meta" role="status">
                {matchedIds.size === 0
                  ? "일치하는 메시지가 없습니다."
                  : `${matchedIds.size}개 메시지에서 일치`}
              </small>
            ) : null}
          </div>
        </header>

        <div
          className="conversation-viewer-body base-scroll"
          ref={listRef}
          onScroll={handleScroll}
        >
          {detail.messages.length === 0 ? (
            <p className="conversation-viewer-empty">표시할 메시지가 없습니다.</p>
          ) : (
            // The outer ol is sized to the full conversation so the scrollbar
            // reflects every message; only the visible slice is mounted,
            // absolutely positioned at the computed top offset.
            <ol
              className="conversation-viewer-list is-virtualized"
              style={{ height: range.totalHeight }}
            >
              <div
                className="conversation-viewer-window"
                style={{ transform: `translateY(${range.offsetTop}px)` }}
              >
                {detail.messages
                  .slice(range.startIndex, range.endIndex + 1)
                  .map((message, sliceIndex) => {
                    const index = range.startIndex + sliceIndex;
                    return (
                      <MessageBubble
                        key={message.id}
                        index={index}
                        message={message}
                        matched={matchedIds ? matchedIds.has(message.id) : false}
                        hasQuery={Boolean(matchedIds)}
                        onMeasure={measureRow}
                      />
                    );
                  })}
              </div>
            </ol>
          )}
        </div>

        <footer className="conversation-viewer-footer">
          <div className="conversation-viewer-footer-hint">
            <Sparkles size={14} aria-hidden="true" />
            <span>
              가져오면 Import Review로 이동합니다. 수락한 이벤트만 Timeline에 적용됩니다.
            </span>
          </div>
          <div className="conversation-viewer-footer-actions">
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
                  : "현재 활성 세션이 없습니다. 새 세션으로 가져오세요."
              }
            >
              현재 세션에 추가
            </Button>
          </div>
        </footer>
      </div>
    </BaseDrawer>
  );
}

type MessageBubbleProps = {
  index: number;
  message: ClaudeMessage;
  matched: boolean;
  hasQuery: boolean;
  /** Report this row's measured height back to the virtualiser. */
  onMeasure: (index: number, node: HTMLLIElement | null) => void;
};

function MessageBubble({ index, message, matched, hasQuery, onMeasure }: MessageBubbleProps) {
  const ref = useRef<HTMLLIElement>(null);

  // Measure after every layout-affecting render (content, query dimming, or
  // a `<details>` toggle changing the row height) and feed it to the cache.
  useLayoutEffect(() => {
    onMeasure(index, ref.current);
  });

  const subkind = classifyMessage(message);
  const isToolResult = subkind === "tool_result";
  const isToolUse = subkind === "tool_use";
  const isAssistant = message.role === "assistant";

  // The "alignment" class steers user vs Claude to opposite sides of the
  // thread. Tool results stay on the user side (they arrived in the human
  // envelope) but get a distinct visual treatment.
  const align = isAssistant ? "right" : "left";
  const flavour = isToolResult
    ? "tool-result"
    : isToolUse
      ? "tool-use"
      : isAssistant
        ? "assistant"
        : "human";

  const roleLabel = isToolResult
    ? "사용자 (도구 결과)"
    : isToolUse
      ? "AI (도구 호출)"
      : isAssistant
        ? "AI"
        : "사용자";

  const timestamp = message.createdAt ? formatClaudeTimestamp(message.createdAt) : null;

  // For tool results we keep the first line visible and tuck the rest into
  // a `<details>` so a 200-line grep output doesn't blow out the layout.
  const toolPreview = isToolResult ? shortToolBodyPreview(message.content) : "";
  const toolHasMore =
    isToolResult && message.content.length > toolPreview.length + 6;

  // Search dimming: when a query is active, non-matching rows fade so the
  // user can still see the thread shape without losing context.
  const className = [
    "conversation-message",
    `align-${align}`,
    `flavour-${flavour}`,
    hasQuery && !matched ? "is-dimmed" : "",
    matched ? "is-matched" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={ref} className={className} data-search-match={matched ? "true" : undefined}>
      <div className="conversation-message-meta">
        <span className="conversation-message-role">{roleLabel}</span>
        {timestamp ? (
          <span className="conversation-message-time">{timestamp}</span>
        ) : null}
      </div>
      <div className="conversation-message-bubble">
        {isToolResult ? (
          <>
            <span className="conversation-message-tool-prefix">↳ 도구 결과</span>
            <p className="conversation-message-text">
              {toolPreview || "(빈 결과)"}
            </p>
            {toolHasMore ? (
              <details className="conversation-message-tool-details">
                <summary>전체 결과 보기</summary>
                <pre>{message.content.replace(/^↳ 도구 (결과|오류):\s*/, "")}</pre>
              </details>
            ) : null}
          </>
        ) : isToolUse ? (
          <p className="conversation-message-text conversation-message-tool-use-text">
            {message.content}
          </p>
        ) : (
          <p className="conversation-message-text">{message.content}</p>
        )}
        {isToolResult ? (
          <Badge tone="gray">도구 결과</Badge>
        ) : isToolUse ? (
          <Badge tone="purple">도구 호출</Badge>
        ) : null}
      </div>
    </li>
  );
}
