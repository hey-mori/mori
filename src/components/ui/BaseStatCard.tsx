import type { ReactNode } from "react";

export type BaseStatCardTone =
  | "default"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "accent";

export type BaseStatCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: BaseStatCardTone;
};

/**
 * Single KPI cell. Surface honesty strips (Reports / Settings / Memory)
 * compose several of these into a grid.
 */
export function BaseStatCard({ label, value, hint, tone = "default" }: BaseStatCardProps) {
  return (
    <div className="mori-stat-card" data-mori-tone={tone === "default" ? undefined : tone}>
      <span className="mori-stat-card-label">{label}</span>
      <strong className="mori-stat-card-value">{value}</strong>
      {hint ? <span className="mori-stat-card-hint">{hint}</span> : null}
    </div>
  );
}
