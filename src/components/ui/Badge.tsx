import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "purple",
  title,
}: {
  children: ReactNode;
  tone?: string;
  /** Optional native tooltip — used to surface an explanation on hover. */
  title?: string;
}) {
  return (
    <span className={`pill tone-${tone}`} title={title}>
      {children}
    </span>
  );
}
