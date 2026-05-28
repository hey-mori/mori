import type { ReactNode } from "react";
import type { ContributionGrid } from "../../lib/home/contributionGrid";
import { ContributionHeatmap } from "./ContributionHeatmap";
import { MoriMetricStrip, type MoriMetricItem } from "../ui/MoriMetricStrip";

/**
 * "작업 활동" panel — the full activity card shared by Home and the project page.
 *
 * Previously only the heatmap *grid* was shared, so the surrounding chrome
 * (title size, header, stat-strip styling) drifted between the two surfaces.
 * This owns the whole section — header, the contribution heatmap, and the stat
 * strip — using the `.home-activity*` classes so both surfaces render an
 * identical card. Callers vary only the data: Home passes the lens toggle and
 * five metrics; the project page passes four (no 프로젝트) and no toggle.
 */
export function WorkActivityCard({
  grid,
  stats,
  controls,
  sub,
  title = "작업 활동",
}: {
  grid: ContributionGrid;
  stats: MoriMetricItem[];
  /** Right-aligned header slot, e.g. the metric lens toggle. */
  controls?: ReactNode;
  /** Short header subtitle, e.g. "최근 18주 · 활동 14일". */
  sub?: ReactNode;
  title?: string;
}) {
  return (
    <section className="home-activity" aria-label={title}>
      <header className="home-activity-head">
        <h2>{title}</h2>
        {controls || sub ? (
          <div className="home-activity-controls">
            {controls}
            {sub ? <span className="home-activity-sub">{sub}</span> : null}
          </div>
        ) : null}
      </header>
      <ContributionHeatmap grid={grid} />
      {stats.length > 0 ? (
        <MoriMetricStrip className="home-activity-stats" items={stats} />
      ) : null}
    </section>
  );
}
