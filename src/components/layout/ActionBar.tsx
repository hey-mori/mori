import type { ReactNode } from "react";

export type ActionBarProps = {
  /**
   * Consistent page-context label, rendered at the very start of the bar on
   * every surface so the header band reads identically across destinations.
   * Page-specific tools (`start`) follow after a thin divider.
   */
  title?: ReactNode;
  /** Left cluster — filters, tabs, search, counts. */
  start?: ReactNode;
  /** Right cluster — actions (add, refresh, run). */
  end?: ReactNode;
  /** ARIA label for the toolbar landmark. */
  label?: string;
  className?: string;
};

/**
 * The row that sits directly under a `PageHeader`: a consistent page title,
 * then filters / tabs on the left and actions on the right. Fixed height and
 * consistent spacing so it reads as the same band on every screen instead of
 * each view stacking its own toolbar at a different height.
 */
export function ActionBar({ title, start, end, label, className = "" }: ActionBarProps) {
  return (
    <div
      className={`action-bar ${className}`.trim()}
      role="toolbar"
      aria-label={label}
    >
      <div className="action-bar-start">
        {title ? <span className="action-bar-context">{title}</span> : null}
        {title && start ? <span className="action-bar-divider" aria-hidden="true" /> : null}
        {start}
      </div>
      {end ? <div className="action-bar-end">{end}</div> : null}
    </div>
  );
}
