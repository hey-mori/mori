import { MetricCard } from "../../components/ui/MetricCard";
import { Badge } from "../../components/ui/Badge";
import type { SessionSource } from "../../app/sessionStore";
import type { MoriAnalysisResult } from "../../lib/analysis";
import type { MoriMockSession } from "../../domain/types";
import { summarizeTimelineRange } from "../../lib/timeline/timeScale";

export function TimelineHeader({
  view,
  source,
  analysis,
}: {
  view: MoriMockSession;
  source: SessionSource;
  analysis: MoriAnalysisResult | null;
}) {
  const summary = summarizeTimelineRange({
    start: view.session.startedAt,
    end: view.session.endedAt,
  });
  const sourceBadge = describeSource(source);
  const analysisBadge = describeAnalysis(analysis);
  const openIssues = view.issues.filter((issue) => issue.status !== "resolved").length;

  return (
    <header className="timeline-header" role="region" aria-label="Timeline overview">
      <div className="timeline-header-top">
        <div>
          <h2>{view.session.title}</h2>
          <div className="timeline-header-badges">
            <Badge tone={sourceBadge.tone}>{sourceBadge.label}</Badge>
            <Badge tone={analysisBadge.tone}>{analysisBadge.label}</Badge>
          </div>
        </div>
        <div className="timeline-header-time">
          <span>{summary.startLabel}</span>
          <span aria-hidden="true">→</span>
          <span>{summary.endLabel}</span>
          <small>· {summary.durationLabel}</small>
        </div>
      </div>
      <div className="timeline-header-metrics">
        <MetricCard label="Events" value={view.events.length} hint="Imported + analyzed" />
        <MetricCard label="Sources" value={view.sources.length} hint="Verified evidence inputs" />
        <MetricCard label="Open issues" value={openIssues} hint="Status !== resolved" tone={openIssues ? "accent" : "muted"} />
        <MetricCard label="Decisions" value={view.decisions.length} hint="Captured by Quick Pass or imports" />
      </div>
    </header>
  );
}

function describeSource(source: SessionSource): { label: string; tone: string } {
  if (source === "demo") return { label: "Demo session", tone: "orange" };
  if (source === "desktop-sqlite") return { label: "Desktop SQLite", tone: "green" };
  return { label: "Browser draft", tone: "blue" };
}

function describeAnalysis(analysis: MoriAnalysisResult | null): { label: string; tone: string } {
  if (!analysis) return { label: "No analysis yet", tone: "gray" };
  if (analysis.providerName === "ollama-quick-pass-v1") {
    return { label: "Ollama Quick Pass", tone: "purple" };
  }
  return { label: "Deterministic Quick Pass", tone: "blue" };
}
