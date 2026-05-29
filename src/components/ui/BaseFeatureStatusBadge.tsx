import type { FeatureId, FeatureStatus } from "../../app/featureStatus";
import { FEATURE_STATUS_LABEL, getFeature } from "../../app/featureStatus";
import {
  getProductAvailabilityTone,
  productAvailabilityFromFeatureStatus,
} from "../../lib/product-state/productState";
import { baseTooltipProps } from "./BaseTooltip";

export type BaseFeatureStatusBadgeProps = {
  /** Either a `FeatureId` (looked up in the registry) or a `FeatureStatus`. */
  feature?: FeatureId;
  status?: FeatureStatus;
  /** Optional override label (defaults to the user-facing status). */
  label?: string;
  /** Render the brief description as a tooltip. Defaults to true. */
  withTooltip?: boolean;
};

/**
 * Status chip that surfaces a feature's `implemented / partial / planned /
 * unavailable` status using the canonical registry copy. Backed by the
 * `.base-feature-status-chip` CSS rules in `styles/theme.css`.
 *
 * The tone is derived through the shared product-state model rather than a
 * badge-local map, matching `BaseStatusBadge`.
 */
export function BaseFeatureStatusBadge({
  feature,
  status,
  label,
  withTooltip = true,
}: BaseFeatureStatusBadgeProps) {
  let resolvedStatus: FeatureStatus;
  let resolvedLabel: string;
  let title: string | undefined;
  if (feature) {
    const row = getFeature(feature);
    resolvedStatus = row.status;
    resolvedLabel = label ?? row.userFacingStatus ?? FEATURE_STATUS_LABEL[row.status];
    if (withTooltip) {
      title = `${row.label} — ${row.description}`;
    }
  } else if (status) {
    resolvedStatus = status;
    resolvedLabel = label ?? FEATURE_STATUS_LABEL[status];
  } else {
    resolvedStatus = "planned";
    resolvedLabel = label ?? FEATURE_STATUS_LABEL.planned;
  }
  const tone = getProductAvailabilityTone(
    productAvailabilityFromFeatureStatus(resolvedStatus),
  );
  return (
    <span
      className="base-feature-status-chip"
      data-base-tone={tone}
      data-base-status={resolvedStatus}
      {...baseTooltipProps(title, "status")}
    >
      {resolvedLabel}
    </span>
  );
}
