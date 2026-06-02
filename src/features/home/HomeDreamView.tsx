import { useEffect, useMemo } from "react";
import { ArrowRight, Plus, Search, Sparkles } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { useAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { formatRelativeKo } from "../../lib/home/homeOverview";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import "../../styles/features/home-dream.css";

const SESSION_LIMIT = 8;

export function HomeDreamView() {
  const navigate = useAppStore((state) => state.navigate);
  const openCommandPalette = useAppStore((state) => state.openCommandPalette);
  const openSession = useAppStore((state) => state.openSession);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const mode = useSessionStore(selectSessionMode);
  const view = useSessionStore(selectSessionView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const activeSessionId = view.session.id;
  const { sessions, focal, projectCount } = useMemo(() => {
    if (!initialized) return { sessions: [], focal: null, projectCount: 0 };

    let realSessions: StoredSessionSummary[] = [];
    try {
      realSessions = loadStoredSessionSummaries();
    } catch {
      realSessions = [];
    }

    const allSessions = mergeDemoSessionSummaries(realSessions)
      .slice()
      .sort((a, b) => anchorTime(b) - anchorTime(a));
    const current =
      mode === "demo"
        ? null
        : (allSessions.find((session) => session.sessionId === activeSessionId) ?? null);
    const limited = allSessions.slice(0, SESSION_LIMIT);

    return {
      sessions: limited,
      focal: current ?? allSessions[0] ?? null,
      projectCount: countProjects(limited),
    };
  }, [activeSessionId, initialized, mode]);

  function openFocal(): void {
    if (!focal) {
      navigate("start");
      return;
    }

    openSessionById(focal.sessionId);
  }

  function openSessionById(sessionId: string): void {
    const ready = sessionId === activeSessionId || loadBrowserSession(sessionId);
    if (ready) openSession("flow");
  }

  const dateLabel = formatToday();
  const hasWork = Boolean(focal);

  return (
    <PageShell className="home-dream-page" maxWidth="wide">
      <section className="home-dream" aria-label="홈">
        <div className="home-dream-atmosphere" aria-hidden="true">
          <span className="home-dream-horizon" />
          <span className="home-dream-sweep" />
          <span className="home-dream-breath one" />
          <span className="home-dream-breath two" />
        </div>

        <main className="home-dream-board">
          <header className="home-dream-board-head">
            <span className="home-dream-kicker">
              <Sparkles size={13} aria-hidden="true" />
              {dateLabel}
            </span>
            <h1>오늘</h1>
            <div className="home-dream-counts" aria-label="기억 요약">
              <span>{sessions.length} 흐름</span>
              <span>{projectCount} 프로젝트</span>
            </div>
          </header>

          <section className="home-dream-focus" aria-label="바로 이어가기">
            <span className="home-dream-focus-label">{hasWork ? "계속 작업" : "시작"}</span>
            <h2>{focal?.title ?? "새 세션 만들기"}</h2>
            {focal ? (
              <p>{`${shortProject(focal.sourceLabel) ?? "mori"} · ${formatRelativeKo(anchorIso(focal))}`}</p>
            ) : null}
            <button className="home-dream-primary" onClick={openFocal}>
              {hasWork ? "열기" : "시작"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>

          <section className="home-dream-quick" aria-label="빠른 작업">
            <button className="home-dream-quick-button" onClick={() => navigate("start")}>
              <Plus size={15} aria-hidden="true" />
              새 세션
            </button>
            <button className="home-dream-quick-button" onClick={openCommandPalette}>
              <Search size={15} aria-hidden="true" />
              찾기
            </button>
          </section>

          {sessions.length > 0 ? (
            <section className="home-dream-recent" aria-label="최근 흐름">
              {sessions.slice(0, 4).map((session) => (
                <button
                  key={session.sessionId}
                  className="home-dream-recent-item"
                  onClick={() => openSessionById(session.sessionId)}
                >
                  <strong>{session.title}</strong>
                  <small>
                    {shortProject(session.sourceLabel) ?? "mori"} ·{" "}
                    {formatRelativeKo(anchorIso(session))}
                  </small>
                </button>
              ))}
            </section>
          ) : null}
        </main>
      </section>
    </PageShell>
  );
}

function formatToday(now: number = Date.now()): string {
  const date = new Date(now);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일`;
}

function shortProject(label: string | undefined | null): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1]! : trimmed;
  return tail.length <= 20 ? tail : `${tail.slice(0, 19)}…`;
}

function countProjects(sessions: StoredSessionSummary[]): number {
  const keys = new Set<string>();
  for (const session of sessions) {
    keys.add(shortProject(session.sourceLabel) ?? session.projectId);
  }
  return keys.size;
}

function anchorIso(session: StoredSessionSummary): string {
  return session.startedAt || session.savedAt;
}

function anchorTime(session: StoredSessionSummary): number {
  return new Date(anchorIso(session)).getTime();
}
