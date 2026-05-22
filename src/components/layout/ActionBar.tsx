import type { ReactNode } from "react";

export type ActionBarProps = {
  /** Left cluster — the page's controls: filters, tabs, search, status. */
  start?: ReactNode;
  /** Right cluster — secondary actions tied to the controls. */
  end?: ReactNode;
  /** ARIA label for the toolbar landmark. */
  label?: string;
  className?: string;
};

/**
 * The page **controls toolbar** — filters / tabs / search / status on the left,
 * tied actions on the right. It sits under the `PageHeader`, which owns the
 * page identity and primary actions. Keeping identity out of this bar means the
 * header height never changes when a page's controls grow.
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
