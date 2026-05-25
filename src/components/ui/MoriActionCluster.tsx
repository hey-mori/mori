import type { ReactNode } from "react";

export type MoriActionClusterProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  wrap?: boolean;
};

/**
 * Shared action grouping for toolbar ends, card footers, and row trailing
 * controls. Keeps spacing, wrapping, and right alignment consistent.
 */
export function MoriActionCluster({
  children,
  className = "",
  align = "end",
  wrap = true,
}: MoriActionClusterProps) {
  return (
    <span
      className={[
        "mori-action-cluster",
        `align-${align}`,
        wrap ? "can-wrap" : "no-wrap",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
