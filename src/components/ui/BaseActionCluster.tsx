import type { ReactNode } from "react";

export type BaseActionClusterProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  wrap?: boolean;
};

/**
 * Shared action grouping for toolbar ends, card footers, and row trailing
 * controls. Keeps spacing, wrapping, and right alignment consistent.
 */
export function BaseActionCluster({
  children,
  className = "",
  align = "end",
  wrap = true,
}: BaseActionClusterProps) {
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
