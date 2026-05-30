import { Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { SectionHeader } from "../../components/ui/SectionHeader";
import type { ImportReviewDraft } from "../../lib/review";

/**
 * Right-side "Generated items" panel.
 *
 * Today Mori's normalizers do not extract issues, decisions, or next actions
 * during import — those records are produced by Quick Pass running across
 * the *whole* session. The reference design still shows that section so the
 * user knows it exists and so the layout reads as a complete review screen.
 * We render an honest, empty-by-design panel and direct the user to run
 * Quick Pass after applying the review.
 */
export function GeneratedItemsPanel({ draft }: { draft: ImportReviewDraft }) {
  const issueCount = draft.issues.length;
  const decisionCount = draft.decisions.length;
  const nextActionCount = draft.nextActions.length;
  const allEmpty = issueCount === 0 && decisionCount === 0 && nextActionCount === 0;

  return (
    <aside className="review-generated" aria-label="생성된 항목">
      <header className="review-generated-head">
        <h3>생성된 항목</h3>
        <p>이슈 · 결정 · 다음 액션은 적용 후 Quick Pass에서 만들어집니다.</p>
      </header>

      <section className="review-generated-section">
        <SectionHeader title="이슈" hint={`${issueCount}건`} />
        <EmptyOrList kind="issues" count={issueCount} />
      </section>

      <section className="review-generated-section">
        <SectionHeader title="결정" hint={`${decisionCount}건`} />
        <EmptyOrList kind="decisions" count={decisionCount} />
      </section>

      <section className="review-generated-section">
        <SectionHeader title="다음 액션" hint={`${nextActionCount}건`} />
        <EmptyOrList kind="next-actions" count={nextActionCount} />
      </section>

      {allEmpty ? (
        <footer className="review-generated-footer">
          <Sparkles size={14} aria-hidden="true" />
          <p>
            현재 가져오기 단계에서는 이벤트 후보만 추출됩니다. 적용 후 자료 탭에서
            <strong> Quick Pass 실행</strong>을 누르면 이 세션 전체에 대한 이슈 · 결정 · 다음 액션
            후보를 만들 수 있습니다.
          </p>
        </footer>
      ) : null}
    </aside>
  );
}

function EmptyOrList({ kind, count }: { kind: string; count: number }) {
  if (count === 0) {
    return (
      <div className="review-generated-empty">
        <Badge tone="gray">아직 생성된 항목 없음</Badge>
        <small>이 가져오기 단계에서는 {labelFor(kind)} 후보를 만들지 않습니다.</small>
      </div>
    );
  }
  return null;
}

function labelFor(kind: string): string {
  switch (kind) {
    case "issues":
      return "이슈";
    case "decisions":
      return "결정";
    case "next-actions":
      return "다음 액션";
    default:
      return "관련 항목";
  }
}
