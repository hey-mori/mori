import type { KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";
import type { HomeCurrentSession } from "../../lib/home/homeOverview";

/** One concrete carry-forward item listed on the focal card. */
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
 * The focal continuation card — Home's centrepiece.
 *
 * The whole card is the action: clicking it resumes the most recent work
 * session. No separate CTA button, no chrome labels — just the session, its
 * project and time, and the concrete work it carries forward as a calm list of
 * titles (a kind-coloured dot is the only marker). This is the honest answer to
 * "show my latest work prominently": the most recent session, refreshed when new
 * work is imported, never a fabricated live ticker.
 */
export function HomeFocalCard({
  focal,
  carry,
  carryMore,
  onResume,
}: {
  focal: HomeCurrentSession;
  carry: HomeCarryEntry[];
  carryMore: number;
  onResume: (sessionId: string, kind: "resume" | "open") => void;
}) {
  const open = () => onResume(focal.sessionId, focal.action.kind);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };

  return (
    <article
      className="home-focal"
      role="button"
      tabIndex={0}
      aria-label={`${focal.title} 이어가기`}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <div className="home-focal-top">
        <div className="home-focal-lead">
          <span className="home-focal-eyebrow">이어서 작업하기</span>
          <h2 className="home-focal-title">{focal.title}</h2>
          <div className="home-focal-meta">
            {focal.projectLabel ? <span>{shortProject(focal.projectLabel)}</span> : null}
            <span>{focal.relativeTime}</span>
          </div>
        </div>
        <ArrowRight className="home-focal-arrow" size={18} aria-hidden="true" />
      </div>

      {carry.length > 0 ? (
        <ul className="home-focal-carry-list">
          {carry.map((item) => (
            <li
              key={item.key}
              className={`home-focal-carry-item kind-${item.kind}`}
              title={CARRY_LABEL[item.kind]}
            >
              <span className="home-focal-carry-dot" aria-hidden="true" />
              <span className="home-focal-carry-text">{item.text}</span>
            </li>
          ))}
          {carryMore > 0 ? (
            <li className="home-focal-carry-more">+{carryMore}개 더</li>
          ) : null}
        </ul>
      ) : null}
    </article>
  );
}
