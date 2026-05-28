import type { ReactNode } from "react";
import { moriTooltipProps } from "./MoriTooltip";

export function Badge({
  children,
  tone = "gray",
  title,
}: {
  children: ReactNode;
  tone?: string;
  /** Optional custom tooltip used to surface an explanation on hover. */
  title?: string;
}) {
  return (
    <span className={`pill tone-${tone}`} {...moriTooltipProps(title, "status")}>
      {children}
    </span>
  );
}
