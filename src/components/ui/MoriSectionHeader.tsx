import type { ReactNode } from "react";

export type MoriSectionHeaderProps = {
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
 * Replaces the scattered `home-section-head mori-section-row` pattern.
 */
export function MoriSectionHeader({
  title,
  action,
  eyebrow,
  className = "",
}: MoriSectionHeaderProps) {
  return (
    <header className={`mori-section-header ${className}`.trim()}>
      <div className="mori-section-header-title">
        {eyebrow ? <span className="mori-section-header-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action ? <div className="mori-section-header-action">{action}</div> : null}
    </header>
  );
}
