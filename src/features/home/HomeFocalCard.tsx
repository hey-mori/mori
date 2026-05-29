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
 * A full-width, slightly elevated card that resumes the most recent work
 * session, leading with the concrete context it carries forward (the actual
 * pending next actions, decisions to confirm, open issues — by title, in a
 * two-column list that fills the width). The single brand CTA is the page's
 * primary action. This is the honest answer to "show my latest work
 * prominently": the most recent session, refreshed whenever new work is
 * imported, never a fabricated live ticker.
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
  return (
    <article className="home-focal">
      <div className="home-focal-top">
        <div className="home-focal-lead">
          <span className="home-focal-eyebrow">이어서 작업하기</span>
          <h2 className="home-focal-title">{focal.title}</h2>
          <div className="home-focal-meta">
            {focal.projectLabel ? <span>{shortProject(focal.projectLabel)}</span> : null}
            <span>{focal.relativeTime}</span>
            <span className={`home-focal-status tone-${focal.statusTone}`}>
              {focal.statusLabel}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="home-focal-cta"
          onClick={() => onResume(focal.sessionId, focal.action.kind)}
        >
          {focal.action.label}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>

      {carry.length > 0 ? (
        <div className="home-focal-carry">
          <span className="home-focal-carry-label">가져갈 컨텍스트</span>
          <ul className="home-focal-carry-list">
            {carry.map((item) => (
              <li key={item.key} className={`home-focal-carry-item kind-${item.kind}`}>
                <span className="home-focal-carry-dot" aria-hidden="true" />
                <span className="home-focal-carry-text">{item.text}</span>
                <span className="home-focal-carry-kind">{CARRY_LABEL[item.kind]}</span>
              </li>
            ))}
            {carryMore > 0 ? (
              <li className="home-focal-carry-more">+{carryMore}개 더</li>
            ) : null}
          </ul>
        </div>
      ) : (
        <p className="home-focal-empty">아직 정리된 컨텍스트가 없어요. 열어서 분석을 시작하세요.</p>
      )}
    </article>
  );
}
