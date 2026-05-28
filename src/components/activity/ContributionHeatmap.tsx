import type { ContributionGrid, ContributionMetric } from "../../lib/home/contributionGrid";
import { formatCompactCount } from "../../lib/home/homeOverview";

/**
 * Contribution heatmap (the "잔디") — a GitHub-style activity grid.
 *
 * Shared between the Home dashboard and the project page so both render the
 * same calendar. It is purely presentational: hand it a `ContributionGrid`
 * (built by `buildContributionGrid`) and it draws one cell per day, coloured by
 * the grid's relative 0–4 intensity, with month + weekday axes and a legend.
 */

// Show only alternating weekday labels (월/수/금) so the axis stays uncluttered.
const WEEKDAY_LABELS = ["", "월", "", "수", "", "금", ""];

/** Per-lens noun + value formatter for cell tooltips and the aria summary. */
function describeCellValue(metric: ContributionMetric, count: number): string {
  switch (metric) {
    case "tokens":
      return `토큰 ${formatCompactCount(count)}`;
    case "activity":
      return `단계 ${count}개`;
    case "sessions":
    default:
      return `세션 ${count}개`;
  }
}

function describeTotal(metric: ContributionMetric, total: number): string {
  switch (metric) {
    case "tokens":
      return `총 토큰 ${formatCompactCount(total)}`;
    case "activity":
      return `총 단계 ${total}개`;
    case "sessions":
    default:
      return `총 ${total}회`;
  }
}

function formatDayKo(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export function ContributionHeatmap({ grid }: { grid: ContributionGrid }) {
  const metric = grid.metric;
  return (
    <div
      className="contrib"
      role="img"
      aria-label={`최근 ${grid.weekCount}주 작업 활동 · 활동 ${grid.activeDays}일 · ${describeTotal(metric, grid.total)}`}
    >
      <div className="contrib-scroll mori-scroll">
        <div className="contrib-plot">
          <div className="contrib-months" aria-hidden="true">
            {grid.weeks.map((_, col) => (
              <span className="contrib-month" key={col}>
                {grid.months.find((month) => month.col === col)?.label ?? ""}
              </span>
            ))}
          </div>
          <div className="contrib-body">
            <div className="contrib-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((label, row) => (
                <span key={row}>{label}</span>
              ))}
            </div>
            <div className="contrib-weeks">
              {grid.weeks.map((week, col) => (
                <div className="contrib-week" key={col}>
                  {week.map((day, row) =>
                    day.date ? (
                      <span
                        key={row}
                        className={`contrib-cell lvl-${day.level}`}
                        title={`${formatDayKo(day.date)} · ${describeCellValue(metric, day.count)}`}
                      />
                    ) : (
                      <span key={row} className="contrib-cell is-pad" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="contrib-legend" aria-hidden="true">
        <span>적음</span>
        <span className="contrib-cell lvl-0" />
        <span className="contrib-cell lvl-1" />
        <span className="contrib-cell lvl-2" />
        <span className="contrib-cell lvl-3" />
        <span className="contrib-cell lvl-4" />
        <span>많음</span>
      </div>
    </div>
  );
}
