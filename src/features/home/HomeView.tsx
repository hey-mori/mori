import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, FolderKanban, Layers, PlugZap } from "lucide-react";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useMoriAppStore } from "../../app/store";
import {
  loadStoredSessionSummaries,
  selectSessionMode,
  useMoriSessionStore,
} from "../../app/sessionStore";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { useMoriProfileStore } from "../../app/profileStore";

/**
 * Home — the session-centric landing surface.
 *
 * This is the **skeleton** for the rebuilt information architecture: a calm
 * "내 작업 기억" landing that orients the user the moment Mori opens, points
 * them at the two primary entry actions (가져오기 / 리포트), and lists their
 * most recent captured sessions. The richer dashboard content (memory at a
 * glance, resume nudges) lands in a later step — this view deliberately ships
 * only an honest skeleton.
 *
 * No fake data: recent sessions come from `loadStoredSessionSummaries`. When
 * there is nothing real to show, the surface falls back to an honest empty
 * state that nudges the user toward 연결 (the import front door).
 */
const RECENT_LIMIT = 5;

export function HomeView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);
  const mode = useMoriSessionStore(selectSessionMode);
  const displayName = useMoriProfileStore((state) => state.profile.displayName);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const [sessions, setSessions] = useState<StoredSessionSummary[]>([]);
  useEffect(() => {
    try {
      setSessions(loadStoredSessionSummaries());
    } catch {
      // The landing surface must never break the shell — fail closed to empty.
      setSessions([]);
    }
  }, [initialized]);

  const recent = useMemo(
    () =>
      sessions
        .filter((session) => !session.archivedAt)
        .slice(0, RECENT_LIMIT),
    [sessions],
  );
  const hasSessions = recent.length > 0;

  const openSession = (session: StoredSessionSummary) => {
    if (loadBrowserSession(session.sessionId)) {
      setCurrentView("timeline");
    }
  };

  return (
    <PageShell
      className="home-page"
      header={null}
      actionBar={
        <ActionBar
          label="홈"
          start={
            <span className="home-greeting">
              <strong>{displayName}님의 작업 기억</strong>
              <Badge tone={mode === "demo" ? "gray" : "green"}>
                {mode === "demo" ? "데모 세션" : "실제 세션"}
              </Badge>
            </span>
          }
          end={
            <>
              <Button icon={PlugZap} onClick={() => setCurrentView("connections")}>
                가져오기
              </Button>
              <Button icon={FileText} onClick={() => setCurrentView("reports")}>
                리포트
              </Button>
            </>
          }
        />
      }
      maxWidth="default"
    >
      <section className="home-intro" aria-label="Mori 소개">
        <p className="home-intro-lead">
          AI 에이전트로 한 작업을 이해 가능하고 지속되는 작업 기억으로 바꿉니다.
          가져온 작업은 세션으로 쌓이고, 메모리로 종합되어 다음 작업으로 이어집니다.
        </p>
      </section>

      <section className="home-section" aria-label="최근 세션">
        <header className="home-section-head">
          <h2>최근 세션</h2>
          {hasSessions ? (
            <button
              type="button"
              className="home-section-link"
              onClick={() => setCurrentView("workspace")}
            >
              전체 세션 <ArrowRight size={13} aria-hidden="true" />
            </button>
          ) : null}
        </header>

        {hasSessions ? (
          <ul className="home-session-list">
            {recent.map((session) => (
              <li key={session.sessionId}>
                <button
                  type="button"
                  className="home-session-row"
                  onClick={() => openSession(session)}
                  title={session.title}
                >
                  <span className="home-session-icon" aria-hidden="true">
                    <FolderKanban size={15} />
                  </span>
                  <span className="home-session-body">
                    <span className="home-session-title">{session.title}</span>
                    <span className="home-session-meta">
                      {session.sourceLabel?.trim() || "수동 세션"}
                    </span>
                  </span>
                  <time className="home-session-time">
                    {formatRelativeKo(session.startedAt || session.savedAt)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Layers}
            title="아직 작업 기억이 없습니다"
            description="연결에서 Claude 대화를 가져오면 세션이 쌓이고, 여기에 최근 작업이 한눈에 표시됩니다."
            actions={
              <Button
                variant="primary"
                icon={PlugZap}
                onClick={() => setCurrentView("connections")}
              >
                연결에서 작업 가져오기
              </Button>
            }
          />
        )}
      </section>
    </PageShell>
  );
}

/** Compact Korean relative-time label for the recent-session rows. */
function formatRelativeKo(iso: string, now: number = Date.now()): string {
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) return "";
  const diff = now - epoch;
  if (diff < 0) return new Date(epoch).toLocaleDateString();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(epoch).toLocaleDateString();
}
