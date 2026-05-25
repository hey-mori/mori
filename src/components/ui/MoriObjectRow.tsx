import type { KeyboardEvent, ReactNode } from "react";
import type { MoriMenuPosition } from "./MoriActionMenu";

export type MoriObjectRowDensity = "comfortable" | "compact";

export type MoriObjectRowProps = {
  /** Leading slot: source icon, status dot, trust mark, avatar. */
  leading?: ReactNode;
  /** Primary label — required. */
  title: ReactNode;
  /** Secondary line below title — summary, path, or description. */
  subtitle?: ReactNode;
  /** Metadata line: source, project, event count, token count, etc. */
  meta?: ReactNode;
  /** Timestamp shown on the trailing-top corner. */
  timestamp?: ReactNode;
  /** Status/trust badges — shown in trailing area below timestamp. */
  status?: ReactNode;
  /** Arbitrary trailing slot for actions or counts. */
  trailing?: ReactNode;
  /** Whether this row is currently selected/active. */
  selected?: boolean;
  /** Compact (32px min-height) vs comfortable (44px min-height). Default: comfortable. */
  density?: MoriObjectRowDensity;
  /** Extra CSS classes forwarded to the root element. */
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onActionMenu?: (position: MoriMenuPosition) => void;
  /** Forwarded to the root element as aria-label. */
  ariaLabel?: string;
  /** When true, renders as a plain div (non-interactive) regardless of onClick. */
  static?: boolean;
};

/**
 * Product-level object row for Mori's session, source, issue, decision,
 * next-action, and memory rows.
 *
 * Stronger than `MoriListRow`: supports subtitle, metadata line, timestamp,
 * status slot, and comfortable/compact density modes. Flat, no card wrapping.
 * Renders as a `div[role=button]` when `onClick` is provided (and `static`
 * is not set), otherwise a plain `div`. Consumers wrap in `<li>` as needed.
 *
 * Layout:
 *   [leading] [body: title / subtitle / meta]  [aside: timestamp / status / trailing]
 */
export function MoriObjectRow({
  leading,
  title,
  subtitle,
  meta,
  timestamp,
  status,
  trailing,
  selected = false,
  density = "comfortable",
  className = "",
  onClick,
  onDoubleClick,
  onActionMenu,
  ariaLabel,
  static: isStatic = false,
}: MoriObjectRowProps) {
  const interactive = Boolean(onClick) && !isStatic;
  const classes = [
    "mori-object-row",
    `mori-object-row--${density}`,
    selected ? "is-selected" : "",
    interactive ? "is-interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const hasAside = timestamp || status || trailing;

  return (
    <div
      className={classes}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive && selected ? true : undefined}
      aria-label={ariaLabel}
      onClick={interactive ? onClick : undefined}
      onDoubleClick={interactive ? onDoubleClick : undefined}
      onContextMenu={
        onActionMenu
          ? (event) => {
              event.preventDefault();
              onActionMenu({ x: event.clientX, y: event.clientY });
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (event) => {
              if (handleActionMenuKey(event, onActionMenu)) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {leading ? (
        <span className="mori-object-row-leading" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="mori-object-row-body">
        <span className="mori-object-row-title">{title}</span>
        {subtitle ? (
          <span className="mori-object-row-subtitle">{subtitle}</span>
        ) : null}
        {meta ? <span className="mori-object-row-meta">{meta}</span> : null}
      </span>
      {hasAside ? (
        <span className="mori-object-row-aside">
          {timestamp ? (
            <span className="mori-object-row-timestamp">{timestamp}</span>
          ) : null}
          {status ? (
            <span className="mori-object-row-status">{status}</span>
          ) : null}
          {trailing ? (
            <span className="mori-object-row-trailing">{trailing}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function handleActionMenuKey(
  event: KeyboardEvent<HTMLDivElement>,
  onActionMenu: MoriObjectRowProps["onActionMenu"],
): boolean {
  if (!onActionMenu) return false;
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
    return false;
  }
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  onActionMenu({ x: rect.left + 16, y: rect.top + Math.min(rect.height, 32) });
  return true;
}
