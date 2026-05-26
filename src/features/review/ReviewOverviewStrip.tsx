import { AlertTriangle, Lightbulb, ShieldCheck } from "lucide-react";
import type { Issue } from "../../domain/types";
import { countIssuePriorities, type ReviewSummary } from "../../lib/review-workspace/reviewWorkspace";
import {
  buildReviewOverviewModel,
  type ReviewAttentionKey,
} from "../../lib/review-workspace/reviewOverview";

const ATTENTION_LABEL: Record<ReviewAttentionKey, string> = {
  unresolvedIssues: "미처리 이슈",
  unconfirmedDecisions: "미확정 결정",
  lowConfidence: "낮은 신뢰도",
};

/**
 * Review main-canvas status strip.
 *
 * Carries the at-a-glance session signal that used to sit in the right rail:
 * what still needs attention, the issue lifecycle breakdown, and the priority
 * distribution. Moving it into the main canvas means the page is
 * self-explanatory without reading the side panel, and the rail can stay a
 * pure context inspector for the selected item. Compact and horizontal — it
 * wraps to a stack on narrow widths.
 */
export function ReviewOverviewStrip({
  summary,
  issues,
  mode,
  hasAnalysis,
}: {
  summary: ReviewSummary;
  issues: Issue[];
  mode: "demo" | "draft";
  hasAnalysis: boolean;
}) {
  // Nothing meaningful to summarize on an unanalysed real session.
  if (mode === "draft" && !hasAnalysis) return null;
  const model = buildReviewOverviewModel({
    summary,
    priorities: countIssuePriorities(issues),
  });
  if (!model.visible) return null;

  return (
    <section className="review-overview" aria-label="검토 현황">
      <div
        className={`review-overview-attention${model.allClear ? " is-clear" : ""}`}
      >
        {model.allClear ? (
          <>
            <ShieldCheck size={16} aria-hidden="true" />
            <div className="review-overview-attention-body">
              <strong>모두 처리됨</strong>
              <span>확인이 필요한 이슈 · 결정이 없습니다.</span>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle size={16} aria-hidden="true" />
            <div className="review-overview-attention-body">
              <strong>검토 필요 {model.attentionTotal}건</strong>
              <span className="review-overview-attention-chips">
                {model.attention.map((item) => (
                  <span key={item.key}>
                    {ATTENTION_LABEL[item.key]} {item.value}
                  </span>
                ))}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="review-overview-segment">
        <span className="review-overview-label">이슈 상태</span>
        <ul className="review-overview-stats">
          <li>
            <span>미처리</span>
            <strong>{model.issueStatus.open}</strong>
          </li>
          <li>
            <span>진행 중</span>
            <strong>{model.issueStatus.inProgress}</strong>
          </li>
          <li>
            <span>해결됨</span>
            <strong>{model.issueStatus.resolved}</strong>
          </li>
          <li>
            <span>관찰</span>
            <strong>{model.issueStatus.watching}</strong>
          </li>
        </ul>
      </div>

      <div className="review-overview-segment">
        <span className="review-overview-label">우선순위</span>
        <div className="review-overview-priority">
          <div className="review-overview-bar" role="img" aria-label="이슈 우선순위 분포">
            <span className="seg seg-high" style={{ width: `${model.priority.highPct}%` }} />
            <span className="seg seg-medium" style={{ width: `${model.priority.mediumPct}%` }} />
            <span className="seg seg-low" style={{ width: `${model.priority.lowPct}%` }} />
          </div>
          <ul className="review-overview-legend">
            <li>
              <i className="legend-dot red" />높음 <strong>{model.priority.high}</strong>
            </li>
            <li>
              <i className="legend-dot orange" />보통 <strong>{model.priority.medium}</strong>
            </li>
            <li>
              <i className="legend-dot blue" />낮음 <strong>{model.priority.low}</strong>
            </li>
          </ul>
        </div>
      </div>

      <p className="review-overview-caption">
        <Lightbulb size={13} aria-hidden="true" />
        <span>확인한 항목은 프로젝트 메모리에 남아 다음 세션에서 다시 쓰입니다.</span>
      </p>
    </section>
  );
}
