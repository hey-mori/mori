import type { ReactNode } from "react";
import { moriTooltipProps } from "./MoriTooltip";

export type MoriMetricItem = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  hint?: string;
};

export type MoriMetricStripProps = {
  items: MoriMetricItem[];
  className?: string;
};

/**
 * Horizontal strip of compact key/value metrics. Used in Home activity stats,
 * Project summary rows, and Memory hero stats. Renders as a `<dl>` for
 * correct semantic pairing of label and value.
 */
export function MoriMetricStrip({ items, className = "" }: MoriMetricStripProps) {
  if (items.length === 0) return null;
  return (
    <dl className={`mori-metric-strip ${className}`.trim()}>
      {items.map((item) => (
        <div className="mori-metric-item" key={item.key}>
          <dt>{item.label}</dt>
          <dd {...moriTooltipProps(item.hint, "metric")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
