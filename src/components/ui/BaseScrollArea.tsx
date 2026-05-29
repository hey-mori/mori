import type { HTMLAttributes, ReactNode } from "react";

export type BaseScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Direction the area can scroll in. Defaults to vertical. */
  direction?: "vertical" | "horizontal" | "both";
};

/**
 * Calm scroll area styled by `styles/theme.css` (.base-scroll selector).
 * The point is consistent subtle scrollbars across the whole product so we
 * never get the harsh native bars on one panel and the styled ones on
 * another.
 */
export function BaseScrollArea({
  children,
  direction = "vertical",
  className = "",
  ...rest
}: BaseScrollAreaProps) {
  return (
    <div
      className={`base-scroll base-scroll-${direction} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
