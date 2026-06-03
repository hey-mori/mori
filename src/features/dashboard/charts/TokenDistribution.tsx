import type { PointerEvent as ReactPointerEvent } from "react";
import { fraction, formatCount, type ProjectStatus } from "../../../lib/dashboard/dashboardModel";
import type { ChartTooltipHandle } from "./ChartTooltip";

/**
 * Per-project token share as horizontal bars (top 8 + an aggregate "기타"). The
 * bars stay CSS-driven, but each drillable row is now a button: hovering it
 * shows a tooltip (project · NK 토큰 · share%) and lights the matching project
 * row in the matrix, clicking focuses that project (filters the matrix, a
 * clearable chip appears; clicking it again clears). The "기타" aggregate has no
 * single project behind it, so it is tooltip-only and never a focus target.
 */

type Row = { key: string; name: string; value: number; drillable: boolean };

export function TokenDistribution({
  projects,
  total,
  focusProjectKey,
  onFocus,
  tooltip,
}: {
  projects: ProjectStatus[];
  total: number;
  focusProjectKey: string | null;
  onFocus: (key: string) => void;
  tooltip: ChartTooltipHandle;
}) {
  const ranked = projects
    .filter((project) => project.tokenTotal > 0)
    .sort((a, b) => b.tokenTotal - a.tokenTotal);
  if (ranked.length === 0 || total === 0) {
    return <p className="dashboard-chart-empty">토큰 기록 없음</p>;
  }

  const top = ranked.slice(0, 8);
  const restTotal = ranked.slice(8).reduce((sum, project) => sum + project.tokenTotal, 0);
  const max = top[0]!.tokenTotal;
  const rows: Row[] = top.map((project) => ({
    key: project.key,
    name: project.name,
    value: project.tokenTotal,
    drillable: true,
  }));
  if (restTotal > 0) {
    rows.push({
      key: "__rest__",
      name: `기타 ${ranked.length - 8}개`,
      value: restTotal,
      drillable: false,
    });
  }

  // Anchor to the cursor (not the full-width bar's box) so the tooltip tracks
  // the pointer instead of sitting at a fixed spot over the row.
  const showTip = (row: Row, event: ReactPointerEvent) => {
    tooltip.show(
      { top: event.clientY, bottom: event.clientY, left: event.clientX, width: 0 },
      {
        label: row.name,
        value: `${formatCount(row.value)} 토큰`,
        share: `${Math.round((row.value / total) * 100)}%`,
        tone: "accent",
      },
    );
  };

  return (
    <div className="dashboard-bars">
      {rows.map((row) => {
        const isFocus = row.drillable && focusProjectKey === row.key;
        const isDim = row.drillable && Boolean(focusProjectKey) && !isFocus;
        const className = `dashboard-bar${isFocus ? " is-focus" : ""}${isDim ? " is-dim" : ""}${row.drillable ? "" : " is-static"}`;
        const body = (
          <>
            <span>{row.name}</span>
            <span className="dashboard-bar-track" aria-hidden="true">
              <i style={{ width: `${Math.max(fraction(row.value, max) * 100, 4)}%` }} />
            </span>
            <span className="dashboard-bar-val">
              <strong>{Math.round((row.value / total) * 100)}%</strong>
              <em>{formatCount(row.value)}</em>
            </span>
          </>
        );

        if (!row.drillable) {
          return (
            <div
              key={row.key}
              className={className}
              onPointerEnter={(event) => showTip(row, event)}
              onPointerMove={(event) => showTip(row, event)}
              onPointerLeave={tooltip.hide}
            >
              {body}
            </div>
          );
        }

        return (
          <button
            key={row.key}
            type="button"
            className={className}
            aria-pressed={isFocus}
            aria-label={`${row.name} 토큰 ${formatCount(row.value)}`}
            onPointerEnter={(event) => showTip(row, event)}
            onPointerMove={(event) => showTip(row, event)}
            onPointerLeave={tooltip.hide}
            onClick={() => onFocus(row.key)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
