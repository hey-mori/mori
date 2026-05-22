import type { ReactNode } from "react";

export type InspectorPanelProps = {
  /** Panel title (e.g. session name, source label). */
  title?: ReactNode;
  /** Short hint under the title. */
  subtitle?: ReactNode;
  /** Right-aligned header slot (badges, a close/expand control). */
  headerExtras?: ReactNode;
  /** Scrollable body content. */
  children: ReactNode;
  /** Pinned footer for the primary actions on the selected item. */
  footer?: ReactNode;
  /** ARIA label for the landmark; defaults to the title text. */
  ariaLabel?: string;
  className?: string;
};

/**
 * Detail / inspector panel shell: a fixed-width header + scrollable body +
 * pinned footer-action region. Used as the right rail inside a `PageShell`
 * `aside`, so every "select an item, inspect it, act on it" surface shares
 * one skeleton (consistent width, header alignment, scroll boundary, and a
 * footer that stays put while the body scrolls).
 *
 * Distinct from `MoriInspectorPanel` (which has no footer region): this one
 * is the page-shell-aware variant with a pinned action footer, namespaced
 * under `.inspector-panel`.
 */
export function InspectorPanel({
  title,
  subtitle,
  headerExtras,
  children,
  footer,
  ariaLabel,
  className = "",
}: InspectorPanelProps) {
  const classes = ["inspector-panel", className].filter(Boolean).join(" ");
  return (
    <aside
      className={classes}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      {title || subtitle || headerExtras ? (
        <header className="inspector-panel-head">
          <div className="inspector-panel-titles">
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {headerExtras ? (
            <div className="inspector-panel-extras">{headerExtras}</div>
          ) : null}
        </header>
      ) : null}
      <div className="inspector-panel-body mori-scroll">{children}</div>
      {footer ? <footer className="inspector-panel-footer">{footer}</footer> : null}
    </aside>
  );
}
