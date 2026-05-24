import type { ReactNode } from "react";

export type MoriListRowProps = {
  /** Leading slot: icon, avatar, or status dot. */
  leading?: ReactNode;
  /** Primary label — required. */
  title: ReactNode;
  /** Secondary line below the title. */
  meta?: ReactNode;
  /** Trailing slot: badges, chips, action icon. */
  trailing?: ReactNode;
  /** Whether this row is currently selected/active. */
  selected?: boolean;
  /** Extra CSS classes forwarded to the root element. */
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  /** Forwarded to the root div as aria-label. */
  ariaLabel?: string;
};

/**
 * Shared list-row primitive for session rows, project rows, memory rows, and
 * import rows. Flat, compact, hairline-separated — no card wrapping.
 *
 * Renders as a `div[role=button]` when `onClick` is provided, otherwise a
 * plain `div`. Consumers wrap in `<li>` as needed.
 */
export function MoriListRow({
  leading,
  title,
  meta,
  trailing,
  selected = false,
  className = "",
  onClick,
  onDoubleClick,
  ariaLabel,
}: MoriListRowProps) {
  const interactive = Boolean(onClick);
  const classes = [
    "mori-list-row",
    selected ? "is-selected" : "",
    interactive ? "is-interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive && selected ? true : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {leading ? (
        <span className="mori-list-row-leading" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="mori-list-row-body">
        <span className="mori-list-row-title">{title}</span>
        {meta ? <span className="mori-list-row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="mori-list-row-trailing">{trailing}</span> : null}
    </div>
  );
}
