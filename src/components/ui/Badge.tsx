import type { ReactNode } from "react";
import { baseTooltipProps } from "./BaseTooltip";

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
    <span className={`pill tone-${tone}`} {...baseTooltipProps(title, "status")}>
      {children}
    </span>
  );
}
