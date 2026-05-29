import { GitBranch } from "lucide-react";

/** One remembered decision shown in the right rail. */
export type HomeDecisionItem = {
  id: string;
  title: string;
  projectLabel: string | null;
  sessionId: string;
  /** Unconfirmed decisions still want a review pass — flagged subtly. */
  pending: boolean;
};

/**
 * "최근 결정" — the memory rail beside the continuation column.
 *
 * Decisions are Mori's durable value ("what was decided, and why it mattered"),
 * so the landing shows the most recent ones across sessions as a calm, compact
 * list. Distinct from the continuation column (which resumes work) and from the
 * sidebar (sessions) / 대시보드 (numbers). Opening a row jumps to that session.
 */
export function HomeDecisions({
  decisions,
  onOpen,
}: {
  decisions: HomeDecisionItem[];
  onOpen: (sessionId: string) => void;
}) {
  return (
    <section className="home-memory" aria-label="최근 결정">
      <header className="home-memory-head">
        <h2>최근 결정</h2>
      </header>

      {decisions.length > 0 ? (
        <ul className="home-memory-list">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <button
                type="button"
                className="home-memory-row"
                onClick={() => onOpen(decision.sessionId)}
              >
                <span className="home-memory-row-icon" aria-hidden="true">
                  <GitBranch size={14} />
                </span>
                <span className="home-memory-row-body">
                  <span className="home-memory-row-title">{decision.title}</span>
                  <span className="home-memory-row-meta">
                    {decision.projectLabel ? <span>{decision.projectLabel}</span> : null}
                    {decision.pending ? (
                      <span className="home-memory-row-pending">검토 대기</span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-memory-empty">
          분석을 실행하면 세션에서 정리된 결정이 여기에 쌓입니다.
        </p>
      )}
    </section>
  );
}
