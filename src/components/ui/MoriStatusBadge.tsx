import type { ReactNode } from "react";
import type { FeatureStatus } from "../../app/featureStatus";

export type MoriStatusBadgeTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "accent"
  | "neutral"
  | "verified"
  | "observed"
  | "inferred";

const STATUS_TO_TONE: Record<FeatureStatus, MoriStatusBadgeTone> = {
  implemented: "success",
  partial: "info",
  planned: "warning",
  unavailable: "neutral",
};

export type MoriStatusBadgeProps = {
  children: ReactNode;
  tone?: MoriStatusBadgeTone;
  /** Convenience: pass a FeatureStatus and the right tone is derived. */
  status?: FeatureStatus;
};

/**
 * Calm, tone-driven status pill. Backed by the `.mori-status-badge`
 * stylesheet rules in `styles/theme.css`. New code should prefer this over
 * the generic `Badge` so themes can rebind colors via one CSS variable.
 */
export function MoriStatusBadge({ children, tone, status }: MoriStatusBadgeProps) {
  const resolvedTone: MoriStatusBadgeTone = tone ?? (status ? STATUS_TO_TONE[status] : "neutral");
  return (
    <span className="mori-status-badge" data-mori-tone={resolvedTone}>
      {children}
    </span>
  );
}
