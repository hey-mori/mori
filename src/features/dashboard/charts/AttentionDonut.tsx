import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { buildDonutArcs } from "../../../lib/dashboard/donutGeometry";
import type {
  AttentionLens,
  ConcreteLens,
  DashboardTotals,
} from "../../../lib/dashboard/dashboardModel";
import type { ChartTooltipHandle, TooltipAnchor, TooltipTone } from "./ChartTooltip";

/**
 * Review composition as an SVG arc donut. Drawn as overlapping
 * `<circle pathLength="100">` strokes (geometry from `buildDonutArcs`), so each
 * segment is an independently hit-tested arc that a single conic-gradient could
 * not provide.
 *
 * Hover contract: hovering a segment (or its legend button) pops that arc, dims
 * the others, swaps the centre figure to that category's count + label, shows a
 * tooltip (category · N개 · share%), and asks the parent to highlight the
 * projects carrying that review category. Clicking sets the review lens (a
 * second click on the active one clears it). Colours follow the product status
 * contract: issue = warning, decision = info/blue, next action = success/green.
 */

const RADIUS = 42;
const STROKE = 13;

type Segment = {
  key: ConcreteLens;
  label: string;
  value: number;
  tone: TooltipTone;
  colorVar: string;
};

export function AttentionDonut({
  totals,
  attentionLens,
  onLensChange,
  tooltip,
}: {
  totals: DashboardTotals;
  attentionLens: AttentionLens;
  onLensChange: (lens: AttentionLens) => void;
  tooltip: ChartTooltipHandle;
}) {
  const [hovered, setHovered] = useState<ConcreteLens | null>(null);

  const segments: Segment[] = [
    {
      key: "issues",
      label: "이슈",
      value: totals.openIssues,
      tone: "warning",
      colorVar: "var(--base-status-warning)",
    },
    {
      key: "decisions",
      label: "결정",
      value: totals.unconfirmedDecisions,
      tone: "info",
      colorVar: "var(--base-status-info)",
    },
    {
      key: "next",
      label: "다음",
      value: totals.pendingNextActions,
      tone: "success",
      colorVar: "var(--base-status-success)",
    },
  ];

  const { total, arcs } = buildDonutArcs(segments);
  const arcByKey = new Map(arcs.map((arc) => [arc.key, arc]));
  const hoveredSegment = hovered ? segments.find((segment) => segment.key === hovered) : null;
  const centerValue = hoveredSegment ? hoveredSegment.value : total;
  const centerLabel = hoveredSegment ? hoveredSegment.label : "항목";

  const ariaLabel = `검토 구성: ${segments
    .map((segment) => `${segment.label} ${segment.value}개`)
    .join(", ")}, 합계 ${total}개`;

  const enter = (segment: Segment, event: ReactPointerEvent) => {
    setHovered(segment.key);
    showTip(segment, event);
  };

  const move = (segment: Segment, event: ReactPointerEvent) => {
    if (hovered !== segment.key) return;
    showTip(segment, event);
  };

  const leave = () => {
    setHovered(null);
    tooltip.hide();
  };

  const showTip = (segment: Segment, event: ReactPointerEvent) => {
    const anchor: TooltipAnchor = {
      top: event.clientY,
      bottom: event.clientY,
      left: event.clientX,
      width: 0,
    };
    tooltip.show(anchor, {
      label: segment.label,
      value: `${segment.value}개`,
      share: total > 0 ? `${Math.round((segment.value / total) * 100)}%` : undefined,
      tone: segment.tone,
    });
  };

  const toggle = (lens: ConcreteLens) => onLensChange(attentionLens === lens ? "all" : lens);

  return (
    <div className="dashboard-donut-wrap">
      <div className="dashboard-donut-figure">
        <svg className="dashboard-donut-svg" viewBox="0 0 100 100" role="img" aria-label={ariaLabel}>
          <g transform="rotate(-90 50 50)">
            <circle
              className="dashboard-donut-track"
              cx={50}
              cy={50}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              pathLength={100}
            />
            {segments.map((segment) => {
              const arc = arcByKey.get(segment.key);
              if (!arc || arc.sharePct <= 0) return null;
              const isHover = hovered === segment.key;
              const isActive = attentionLens === segment.key;
              const isDim = (hovered && !isHover) || false;
              return (
                <circle
                  key={segment.key}
                  className={`dashboard-donut-arc${isHover ? " is-hover" : ""}${isDim ? " is-dim" : ""}${isActive ? " is-active" : ""}`}
                  cx={50}
                  cy={50}
                  r={RADIUS}
                  fill="none"
                  stroke={segment.colorVar}
                  strokeWidth={STROKE}
                  strokeLinecap="butt"
                  pathLength={100}
                  strokeDasharray={arc.dashArray}
                  strokeDashoffset={arc.dashOffset}
                  onPointerEnter={(event) => enter(segment, event)}
                  onPointerMove={(event) => move(segment, event)}
                  onPointerLeave={leave}
                  onClick={() => toggle(segment.key)}
                />
              );
            })}
          </g>
        </svg>
        <div className="dashboard-donut-center" aria-hidden="true">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="dashboard-donut-legend">
        {segments.map((segment) => {
          const isActive = attentionLens === segment.key;
          return (
            <li key={segment.key}>
              <button
                type="button"
                className={`dashboard-donut-legend-btn${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => toggle(segment.key)}
                onPointerEnter={() => setHovered(segment.key)}
                onPointerLeave={leave}
              >
                <i style={{ background: segment.colorVar }} aria-hidden="true" />
                <span>{segment.label}</span>
                <strong>{segment.value}</strong>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
