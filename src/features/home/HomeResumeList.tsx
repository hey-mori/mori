import { ArrowRight, FolderGit2 } from "lucide-react";
import { BaseObjectRow } from "../../components/ui/BaseObjectRow";
import { BaseMetadataLine } from "../../components/ui/BaseMetadataLine";
import type { HomeRecentSession } from "../../lib/home/homeOverview";

/**
 * "이어갈 다른 작업" — the secondary resumable sessions beside the memory rail.
 *
 * Rendered with the shared `BaseObjectRow` so the row format is identical to the
 * memory rail and the rest of the app's object lists (icon · title · "프로젝트 ·
 * 시간" · arrow). Continuation-framed: opening a row resumes that session.
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
      <ul className="home-rail-list">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <BaseObjectRow
              density="compact"
              leading={<FolderGit2 size={15} aria-hidden="true" />}
              title={session.title}
              meta={
                <BaseMetadataLine
                  items={[session.projectLabel, session.relativeTime]}
                />
              }
              trailing={<ArrowRight size={14} aria-hidden="true" />}
              onClick={() => onOpen(session.sessionId)}
              ariaLabel={session.title}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
