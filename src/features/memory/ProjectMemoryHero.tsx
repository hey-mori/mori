import { Archive, FileText, Play } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseFeatureStatusBadge } from "../../components/ui/BaseFeatureStatusBadge";
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
    <section className="memory-hero" aria-label="프로젝트 개요">
      <header className="memory-hero-head">
        <div>
          <div className="memory-hero-badge-row">
            <Badge tone={scope === "demo" ? "gray" : "green"}>{scopeLabel}</Badge>
            <BaseFeatureStatusBadge feature="memory.crossSessionAggregation" />
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
            title={reportAvailable ? "최근 보고서 열기" : "아직 생성된 보고서가 없습니다."}
          >
            최근 보고서
          </Button>
          <Button variant="primary" icon={Play} onClick={onStartFollowUp}>
            다음 세션 시작
          </Button>
        </div>
      </header>
      {/* Memory is durable understanding: lead with decisions and unresolved
          issues, plus how many sessions feed them. Sources / reports / next
          actions live on their own surfaces and only added density here. */}
      <dl className="memory-hero-stats">
        <StatTile label="결정" value={stats.decisionCount} hint={`미확정 ${stats.unconfirmedDecisionCount}건`} />
        <StatTile label="이슈" value={stats.issueCount} hint={`미처리 ${stats.openIssueCount}건`} />
        <StatTile
          label="세션"
          value={stats.sessionCount}
          hint={`${stats.aggregatedSessionCount}건 집계 / ${stats.sessionCount}건 목록`}
          icon={<Archive size={14} aria-hidden="true" />}
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
