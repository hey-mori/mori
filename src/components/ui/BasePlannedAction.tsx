import type { LucideIcon } from "lucide-react";
import { getFeatureControlProps, type FeatureId } from "../../app/featureStatus";
import { BaseTooltip } from "./BaseTooltip";

export type BasePlannedActionProps = {
  /**
   * Feature id whose `disabledReason` drives the tooltip. Omit it for a
   * Planned capability that has no `featureStatus.ts` row yet — pass an
   * explicit `title` instead.
   */
  feature?: FeatureId;
  /** Button label (defaults to the feature id, then "Planned"). */
  label?: string;
  /** Explicit tooltip — required when `feature` is omitted. */
  title?: string;
  /** Optional Lucide icon to render before the label. */
  icon?: LucideIcon;
};

/**
 * Disabled-with-tooltip button used everywhere we need to surface a
 * Planned capability without pretending it works. Centralising it kills
 * dozens of hand-rolled disabled tooltip buttons across feature folders.
 */
export function BasePlannedAction({ feature, label, title, icon: Icon }: BasePlannedActionProps) {
  const props = feature ? getFeatureControlProps(feature) : null;
  const tooltip = props ? props.title : title;
  return (
    <BaseTooltip content={tooltip} kind="control">
      <button
        type="button"
        className="base-planned-action"
        disabled
        data-base-status={props ? props.status : "planned"}
      >
        {Icon ? <Icon size={13} aria-hidden="true" /> : null}
        <span>{label ?? feature ?? "예정"}</span>
      </button>
    </BaseTooltip>
  );
}
