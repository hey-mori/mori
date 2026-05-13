import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "muted" | "accent";
}) {
  return (
    <div className={`metric-card metric-card-${tone}`}>
      <span className="metric-card-label">{label}</span>
      <strong className="metric-card-value">{value}</strong>
      {hint ? <small className="metric-card-hint">{hint}</small> : null}
    </div>
  );
}
