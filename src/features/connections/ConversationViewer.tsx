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
 * Performance: we render every message directly — 300–500 nodes scroll
 * smoothly without virtualisation. If users start opening 5k-message
 * sessions we can swap to react-virtuoso, but the threshold isn't here
 * yet.
 *
 * Accessibility: focus moves into the drawer on open, Escape closes it,
 * the search field is wired to a live count, and tool-result bodies are
 * collapsed into a native `<details>` so screen readers can skip them.
 */
import { Plus, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriDrawer } from "../../components/ui/MoriDrawer";
import { formatClaudeTimestamp } from "../../lib/claude/claudeTauri";
import {
  classifyMessage,
  computeConversationStats,
  formatTokenCount,
} from "../../lib/claude/conversationStats";
import type {
  ClaudeCodeSessionDetail,
  ClaudeMessage,
} from "../../lib/claude/types";

export type ConversationViewerProps = {
  open: boolean;
  detail: ClaudeCodeSessionDetail | null;
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
  const listRef = useRef<HTMLDivElement>(null);

  // Reset search whenever the drawer reopens with a different session. The
  // stats memo and scroll position should restart from the top for every
  // new conversation.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    listRef.current?.scrollTo({ top: 0 });
  }, [open, detail?.sessionId]);

  const stats = useMemo(
    () => computeConversationStats(detail?.messages ?? []),
    [detail?.messages],
  );

  const trimmed = query.trim().toLowerCase();
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

  // When the search yields results, scroll the first match into view so
  // the user can confirm we found their phrase without hunting for it.
  useEffect(() => {
    if (!open || !matchedIds || matchedIds.size === 0) return;
    const first = listRef.current?.querySelector<HTMLElement>("[data-search-match='true']");
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [matchedIds, open]);

  if (!detail) {
    return <MoriDrawer open={open} onClose={onClose} ariaLabel="대화 전체 보기">{null}</MoriDrawer>;
  }

  return (
    <MoriDrawer open={open} onClose={onClose} ariaLabel="대화 전체 보기">
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
            Claude (Desktop · Code) · {detail.projectName || "프로젝트 미지정"}
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
              <small>Claude 응답</small>
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

        <div className="conversation-viewer-body mori-scroll" ref={listRef}>
          {detail.messages.length === 0 ? (
            <p className="conversation-viewer-empty">표시할 메시지가 없습니다.</p>
          ) : (
            <ol className="conversation-viewer-list">
              {detail.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  matched={matchedIds ? matchedIds.has(message.id) : false}
                  hasQuery={Boolean(matchedIds)}
                />
              ))}
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
    </MoriDrawer>
  );
}

type MessageBubbleProps = {
  message: ClaudeMessage;
  matched: boolean;
  hasQuery: boolean;
};

function MessageBubble({ message, matched, hasQuery }: MessageBubbleProps) {
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
      ? "Claude (도구 호출)"
      : isAssistant
        ? "Claude"
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
    <li className={className} data-search-match={matched ? "true" : undefined}>
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
