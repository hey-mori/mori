import type { ReactNode } from "react";

export type MoriStatCardTone =
  | "default"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "accent";

export type MoriStatCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MoriStatCardTone;
};

/**
 * Single KPI cell. Surface honesty strips (Reports / Settings / Memory)
 * compose several of these into a grid.
 */
export function MoriStatCard({ label, value, hint, tone = "default" }: MoriStatCardProps) {
  return (
    <div className="mori-stat-card" data-mori-tone={tone === "default" ? undefined : tone}>
      <span className="mori-stat-card-label">{label}</span>
      <strong className="mori-stat-card-value">{value}</strong>
      {hint ? <span className="mori-stat-card-hint">{hint}</span> : null}
    </div>
  );
}
