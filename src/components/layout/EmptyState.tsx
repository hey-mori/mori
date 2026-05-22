import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type EmptyStateProps = {
  /** Optional glyph in a lavender chip. */
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Action slot — a single primary button is typical. */
  actions?: ReactNode;
  /** Tighter empty state for inline use inside lists / inspector bodies. */
  compact?: boolean;
  /** Use the alert role + amber styling for error empties. */
  tone?: "neutral" | "danger";
  className?: string;
};

/**
 * One empty / placeholder pattern for every screen — the same chip + title +
 * copy + optional action whether it is a full-page "no data yet" or an inline
 * "select an item" hint. The `compact` variant drops the min-height so it can
 * live inside a list column or inspector body without a giant blank panel.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  compact = false,
  tone = "neutral",
  className = "",
}: EmptyStateProps) {
  const classes = [
    "layout-empty-state",
    compact ? "is-compact" : "",
    tone === "danger" ? "is-danger" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} role={tone === "danger" ? "alert" : "status"}>
      {Icon ? (
        <span className="layout-empty-state-icon" aria-hidden="true">
          <Icon size={compact ? 18 : 22} />
        </span>
      ) : null}
      <h3 className="layout-empty-state-title">{title}</h3>
      {description ? (
        <p className="layout-empty-state-description">{description}</p>
      ) : null}
      {actions ? <div className="layout-empty-state-actions">{actions}</div> : null}
    </div>
  );
}
