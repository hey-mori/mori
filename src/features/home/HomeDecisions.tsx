import { GitBranch, ArrowRight } from "lucide-react";
import { BaseObjectRow } from "../../components/ui/BaseObjectRow";
import { BaseMetadataLine } from "../../components/ui/BaseMetadataLine";

/** One remembered decision shown in the right rail. */
export type HomeDecisionItem = {
  id: string;
  title: string;
  projectLabel: string | null;
  sessionId: string;
  /** Relative-time label for the decision ("3시간 전" / "5월 21일"). */
  timeLabel: string;
};

/**
 * "최근 결정" — the memory rail beside the continuation column.
 *
 * Decisions are Mori's durable value ("what was decided, and why it mattered"),
 * so the landing shows the most recent ones across sessions. Rendered with the
 * shared `BaseObjectRow` so the row format matches every other object list in
 * the app (icon · title · "프로젝트 · 시간" · arrow). Opening a row jumps to its
 * session.
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
        <ul className="home-rail-list">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <BaseObjectRow
                density="compact"
                leading={<GitBranch size={15} aria-hidden="true" />}
                title={decision.title}
                meta={
                  <BaseMetadataLine
                    items={[decision.projectLabel, decision.timeLabel]}
                  />
                }
                trailing={<ArrowRight size={14} aria-hidden="true" />}
                onClick={() => onOpen(decision.sessionId)}
                ariaLabel={decision.title}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-rail-empty">
          분석을 실행하면 세션에서 정리된 결정이 여기에 쌓입니다.
        </p>
      )}
    </section>
  );
}
