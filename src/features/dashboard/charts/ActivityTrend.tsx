import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { ActivityTrend as ActivityTrendModel } from "../../../lib/dashboard/dashboardModel";
import type { ChartTooltipHandle } from "./ChartTooltip";

/**
 * Session activity over a rolling window as an SVG bar chart. The window + bucket
 * unit come from the model (1주 = 7 daily bars, 1개월 = 30 daily, 1년 = 12 monthly),
 * so the parent only picks the range. The SVG is drawn in real pixels (width
 * measured, height fixed) so bars and the hover guide stay crisp at any width.
 * Each column has a full-height hit area, and the tooltip follows the cursor
 * (pointer-move) rather than sitting at a fixed anchor.
 */

const HEIGHT = 104;
const BASELINE_PAD = 4;
const GAP_RATIO = 0.3;

export function ActivityTrend({
  trend,
  tooltip,
}: {
  trend: ActivityTrendModel;
  tooltip: ChartTooltipHandle;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(ref);
  const [active, setActive] = useState<number | null>(null);

  const points = trend.points;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  if (!points.some((point) => point.value > 0)) {
    return <p className="dashboard-chart-empty">활동 기록 없음</p>;
  }

  const n = points.length;
  const max = Math.max(...points.map((point) => point.value), 1);
  const W = Math.max(width, 1);
  const slot = W / n;
  const barW = slot * (1 - GAP_RATIO);
  const plotH = HEIGHT - BASELINE_PAD;

  const showAt = (index: number, event: ReactPointerEvent) => {
    setActive(index);
    const point = points[index]!;
    tooltip.show(
      { top: event.clientY, bottom: event.clientY, left: event.clientX, width: 0 },
      {
        label: point.label,
        value: `${point.value}개`,
        share: total > 0 ? `${Math.round((point.value / total) * 100)}%` : undefined,
        tone: "accent",
      },
    );
  };

  const leave = () => {
    setActive(null);
    tooltip.hide();
  };

  return (
    <div className="dashboard-trend" ref={ref}>
      {width > 0 ? (
        <svg
          className="dashboard-trend-svg"
          width={W}
          height={HEIGHT}
          viewBox={`0 0 ${W} ${HEIGHT}`}
          role="img"
          aria-label={`${trend.startLabel}부터 ${trend.endLabel}까지 활동 추이, 합계 ${total}개`}
        >
          <line
            className="dashboard-trend-base"
            x1={0}
            y1={HEIGHT - BASELINE_PAD}
            x2={W}
            y2={HEIGHT - BASELINE_PAD}
          />
          {points.map((point, index) => {
            const height = point.value > 0 ? Math.max((point.value / max) * plotH, 3) : 0;
            const x = index * slot + (slot - barW) / 2;
            const y = HEIGHT - BASELINE_PAD - height;
            const center = index * slot + slot / 2;
            return (
              <g key={index}>
                {active === index ? (
                  <line
                    className="dashboard-trend-guide"
                    x1={center}
                    y1={0}
                    x2={center}
                    y2={HEIGHT - BASELINE_PAD}
                  />
                ) : null}
                {point.value > 0 ? (
                  <rect
                    className={`dashboard-trend-bar${point.isCurrent ? " is-now" : ""}${active === index ? " is-active" : ""}`}
                    x={x}
                    y={y}
                    width={barW}
                    height={height}
                    rx={1.5}
                  />
                ) : null}
                <rect
                  className="dashboard-trend-hit"
                  x={index * slot}
                  y={0}
                  width={slot}
                  height={HEIGHT}
                  onPointerEnter={(event) => showAt(index, event)}
                  onPointerMove={(event) => showAt(index, event)}
                  onPointerLeave={leave}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      <div className="dashboard-trend-caption">
        <span>{trend.startLabel}</span>
        <span>{trend.endLabel}</span>
      </div>
    </div>
  );
}

/** Track the rendered width of an element so the SVG can draw in real pixels. */
function useMeasuredWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === "number") setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
