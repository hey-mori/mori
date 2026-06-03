import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A rich, portal-rendered tooltip for the dashboard charts. Unlike `InfoHint`
 * (which owns its own hover trigger), this one is driven imperatively by a
 * chart: the chart calls `show(anchor, content)` on pointer enter / move and
 * `hide()` on leave. It clones InfoHint's portal-to-body, fixed-position,
 * flip-above-or-below, and hide-on-scroll/resize behaviour so the bubble floats
 * over everything, is never clipped by an `overflow` ancestor, and never drifts
 * off its anchor when the project matrix scrolls.
 */

export type TooltipTone = "accent" | "warning" | "info" | "success" | "neutral";

export type ChartTooltipContent = {
  label: string;
  /** Pre-formatted primary value. */
  value: string;
  /** Optional secondary figure, e.g. a share "74%". */
  share?: string;
  tone?: TooltipTone;
};

/** A minimal anchor box in viewport coordinates. */
export type TooltipAnchor = { top: number; bottom: number; left: number; width: number };

type Coords = { top: number; left: number; placement: "top" | "bottom" };
type State = { coords: Coords; content: ChartTooltipContent };

const MAX_W = 220;
const GAP = 10;

export type ChartTooltipHandle = {
  show: (anchor: TooltipAnchor, content: ChartTooltipContent) => void;
  hide: () => void;
  node: ReactNode;
};

export function useChartTooltip(): ChartTooltipHandle {
  const [state, setState] = useState<State | null>(null);

  const show = useCallback((anchor: TooltipAnchor, content: ChartTooltipContent) => {
    if (typeof window === "undefined") return;
    const placement: "top" | "bottom" = anchor.top >= 120 ? "top" : "bottom";
    const half = MAX_W / 2;
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2, half + GAP),
      window.innerWidth - half - GAP,
    );
    const top = placement === "top" ? anchor.top - GAP : anchor.bottom + GAP;
    setState({ coords: { top, left, placement }, content });
  }, []);

  const hide = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [state, hide]);

  const node =
    state && typeof document !== "undefined"
      ? createPortal(
          <span
            className={`chart-tooltip is-${state.coords.placement} tone-${state.content.tone ?? "neutral"}`}
            role="tooltip"
            style={{ top: state.coords.top, left: state.coords.left }}
          >
            <span className="chart-tooltip-label">{state.content.label}</span>
            <span className="chart-tooltip-value">
              <strong>{state.content.value}</strong>
              {state.content.share ? <em>{state.content.share}</em> : null}
            </span>
          </span>,
          document.body,
        )
      : null;

  return { show, hide, node };
}
