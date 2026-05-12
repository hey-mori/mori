import type { ReactNode } from "react";

export function Badge({ children, tone = "purple" }: { children: ReactNode; tone?: string }) {
  return <span className={`pill tone-${tone}`}>{children}</span>;
}
