import type { ReactNode } from "react";
import { baseTooltipProps } from "./BaseTooltip";

export type BaseMetricItem = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  hint?: string;
};

export type BaseMetricStripProps = {
  items: BaseMetricItem[];
  className?: string;
};

/**
 * Horizontal strip of compact key/value metrics. Used in Home activity stats,
 * Project summary rows, and Memory hero stats. Renders as a `<dl>` for
 * correct semantic pairing of label and value.
 */
export function BaseMetricStrip({ items, className = "" }: BaseMetricStripProps) {
  if (items.length === 0) return null;
  return (
    <dl className={`base-metric-strip ${className}`.trim()}>
      {items.map((item) => (
        <div className="base-metric-item" key={item.key}>
          <dt>{item.label}</dt>
          <dd {...baseTooltipProps(item.hint, "metric")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
