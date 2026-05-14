import type { HTMLAttributes, ReactNode } from "react";

export type MoriScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Direction the area can scroll in. Defaults to vertical. */
  direction?: "vertical" | "horizontal" | "both";
};

/**
 * Calm scroll area styled by `styles/theme.css` (.mori-scroll selector).
 * The point is consistent subtle scrollbars across the whole product so we
 * never get the harsh native bars on one panel and the styled ones on
 * another.
 */
export function MoriScrollArea({
  children,
  direction = "vertical",
  className = "",
  ...rest
}: MoriScrollAreaProps) {
  return (
    <div
      className={`mori-scroll mori-scroll-${direction} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
