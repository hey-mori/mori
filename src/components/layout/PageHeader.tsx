import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  /** Short supporting line. Clamped to two lines so the header never grows. */
  subtitle?: string;
  /** Right-aligned slot — primary action, status badge, refresh, etc. */
  right?: ReactNode;
  /** Tighter header for dense surfaces (lower min-height, smaller title). */
  compact?: boolean;
};

/**
 * Shared page header. Fixed-height by design: the title is one line, the
 * subtitle is clamped to two lines, and the min-height is set in CSS so the
 * common header band never shifts when copy differs between screens.
 *
 * Backwards compatible — existing callers pass `{ title, subtitle, right }`.
 * `subtitle` is now optional and `compact` is additive.
 */
export function PageHeader({ title, subtitle, right, compact = false }: PageHeaderProps) {
  return (
    <header className={`page-header${compact ? " page-header-compact" : ""}`}>
      <div className="page-header-titles">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {right ? <div className="page-header-actions">{right}</div> : null}
    </header>
  );
}
