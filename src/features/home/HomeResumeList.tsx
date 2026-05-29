import { ArrowRight, FolderGit2 } from "lucide-react";
import type { HomeRecentSession } from "../../lib/home/homeOverview";

/**
 * "이어갈 다른 작업" — the secondary resumable sessions beside the memory rail.
 *
 * Lighter, compact rows for the next sessions worth picking back up after the
 * focal card. Continuation-framed (opening a row resumes that session), so it
 * never reads as a duplicate of the sidebar's raw session list.
 */
export function HomeResumeList({
  sessions,
  onOpen,
}: {
  sessions: HomeRecentSession[];
  onOpen: (sessionId: string) => void;
}) {
  return (
    <section className="home-resume" aria-label="이어갈 다른 작업">
      <header className="home-resume-head">
        <h2>이어갈 다른 작업</h2>
      </header>
      <ul className="home-resume-list">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <button
              type="button"
              className="home-resume-row"
              onClick={() => onOpen(session.sessionId)}
            >
              <span className="home-resume-row-icon" aria-hidden="true">
                <FolderGit2 size={15} />
              </span>
              <span className="home-resume-row-title">{session.title}</span>
              <span className="home-resume-row-meta">
                {session.projectLabel ? <span>{session.projectLabel}</span> : null}
                <span>{session.relativeTime}</span>
              </span>
              <ArrowRight size={14} aria-hidden="true" className="home-resume-row-arrow" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
