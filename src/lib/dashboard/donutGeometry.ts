/**
 * Pure SVG arc geometry for the attention donut.
 *
 * The donut is drawn as overlapping `<circle pathLength="100">` strokes, so all
 * dash math lives in a 0..100 percentage space (independent of the real radius).
 * Each segment's `stroke-dasharray` is "{share} {rest}" and its
 * `stroke-dashoffset` is the negated cumulative share before it, so segments lay
 * end to end. Keeping this out of JSX makes it unit-testable in the node-only
 * harness, and lets every segment be an independently hit-tested arc (which a
 * single conic-gradient cannot offer).
 */

export type DonutSegmentInput = {
  key: string;
  value: number;
  /** A CSS color reference, e.g. "var(--base-status-warning)". */
  colorVar: string;
};

export type DonutArc = {
  key: string;
  value: number;
  colorVar: string;
  /** Share of the total, 0..100. */
  sharePct: number;
  /** `stroke-dasharray` value in pathLength=100 space. */
  dashArray: string;
  /** `stroke-dashoffset` value: negated cumulative share before this segment. */
  dashOffset: number;
};

export type DonutGeometry = {
  total: number;
  arcs: DonutArc[];
};

/**
 * Lay segments end to end around a `pathLength=100` ring. A zero-value segment
 * produces a zero-length arc (no stray dot); a single non-zero segment fills the
 * whole ring; an all-zero input yields `total: 0` with every arc at 0 share, so
 * the caller renders just the track.
 */
export function buildDonutArcs(segments: DonutSegmentInput[]): DonutGeometry {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  let cumulative = 0;
  const arcs: DonutArc[] = segments.map((segment) => {
    const value = Math.max(0, segment.value);
    const sharePct = total === 0 ? 0 : (value / total) * 100;
    const arc: DonutArc = {
      key: segment.key,
      value,
      colorVar: segment.colorVar,
      sharePct,
      dashArray: `${round(sharePct)} ${round(100 - sharePct)}`,
      dashOffset: cumulative === 0 ? 0 : -round(cumulative),
    };
    cumulative += sharePct;
    return arc;
  });
  return { total, arcs };
}

/** Round to 3 decimals to keep the emitted SVG attribute strings compact. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
