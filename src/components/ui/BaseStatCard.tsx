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
    <div className="base-stat-card" data-base-tone={tone === "default" ? undefined : tone}>
      <span className="base-stat-card-label">{label}</span>
      <strong className="base-stat-card-value">{value}</strong>
      {hint ? <span className="base-stat-card-hint">{hint}</span> : null}
    </div>
  );
}
