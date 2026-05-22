import type { ReactNode } from "react";

export type ActionBarProps = {
  /** Left cluster — filters, tabs, search, counts. */
  start?: ReactNode;
  /** Right cluster — actions (add, refresh, run). */
  end?: ReactNode;
  /** ARIA label for the toolbar landmark. */
  label?: string;
  className?: string;
};

/**
 * The row that sits directly under a `PageHeader`: filters / tabs on the
 * left, actions on the right. Fixed height and consistent spacing so it
 * reads as the same band on every screen instead of each view stacking its
 * own toolbar at a different height.
 */
export function ActionBar({ start, end, label, className = "" }: ActionBarProps) {
  return (
    <div
      className={`action-bar ${className}`.trim()}
      role="toolbar"
      aria-label={label}
    >
      <div className="action-bar-start">{start}</div>
      {end ? <div className="action-bar-end">{end}</div> : null}
    </div>
  );
}
