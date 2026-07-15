import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderGit2 } from "lucide-react";
import {
  loadStoredSessionSummaries,
  useSessionStore,
} from "../../app/sessionStore";
import {
  filterSidebarRows,
  groupSidebarRows,
  shortProjectLabel,
  toSidebarRow,
  type SidebarSessionRow,
} from "../../lib/sidebar/sessionList";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { SearchField } from "../../components/ui/SearchField";
import {
  formatClaudeRelativeKo,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import { useLiveSessions } from "../live-session/useLiveSessions";
import { sessionShortLabel } from "../live-session/liveFeed";

/**
 * 세션 인덱스 · the left column of the unified 세션 workspace.
 *
 * One list, two groups by *state*, not by source type:
 *  - 진행 중 · sessions the live-follow driver is tailing right now (only on
 *    desktop, where the session logs are reachable). Selecting one shows the
 *    live feed in the main pane.
 *  - 과거 · every stored session, grouped by recency. Selecting one loads it and
 *    opens its review inline in the main pane.
 *
 * This index is the single home for browsing sessions: it supersedes both the
 * live view's session-picker popover and the global 최근 작업 tree, so the shell
 * is never two competing lists.
 */
export function SessionIndex({
  liveActive,
  selectedPastId,
  onSelectLive,
  onSelectPast,
}: {
  /** The main pane is showing the live feed. */
  liveActive: boolean;
  /** The past session whose review is open (null when live). */
  selectedPastId: string | null;
  onSelectLive: (focusSessionId?: string) => void;
  onSelectPast: (sessionId: string) => void;
}) {
  const dataResetNonce = useSessionStore((state) => state.dataResetNonce);
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? state.demoSessionId ?? null,
  );

  const bridgeAvailable = isClaudeBridgeAvailable();
  const liveSnapshot = useLiveSessions(bridgeAvailable);
  const liveRows = useMemo(
    () =>
      liveSnapshot.sessions.map((s) => ({
        key: s.meta.filePath,
        sessionId: s.meta.sessionId,
        label: sessionShortLabel(s.meta),
        steps: s.follow.messages.length,
        lastAt:
          s.follow.messages[s.follow.messages.length - 1]?.createdAt ||
          s.meta.startedAt,
      })),
    [liveSnapshot.sessions],
  );

  const [summaries, setSummaries] = useState(() => safeListSessions());
  const [query, setQuery] = useState("");
  useEffect(() => {
    setSummaries(safeListSessions());
  }, [activeSessionId, dataResetNonce]);

  const pastRows = useMemo<SidebarSessionRow[]>(
    () => mergeDemoSessionSummaries(summaries).map(toSidebarRow),
    [summaries],
  );
  const filteredPast = useMemo(
    () => filterSidebarRows(pastRows, query),
    [pastRows, query],
  );
  const pastGroups = useMemo(
    () => groupSidebarRows(filteredPast, Date.now(), "recency"),
    [filteredPast],
  );

  const term = query.trim().toLowerCase();
  const visibleLive = useMemo(
    () =>
      term
        ? liveRows.filter((row) => row.label.toLowerCase().includes(term))
        : liveRows,
    [liveRows, term],
  );

  const handleSelectPast = useCallback(
    (sessionId: string) => onSelectPast(sessionId),
    [onSelectPast],
  );

  return (
    <aside className="session-index" aria-label="세션 목록">
      <div className="session-index-search">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="세션 검색"
          ariaLabel="세션 검색"
        />
      </div>

      <div className="session-index-list base-scroll">
        {
          <>
            {/* 라이브 피드 · always present and clickable, so the live pane is
                reachable from anywhere in the index (even mid-review with no
                running session). Its running sessions list underneath. */}
            <section className="session-index-group">
              <button
                type="button"
                className={`session-index-live-head${liveActive ? " is-active" : ""}`}
                onClick={() => onSelectLive()}
              >
                <span
                  className={`session-index-live-dot${visibleLive.length === 0 ? " is-idle" : ""}`}
                  aria-hidden="true"
                />
                <span className="session-index-live-head-label">라이브 피드</span>
                {visibleLive.length > 0 ? (
                  <span className="session-index-live-count">
                    {visibleLive.length}
                  </span>
                ) : null}
              </button>
              {visibleLive.length > 0 ? (
                <ul>
                  {visibleLive.map((row) => (
                    <li key={row.key}>
                      <button
                        type="button"
                        className="session-index-row"
                        onClick={() => onSelectLive(row.sessionId)}
                      >
                        <span className="session-index-row-title">
                          {row.label}
                        </span>
                        <span className="session-index-row-meta">
                          {row.steps.toLocaleString()}단계 ·{" "}
                          {formatClaudeRelativeKo(row.lastAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : bridgeAvailable && !term ? (
                <p className="session-index-hint">지금 실행 중인 세션이 없습니다.</p>
              ) : null}
            </section>

            {filteredPast.length === 0 ? (
              <p className="session-index-empty">
                {term
                  ? "검색 결과가 없습니다."
                  : "아직 지난 세션이 없습니다. Claude · Codex 작업을 가져오면 여기에 쌓입니다."}
              </p>
            ) : (
              pastGroups.map((group) => (
                <section
                  key={`${group.bucket}-${group.label}`}
                  className="session-index-group"
                >
                  <p className="session-index-label">과거 · {group.label}</p>
                  <ul>
                    {group.rows.map((row) => {
                      const active =
                        !liveActive && selectedPastId === row.sessionId;
                      return (
                        <li key={row.sessionId}>
                          <button
                            type="button"
                            className={`session-index-row${active ? " is-active" : ""}`}
                            onClick={() => handleSelectPast(row.sessionId)}
                          >
                            <span className="session-index-row-title">
                              {row.title}
                            </span>
                            <span className="session-index-row-meta">
                              {row.sourceLabel ? (
                                <span className="session-index-row-source">
                                  <FolderGit2 size={11} aria-hidden="true" />
                                  {shortProjectLabel(row.sourceLabel)}
                                </span>
                              ) : null}
                              <span>{formatClaudeRelativeKo(row.timestamp)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </>
        }
      </div>
    </aside>
  );
}

function safeListSessions() {
  try {
    return loadStoredSessionSummaries();
  } catch {
    return [];
  }
}
