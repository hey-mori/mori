import { ArrowRight } from "lucide-react";
import { InfoHint } from "../../components/ui/InfoHint";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";
import type {
  ProjectSignalStatus,
  ProjectStateSummary,
} from "../../lib/project/projectStateSummary";

/**
 * Project "현재 상황" strip — the Summary glance above the session list.
 *
 * Presentational only: it renders the already-derived `ProjectStateSummary`
 * (see `buildProjectStateSummary`). It answers two questions at a glance, with
 * no chart and no competing card: what in this project is waiting for me, and
 * what changed most recently. A calm status dot carries the state; the facts
 * line and the single clickable "최근" row carry the rest.
 *
 * It stays honest about its reach: the InfoHint says the summary is computed
 * from saved sessions, not a live tracker, and the component renders nothing
 * for a quiet project so a calm workspace shows no band at all.
 */

type StatusMeta = {
  label: string;
  tone: "neutral" | "info" | "warning" | "danger";
};

const STATUS_META: Record<ProjectSignalStatus, StatusMeta> = {
  quiet: { label: "조용함", tone: "neutral" },
  active: { label: "최근 활동", tone: "info" },
  needsAttention: { label: "확인 필요", tone: "warning" },
  riskDetected: { label: "위험", tone: "danger" },
  blocked: { label: "막힘", tone: "danger" },
};

export function ProjectStateStrip({
  summary,
  onOpenSession,
}: {
  summary: ProjectStateSummary;
  onOpenSession: (sessionId: string, tab: "flow" | "insights") => void;
}) {
  if (!summary.hasContent || !summary.latest) return null;

  const meta = STATUS_META[summary.signalStatus];
  const latest = summary.latest;
  const latestNeedsReview = latest.reviewItemCount > 0;

  return (
    <section
      className="project-state-strip"
      data-tone={meta.tone}
      aria-label="현재 상황"
    >
      <div className="project-state-lead">
        <span className="project-state-dot" aria-hidden="true" />
        <span className="project-state-status">{meta.label}</span>
        <h2 className="project-state-heading">현재 상황</h2>
        <InfoHint label="현재 상황 설명">
          이 프로젝트의 저장된 세션에서 바로 계산한 요약입니다. 실시간 추적이
          아니라, 확인이 필요한 세션과 최근 활동을 한눈에 보여줍니다.
        </InfoHint>
      </div>

      <p className="project-state-facts">{composeFacts(summary)}</p>

      <button
        type="button"
        className="project-state-latest"
        onClick={() =>
          onOpenSession(latest.sessionId, latestNeedsReview ? "insights" : "flow")
        }
        title={latest.title}
      >
        <span className="project-state-latest-label">최근</span>
        <span className="project-state-latest-title">{latest.title}</span>
        <span className="project-state-latest-meta">
          {formatSidebarRelative(latest.timestamp)}
          {latestNeedsReview ? ` · 검토 ${latest.reviewItemCount}건 대기` : ""}
        </span>
        <ArrowRight size={13} aria-hidden="true" />
      </button>
    </section>
  );
}

/**
 * Compose the calm facts sentence from the honest counts. Leads with what the
 * user has to act on (확인 필요), then recent movement, then the review backlog;
 * falls back to the bare session count so the line is never empty.
 */
function composeFacts(summary: ProjectStateSummary): string {
  const parts: string[] = [];
  if (summary.needsReviewSessions > 0) {
    parts.push(`확인 필요 ${summary.needsReviewSessions}개`);
  }
  if (summary.recentlyActiveSessions > 0) {
    parts.push(`최근 활동 ${summary.recentlyActiveSessions}개`);
  }
  if (summary.reviewItemCount > 0) {
    parts.push(`검토 항목 ${summary.reviewItemCount}건`);
  }
  if (parts.length === 0) {
    parts.push(`세션 ${summary.totalSessions}개`);
  }
  return parts.join(" · ");
}
