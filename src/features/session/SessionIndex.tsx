import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, FolderGit2, Plus } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { lostSessionRecords } from "../../lib/session/lostSessions";
import { useSessionResolver } from "./useSessionResolver";
import { useAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  useSessionStore,
} from "../../app/sessionStore";
import {
  filterSidebarRows,
  groupSidebarRows,
  shortProjectLabel,
  toSidebarRow,
  type SidebarGroupingMode,
  type SidebarSessionRow,
} from "../../lib/sidebar/sessionList";
import {
  loadGroupingPreference,
  saveGroupingPreference,
} from "../../lib/sidebar/groupingPreference";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { SearchField } from "../../components/ui/SearchField";
import {
  formatClaudeRelativeKo,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import { useLiveSessions } from "../live-session/useLiveSessions";
import {
  liveSessionTitle,
  sessionIsWorking,
  sessionShortLabel,
} from "../live-session/liveFeed";

/** A followed session counts as "live" while it is working or was touched this
 *  recently — so the list stays stable between turns instead of flickering, and
 *  the 30-minute follow window's older sessions fall through to 과거 instead. */
const LIVE_WINDOW_MS = 4 * 60_000;

/**
 * 세션 인덱스 · the left column of the unified 세션 workspace.
 *
 * Deliberately calm and dense, matching the old sidebar session list:
 *  - 라이브 피드 · only sessions running right now (working or just-active),
 *    each read by its current request with a 작업 중 mark when mid-turn.
 *  - 과거 · every stored session, grouped by recency or project (a toggle). Each
 *    row shows the ONE signal its group does not already imply — the project in
 *    recency mode, the time in project mode — so nothing is repeated.
 *
 * Selecting a row opens it in the main pane. This index supersedes both the live
 * view's picker popover and the old global 최근 작업 tree.
 */
export function SessionIndex({
  liveActive,
  selectedPastId,
  onSelectLive,
  onSelectPast,
}: {
  liveActive: boolean;
  selectedPastId: string | null;
  onSelectLive: (focusSessionId?: string) => void;
  onSelectPast: (sessionId: string) => void;
}) {
  const requestStartRecords = useAppStore((state) => state.requestStartRecords);
  const dataResetNonce = useSessionStore((state) => state.dataResetNonce);
  const sessionListNonce = useSessionStore((state) => state.sessionListNonce);
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? state.demoSessionId ?? null,
  );

  const bridgeAvailable = isClaudeBridgeAvailable();
  const liveSnapshot = useLiveSessions(bridgeAvailable);
  const liveRows = useMemo(() => {
    const now = Date.now();
    return liveSnapshot.sessions
      .map((s) => {
        const lastAt =
          s.follow.messages[s.follow.messages.length - 1]?.createdAt ||
          s.meta.startedAt;
        return {
          key: s.meta.filePath,
          sessionId: s.meta.sessionId,
          title: liveSessionTitle(s),
          project: sessionShortLabel(s.meta),
          working: sessionIsWorking(s, now),
          lastAt,
        };
      })
      // Only what is genuinely live right now — working, or touched within the
      // stability window. Everything older belongs to 과거.
      .filter((row) => row.working || now - (Date.parse(row.lastAt) || 0) < LIVE_WINDOW_MS)
      .sort(
        (a, b) =>
          Number(b.working) - Number(a.working) ||
          (Date.parse(b.lastAt) || 0) - (Date.parse(a.lastAt) || 0),
      );
  }, [liveSnapshot.sessions]);

  const [summaries, setSummaries] = useState(() => safeListSessions());
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState<SidebarGroupingMode>(() =>
    loadGroupingPreference(),
  );
  const toggleGroupMode = () => {
    setGroupMode((prev) => {
      const next: SidebarGroupingMode = prev === "recency" ? "project" : "recency";
      saveGroupingPreference(next);
      return next;
    });
  };
  useEffect(() => {
    setSummaries(safeListSessions());
  }, [activeSessionId, dataResetNonce, sessionListNonce]);

  // Sessions Mori still has a record of whose original is gone from this
  // machine (not stored, not found by the last discovery pass). Without this
  // they vanish from the list while the calendar and 기록 still name them.
  const discovered = useSessionStore((state) => state.discoveredSessions);
  const [sessionRecords, setSessionRecords] = useState<MoriRecord[]>([]);
  useEffect(() => {
    let live = true;
    void getKernelRepository()
      .listRecords()
      .then((result) => {
        if (live && !result.fellBack) setSessionRecords(result.data.filter((record) => record.schemaId === "agent-session"));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [dataResetNonce, sessionListNonce]);
  const lostRows = useMemo(() => {
    const stored = new Set(summaries.map((summary) => summary.sessionId));
    return lostSessionRecords(sessionRecords, stored, discovered).sort((a, b) =>
      (b.occurredEnd ?? b.occurredStart ?? "").localeCompare(a.occurredEnd ?? a.occurredStart ?? ""),
    );
  }, [sessionRecords, summaries, discovered]);
  const resolveSession = useSessionResolver();
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const openLost = useCallback(
    (sessionId: string) => {
      // Tried through the shared resolver (a kept copy still opens, and the
      // outcome is noted for the record's own notice); otherwise its record.
      void resolveSession(sessionId).then((outcome) => {
        if (outcome === "opened") onSelectPast(sessionId);
        else if (outcome === "unavailable") openRecordInLedger(sessionId);
      });
    },
    [resolveSession, onSelectPast, openRecordInLedger],
  );

  const pastRows = useMemo<SidebarSessionRow[]>(
    () => mergeDemoSessionSummaries(summaries).map(toSidebarRow),
    [summaries],
  );
  const filteredPast = useMemo(
    () => filterSidebarRows(pastRows, query),
    [pastRows, query],
  );
  const pastGroups = useMemo(
    () => groupSidebarRows(filteredPast, Date.now(), groupMode),
    [filteredPast, groupMode],
  );

  const term = query.trim().toLowerCase();
  const visibleLive = useMemo(
    () =>
      term
        ? liveRows.filter(
            (row) =>
              row.title.toLowerCase().includes(term) ||
              row.project.toLowerCase().includes(term),
          )
        : liveRows,
    [liveRows, term],
  );

  const handleSelectPast = useCallback(
    (sessionId: string) => onSelectPast(sessionId),
    [onSelectPast],
  );

  const isProjectMode = groupMode === "project";
  const visibleLost = term ? lostRows.filter((record) => record.title.toLowerCase().includes(term)) : lostRows;
  const workingCount = visibleLive.filter((row) => row.working).length;

  return (
    <aside className="session-index" aria-label="세션 목록">
      <div className="session-index-search">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="세션 검색"
          ariaLabel="세션 검색"
        />
        <button
          type="button"
          className="session-index-new"
          onClick={() => requestStartRecords()}
          aria-label="새 세션"
          title="새 세션"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="session-index-sort"
          onClick={toggleGroupMode}
          aria-label={isProjectMode ? "최근 활동순으로 보기" : "작업 폴더별로 보기"}
          title={isProjectMode ? "최근 활동순으로 보기" : "작업 폴더별로 보기"}
        >
          {isProjectMode ? (
            <FolderGit2 size={14} aria-hidden="true" />
          ) : (
            <CalendarClock size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* 라이브 피드 · a destination, not a row of 과거, so it is pinned beside the
          search rather than scrolling away with the list below it. */}
      <section className="session-index-live">
          <button
            type="button"
            className={`session-index-live-head${liveActive ? " is-active" : ""}`}
            onClick={() => onSelectLive()}
          >
            <span
              className={`session-index-live-dot${workingCount > 0 ? "" : " is-idle"}`}
              aria-hidden="true"
            />
            <span className="session-index-live-head-label">라이브 피드</span>
            {workingCount > 0 ? (
              <span className="session-index-live-count">{workingCount}</span>
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
                      <span className="session-index-row-name">{row.title}</span>
                      {row.working ? (
                        <span className="session-index-working">작업 중</span>
                      ) : null}
                    </span>
                    <span className="session-index-row-meta">{row.project}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : bridgeAvailable && !term ? (
            <p className="session-index-hint">지금 실행 중인 세션이 없습니다.</p>
          ) : null}
      </section>

      <div className="session-index-list base-scroll">
        {filteredPast.length === 0 ? (
          <p className="session-index-empty">
            {term
              ? "검색 결과가 없습니다."
              : "아직 지난 세션이 없습니다. Claude · Codex 작업을 연동하면 자동으로 쌓입니다."}
          </p>
        ) : (
          pastGroups.map((group) => (
            <section
              key={`${group.bucket}-${group.label}`}
              className="session-index-group"
            >
              {/* In folder mode a group is the agent's working folder, not a
                  confirmed Mori project; the title says which it is. */}
              <p className="session-index-label" title={isProjectMode ? "에이전트 작업 폴더" : undefined}>
                {isProjectMode ? shortProjectLabel(group.label) : group.label}
              </p>
              <ul>
                {group.rows.map((row) => {
                  const active = !liveActive && selectedPastId === row.sessionId;
                  // One calm signal, never repeating the group: the project in
                  // recency mode, the time in project mode.
                  const meta = isProjectMode
                    ? formatClaudeRelativeKo(row.timestamp)
                    : row.sourceLabel
                      ? shortProjectLabel(row.sourceLabel)
                      : formatClaudeRelativeKo(row.timestamp);
                  return (
                    <li key={row.sessionId}>
                      <button
                        type="button"
                        className={`session-index-row${active ? " is-active" : ""}`}
                        onClick={() => handleSelectPast(row.sessionId)}
                      >
                        <span className="session-index-row-title">
                          <span className="session-index-row-name">{row.title}</span>
                        </span>
                        {meta ? (
                          <span className="session-index-row-meta">{meta}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        {visibleLost.length > 0 ? (
          <details className="session-index-lost">
            <summary className="session-index-label">
              원본 없는 세션 {visibleLost.length}
              <InfoHint label="원본 없는 세션">
                대화 파일이 이 기기에서 사라진 세션입니다(에이전트가 정리했거나 옮겨졌을 수 있습니다). 열면
                Mori가 기록해 둔 내용을 보여 줍니다.
              </InfoHint>
            </summary>
            <ul>
              {visibleLost.map((record) => (
                <li key={record.id}>
                  <button type="button" className="session-index-row" onClick={() => openLost(record.id)}>
                    <span className="session-index-row-title">
                      <span className="session-index-row-name">{record.title || "제목 없음"}</span>
                    </span>
                    <span className="session-index-row-meta">
                      원본 없음
                      {record.occurredEnd || record.occurredStart
                        ? ` · ${formatClaudeRelativeKo(record.occurredEnd ?? record.occurredStart ?? "")}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
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
