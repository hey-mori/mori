import { ArrowRight, FolderGit2 } from "lucide-react";
import type {
  HomeCurrentSession,
  HomeRecentSession,
} from "../../lib/home/homeOverview";

/** One concrete carry-forward item shown on the focal card. */
export type HomeCarryEntry = {
  key: string;
  kind: "next" | "decision" | "issue";
  text: string;
};

const CARRY_LABEL: Record<HomeCarryEntry["kind"], string> = {
  next: "할 일",
  decision: "결정",
  issue: "이슈",
};

/** Trailing path segment of a source label, e.g. "C:/dev/ng-gw" → "ng-gw". */
function shortProject(label: string): string {
  const parts = label.split(/[\\/]/).filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1]! : label;
  return tail.length <= 22 ? tail : `${tail.slice(0, 21)}…`;
}

/**
 * "이어갈 작업" — Home's focal continuation surface.
 *
 * One prominent card resumes the most recent work session, leading with the
 * concrete context it carries into the next run — the actual pending next
 * actions, decisions to confirm, and open issues, not just counts. Lighter rows
 * below offer the next resumable sessions. Continuation-framed throughout: every
 * row's payoff is "pick this back up", the whole point of a work-memory app.
 */
export function HomeContinuation({
  focal,
  carry,
  carryMore,
  others,
  onResume,
}: {
  focal: HomeCurrentSession;
  carry: HomeCarryEntry[];
  carryMore: number;
  others: HomeRecentSession[];
  onResume: (sessionId: string, kind: "resume" | "open") => void;
}) {
  return (
    <section className="home-continue" aria-label="이어갈 작업">
      <header className="home-continue-head">
        <h2>이어갈 작업</h2>
      </header>

      <article className="home-continue-card">
        <div className="home-continue-meta">
          {focal.projectLabel ? <span>{shortProject(focal.projectLabel)}</span> : null}
          <span>{focal.relativeTime}</span>
          <span className={`home-continue-status tone-${focal.statusTone}`}>
            {focal.statusLabel}
          </span>
        </div>

        <h3 className="home-continue-title">{focal.title}</h3>

        {carry.length > 0 ? (
          <div className="home-continue-carry">
            <span className="home-continue-carry-label">가져갈 컨텍스트</span>
            <ul className="home-continue-carry-list">
              {carry.map((item) => (
                <li key={item.key} className={`home-continue-carry-item kind-${item.kind}`}>
                  <span className="home-continue-carry-dot" aria-hidden="true" />
                  <span className="home-continue-carry-text">{item.text}</span>
                  <span className="home-continue-carry-kind">{CARRY_LABEL[item.kind]}</span>
                </li>
              ))}
              {carryMore > 0 ? (
                <li className="home-continue-carry-more">+{carryMore}개 더</li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="home-continue-empty">아직 정리된 컨텍스트가 없어요. 열어서 분석을 시작하세요.</p>
        )}

        <button
          type="button"
          className="home-continue-cta"
          onClick={() => onResume(focal.sessionId, focal.action.kind)}
        >
          {focal.action.label}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </article>

      {others.length > 0 ? (
        <ul className="home-continue-others">
          {others.map((session) => (
            <li key={session.sessionId}>
              <button
                type="button"
                className="home-continue-other"
                onClick={() => onResume(session.sessionId, "open")}
              >
                <span className="home-continue-other-icon" aria-hidden="true">
                  <FolderGit2 size={15} />
                </span>
                <span className="home-continue-other-title">{session.title}</span>
                <span className="home-continue-other-meta">
                  {session.projectLabel ? <span>{session.projectLabel}</span> : null}
                  <span>{session.relativeTime}</span>
                </span>
                <ArrowRight size={14} aria-hidden="true" className="home-continue-other-arrow" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
