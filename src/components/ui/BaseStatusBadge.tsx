import type { ReactNode } from "react";
import type { FeatureStatus } from "../../app/featureStatus";
import {
  getProductAvailabilityTone,
  productAvailabilityFromFeatureStatus,
  type ProductStateTone,
} from "../../lib/product-state/productState";

/**
 * Badge tone vocabulary. This is the shared product-state tone scale —
 * `BaseStatusBadge` does not own its own scale, it renders the one defined
 * in `src/lib/product-state/`.
 */
export type BaseStatusBadgeTone = ProductStateTone;

export type BaseStatusBadgeProps = {
  children: ReactNode;
  tone?: BaseStatusBadgeTone;
  /** Convenience: pass a FeatureStatus and the right tone is derived. */
  status?: FeatureStatus;
};

/**
 * Calm, tone-driven status pill. Backed by the `.base-status-badge`
 * stylesheet rules in `styles/theme.css`. New code should prefer this over
 * the generic `Badge` so themes can rebind colors via one CSS variable.
 *
 * When a `FeatureStatus` is passed, the tone is derived through the shared
 * product-state model rather than a badge-local map.
 */
export function BaseStatusBadge({ children, tone, status }: BaseStatusBadgeProps) {
  const resolvedTone: BaseStatusBadgeTone =
    tone ??
    (status
      ? getProductAvailabilityTone(productAvailabilityFromFeatureStatus(status))
      : "neutral");
  return (
    <span className="base-status-badge" data-base-tone={resolvedTone}>
      {children}
    </span>
  );
}
