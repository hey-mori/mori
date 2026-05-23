import { Archive, FileText, Play, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriFeatureStatusBadge } from "../../components/ui/MoriFeatureStatusBadge";
import type { SavedReportAvailability } from "../../lib/memory/projectMemoryContext";
import type { ProjectMemoryDataScope, ProjectMemoryStats } from "../../lib/project-memory/projectMemory";

export function ProjectMemoryHero({
  projectName,
  projectDescription,
  stats,
  scope,
  scopeLabel,
  onStartFollowUp,
  onOpenLatestReport,
  reportAvailable,
  savedReportAvailability,
}: {
  projectName: string;
  projectDescription: string;
  stats: ProjectMemoryStats;
  scope: ProjectMemoryDataScope;
  scopeLabel: string;
  onStartFollowUp: () => void;
  onOpenLatestReport: () => void;
  reportAvailable: boolean;
  /** Optional — when provided, renders a saved-reports chip from the context. */
  savedReportAvailability?: SavedReportAvailability;
}) {
  return (
    <section className="memory-hero" aria-label="Project overview">
      <header className="memory-hero-head">
        <div>
          <div className="memory-hero-badge-row">
            <Badge tone={scope === "demo" ? "gray" : "green"}>{scopeLabel}</Badge>
            <MoriFeatureStatusBadge feature="memory.crossSessionAggregation" />
            {savedReportAvailability ? (
              <Badge tone={savedReportAvailability.tone}>
                {savedReportAvailability.label}
              </Badge>
            ) : null}
          </div>
          <h2>{projectName}</h2>
          <p>{projectDescription || "이 프로젝트의 설명이 아직 등록되지 않았습니다."}</p>
        </div>
        <div className="memory-hero-actions">
          <Button
            icon={FileText}
            onClick={onOpenLatestReport}
            disabled={!reportAvailable}
            title={reportAvailable ? "최근 리포트 열기" : "아직 생성된 리포트가 없습니다."}
          >
            최근 리포트
          </Button>
          <Button variant="primary" icon={Play} onClick={onStartFollowUp}>
            다음 세션 시작
          </Button>
        </div>
      </header>
      <dl className="memory-hero-stats">
        <StatTile
          label="세션"
          value={stats.sessionCount}
          hint={`${stats.aggregatedSessionCount}건 집계 / ${stats.sessionCount}건 목록`}
          icon={<Archive size={14} aria-hidden="true" />}
        />
        <StatTile label="결정" value={stats.decisionCount} hint={`미확정 ${stats.unconfirmedDecisionCount}건`} />
        <StatTile label="이슈" value={stats.issueCount} hint={`미처리 ${stats.openIssueCount}건`} />
        <StatTile label="증거 출처" value={stats.sourceCount} hint={stats.dataBasis} />
        <StatTile label="보고서" value={stats.reportCount} hint={stats.reportCount === 0 ? ".mori 패키지 없음" : "저장된 패키지"} />
        <StatTile
          label="다음 액션"
          value={stats.nextActionCount}
          hint="현재 세션 기준"
          icon={<Sparkles size={14} aria-hidden="true" />}
        />
      </dl>
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="memory-hero-stat">
      <dt>
        {icon}
        <span>{label}</span>
      </dt>
      <dd>
        <strong>{value}</strong>
        <small>{hint}</small>
      </dd>
    </div>
  );
}
