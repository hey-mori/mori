import type { ReactNode } from "react";

export type BaseSectionHeaderProps = {
  title: ReactNode;
  /** Optional action or link on the trailing side. */
  action?: ReactNode;
  /** Optional eyebrow label above the title. */
  eyebrow?: string;
  className?: string;
};

/**
 * Compact section header row used across Home, Workspace, Memory, and
 * Settings. Flat, no bottom border — relies on surrounding spacing.
 * Replaces the scattered `home-section-head base-section-row` pattern.
 */
export function BaseSectionHeader({
  title,
  action,
  eyebrow,
  className = "",
}: BaseSectionHeaderProps) {
  return (
    <header className={`base-section-header ${className}`.trim()}>
      <div className="base-section-header-title">
        {eyebrow ? <span className="base-section-header-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action ? <div className="base-section-header-action">{action}</div> : null}
    </header>
  );
}
