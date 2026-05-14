import type { ReactNode } from "react";

export type MoriSectionProps = {
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
   * during the migration to the `--mori-*` semantic tokens.
   */
  className?: string;
};

/**
 * Page section primitive — a `MoriCard`-style surface with a header row.
 * Used to box up a feature surface's sub-section (e.g. "Available sources",
 * "Privacy policy", "Recent decisions") without each surface inventing its
 * own `<section className="evidence-section">` markup.
 *
 * The token-driven styles live in `styles/theme.css` (.mori-section). The
 * outer `<section>` accepts a `className` so adopters can keep their legacy
 * class side-by-side (e.g. `.evidence-section`, `.settings-card`, …) during
 * a gradual migration.
 */
export function MoriSection({
  title,
  hint,
  actions,
  ariaLabel,
  children,
  subtle = false,
  className = "",
}: MoriSectionProps) {
  const classes = ["mori-section", subtle ? "is-subtle" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <section
      className={classes}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      {title || hint || actions ? (
        <header className="mori-section-head">
          <div className="mori-section-title-group">
            {title ? <h3 className="mori-section-title">{title}</h3> : null}
            {hint ? <p className="mori-section-hint">{hint}</p> : null}
          </div>
          {actions ? <div className="mori-section-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="mori-section-body">{children}</div>
    </section>
  );
}
