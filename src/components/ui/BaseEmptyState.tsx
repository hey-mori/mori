import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type BaseEmptyStateProps = {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

/**
 * Theme-token-backed empty state. The existing `EmptyState` primitive
 * remains for legacy callers; this version reads from the `--base-*`
 * tokens so it switches with the theme.
 */
export function BaseEmptyState({
  icon: Icon,
  title,
  description,
  actions,
}: BaseEmptyStateProps) {
  return (
    <div className="base-empty-state" role="status">
      {Icon ? (
        <div className="base-empty-state-icon">
          <Icon size={20} aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="base-empty-state-title">{title}</h3>
      {description ? <p className="base-empty-state-description">{description}</p> : null}
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
