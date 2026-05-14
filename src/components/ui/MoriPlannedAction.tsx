import type { LucideIcon } from "lucide-react";
import { getFeatureControlProps, type FeatureId } from "../../app/featureStatus";

export type MoriPlannedActionProps = {
  /** Feature id whose `disabledReason` + `label` drive the rendering. */
  feature: FeatureId;
  /** Optional override label (defaults to the registry's `label`). */
  label?: string;
  /** Optional Lucide icon to render before the label. */
  icon?: LucideIcon;
};

/**
 * Disabled-with-tooltip button used everywhere we need to surface a
 * Planned capability without pretending it works. Centralising it kills
 * dozens of hand-rolled `disabled title="..."` buttons across feature folders.
 */
export function MoriPlannedAction({ feature, label, icon: Icon }: MoriPlannedActionProps) {
  const props = getFeatureControlProps(feature);
  return (
    <button
      type="button"
      className="mori-planned-action"
      disabled
      title={props.title}
      data-mori-status={props.status}
    >
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      <span>{label ?? feature}</span>
    </button>
  );
}
