import type { ReactNode } from "react";

export type MoriInspectorPanelProps = {
  /** Top-of-panel label (e.g. "Event inspector"). */
  title?: ReactNode;
  /** Short hint shown under the title (e.g. event time range). */
  subtitle?: ReactNode;
  /** Right-aligned slot for header chips/badges. */
  headerExtras?: ReactNode;
  /** Sections rendered inside the scrollable body. */
  children: ReactNode;
  /** Optional ARIA label for the landmark; defaults to the title text. */
  ariaLabel?: string;
};

/**
 * Right-rail inspector panel primitive. The Timeline Inspector + Bundle
 * Inspector + Review Detail Panel + Source Detail Panel all share the same
 * sticky-right shape; this primitive standardises the chrome so they stop
 * hand-rolling the header / scroll / shadow rules.
 *
 * Sticky + scroll behaviour is provided by `.mori-inspector-panel` in
 * `styles/theme.css`.
 */
export function MoriInspectorPanel({
  title,
  subtitle,
  headerExtras,
  children,
  ariaLabel,
}: MoriInspectorPanelProps) {
  return (
    <aside
      className="mori-inspector-panel"
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      {title || subtitle || headerExtras ? (
        <header className="mori-inspector-panel-head">
          <div className="mori-inspector-panel-titles">
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {headerExtras ? <div className="mori-inspector-panel-extras">{headerExtras}</div> : null}
        </header>
      ) : null}
      <div className="mori-inspector-panel-body mori-scroll">{children}</div>
    </aside>
  );
}
