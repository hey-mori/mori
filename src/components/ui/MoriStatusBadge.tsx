import type { ReactNode } from "react";
import type { FeatureStatus } from "../../app/featureStatus";
import {
  getProductAvailabilityTone,
  productAvailabilityFromFeatureStatus,
  type ProductStateTone,
} from "../../lib/product-state/productState";

/**
 * Badge tone vocabulary. This is the shared product-state tone scale —
 * `MoriStatusBadge` does not own its own scale, it renders the one defined
 * in `src/lib/product-state/`.
 */
export type MoriStatusBadgeTone = ProductStateTone;

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
 *
 * When a `FeatureStatus` is passed, the tone is derived through the shared
 * product-state model rather than a badge-local map.
 */
export function MoriStatusBadge({ children, tone, status }: MoriStatusBadgeProps) {
  const resolvedTone: MoriStatusBadgeTone =
    tone ??
    (status
      ? getProductAvailabilityTone(productAvailabilityFromFeatureStatus(status))
      : "neutral");
  return (
    <span className="mori-status-badge" data-mori-tone={resolvedTone}>
      {children}
    </span>
  );
}
