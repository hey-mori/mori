import type { ReactNode } from "react";

export type BaseSectionProps = {
  title?: ReactNode;
  /** Short hint shown next to the title. */
  hint?: ReactNode;
  /** Right-aligned slot for actions. */
  actions?: ReactNode;
  /** Optional ARIA label override; otherwise the title is used. */
  ariaLabel?: string;
  children: ReactNode;
  /** When true, drops the surrounding card chrome (subtle background only). */
  subtle?: boolean;
  /**
   * Optional extra class on the outer `<section>`. Adopters keep their
   * legacy feature-specific class here so existing CSS continues to apply
   * during the migration to the `--base-*` semantic tokens.
   */
  className?: string;
};

/**
 * Page section primitive — a `BaseCard`-style surface with a header row.
 * Used to box up a feature surface's sub-section (e.g. "Available sources",
 * "Privacy policy", "Recent decisions") without each surface inventing its
 * own `<section className="evidence-section">` markup.
 *
 * The token-driven styles live in `styles/theme.css` (.base-section). The
 * outer `<section>` accepts a `className` so adopters can keep their legacy
 * class side-by-side (e.g. `.evidence-section`, `.settings-card`, …) during
 * a gradual migration.
 */
export function BaseSection({
  title,
  hint,
  actions,
  ariaLabel,
  children,
  subtle = false,
  className = "",
}: BaseSectionProps) {
  const classes = ["base-section", subtle ? "is-subtle" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <section
      className={classes}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      {title || hint || actions ? (
        <header className="base-section-head">
          <div className="base-section-title-group">
            {title ? <h3 className="base-section-title">{title}</h3> : null}
            {hint ? <p className="base-section-hint">{hint}</p> : null}
          </div>
          {actions ? <div className="base-section-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="base-section-body">{children}</div>
    </section>
  );
}
