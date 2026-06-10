import { useEffect, useMemo, useState } from "react";
import { selectSessionMode, selectSessionView, useSessionStore } from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import { loadProjectMemorySessions } from "../../lib/project-memory/loadProjectMemorySessions";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { getSessionPersistenceService } from "../../lib/storage/sessionPersistenceService";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { adaptLoadedSessionsForTimeline } from "../../lib/project-timeline/adaptLoadedSessions";
import {
  buildProjectTimeline,
  type ProjectTimelineModel,
  type ProjectTimelinePulse,
  type ProjectTimelineSegment,
} from "../../lib/project-timeline/buildProjectTimeline";

/**
 * 프로젝트 타임라인 — the project-scoped temporal view.
 *
 * 흐름 is per-session; this lays every saved session of one project on a shared
 * axis with the empty stretches between them collapsed to a quiet "3일 후"
 * marker, so a user scans a whole project over days and weeks and drills into a
 * session's own 흐름 by clicking its band. Loading reuses the Project Memory
 * loader (runtime-aware, capped); the model and honesty come from the pure
 * `buildProjectTimeline`. Stays quiet (renders nothing) until there is at least
 * one session band to show.
 */
const DATA_BASIS_LABEL: Record<ProjectTimelineModel["dataBasis"], string> = {
  activePlusSavedSessions: "저장된 세션 본문 기준",
  partialSavedSessionLoad: "일부 세션은 메타데이터만",
  savedSessionMetadataOnly: "메타데이터만",
  unavailable: "표시할 세션 없음",
};

export function ProjectTimelineSection({
  projectId,
  sessions,
  onOpenSession,
}: {
  projectId: string | null;
  sessions: StoredSessionSummary[];
  onOpenSession: (sessionId: string) => void;
}) {
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const sqliteSessions = useSqliteStore((state) => state.sessions);
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const [model, setModel] = useState<ProjectTimelineModel | null>(null);
  const [loading, setLoading] = useState(true);

  const projectSqlite = useMemo(
    () => (projectId ? sqliteSessions.filter((entry) => entry.projectId === projectId) : []),
    [sqliteSessions, projectId],
  );
  const projectSessionIds = useMemo(
    () =>
      new Set([
        ...sessions.map((session) => session.sessionId),
        ...projectSqlite.map((session) => session.sessionId),
      ]),
    [sessions, projectSqlite],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const persistenceService = getSessionPersistenceService();
    const desktopLoader = persistenceService.isDesktop()
      ? {
          isDesktop: () => persistenceService.isDesktop(),
          loadSessionFromDesktop: (id: string) => persistenceService.loadSessionFromDesktop(id),
        }
      : null;
    void loadProjectMemorySessions({
      activeSession: view,
      activeIsLive: mode !== "demo",
      repository,
      savedBrowserSessions: sessions,
      savedSqliteSessions: projectSqlite,
      desktopLoader,
    })
      .then((loaded) => {
        if (cancelled) return;
        const inProject = loaded.filter((session) => projectSessionIds.has(session.sessionId));
        setModel(buildProjectTimeline({ sessions: adaptLoadedSessionsForTimeline(inProject) }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `view` identity changes on every event edit; we key on the saved-session
    // set + mode instead so the timeline does not thrash mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, repository, sessions, projectSqlite]);

  if (loading) {
    return <p className="project-timeline-status">타임라인 불러오는 중…</p>;
  }
  if (!model || !model.segments.some((segment) => segment.kind === "session")) {
    return null;
  }

  return (
    <section className="project-timeline" aria-label="프로젝트 타임라인">
      <header className="project-timeline-head">
        <h3>프로젝트 타임라인</h3>
        <span className="project-timeline-basis">{DATA_BASIS_LABEL[model.dataBasis]}</span>
      </header>
      <ProjectPulse pulse={model.pulse} />
      <ol className="project-timeline-track">
        {model.segments.map((segment, index) => (
          <ProjectTimelineBand key={index} segment={segment} onOpen={onOpenSession} />
        ))}
      </ol>
      {model.droppedSessionCount > 0 ? (
        <p className="project-timeline-dropped">
          이전 세션 {model.droppedSessionCount}개는 표시에서 제외됨
        </p>
      ) : null}
    </section>
  );
}

function ProjectPulse({ pulse }: { pulse: ProjectTimelinePulse }) {
  const stats: Array<{ value: number; label: string }> = [
    { value: pulse.sessions, label: "세션" },
    { value: pulse.decisions, label: "결정" },
    { value: pulse.issuesOpen, label: "열린 이슈" },
    { value: pulse.issuesResolved, label: "해결" },
  ];
  return (
    <div className="project-timeline-pulse">
      {stats.map((stat) => (
        <span key={stat.label} className="project-timeline-stat">
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </span>
      ))}
      {pulse.spanLabel ? <span className="project-timeline-span">{pulse.spanLabel}</span> : null}
    </div>
  );
}

function ProjectTimelineBand({
  segment,
  onOpen,
}: {
  segment: ProjectTimelineSegment;
  onOpen: (sessionId: string) => void;
}) {
  if (segment.kind === "gap") {
    return (
      <li className="project-timeline-gap" aria-hidden="true">
        <span>· {segment.label} ·</span>
      </li>
    );
  }
  return (
    <li className={`project-timeline-band${segment.partial ? " is-partial" : ""}`}>
      <button
        type="button"
        className="project-timeline-band-btn"
        onClick={() => onOpen(segment.id)}
        title={`${segment.title} · 흐름 열기`}
      >
        <span className="project-timeline-band-head">
          <strong>{segment.title}</strong>
          <span className="project-timeline-band-date">{formatBandDate(segment.startIso)}</span>
        </span>
        {segment.lanes.length > 0 ? (
          <span className="project-timeline-lanes">
            {segment.lanes.map((lane) => (
              <span key={lane.lane} className={`project-timeline-lane tone-${lane.tone}`}>
                {lane.label} {lane.count}
              </span>
            ))}
          </span>
        ) : null}
        <span className="project-timeline-band-meta">
          이벤트 {segment.eventCount} · 결정 {segment.decisionCount} · 열린 이슈 {segment.openIssueCount}
        </span>
      </button>
    </li>
  );
}

function formatBandDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}
