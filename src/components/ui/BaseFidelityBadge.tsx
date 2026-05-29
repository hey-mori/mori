import type { CaptureFidelity } from "../../domain/types";
import {
  describeCaptureFidelity,
  getCaptureFidelityDisplay,
} from "../../lib/evidence/fidelityDisplay";
import { BaseStatusBadge } from "./BaseStatusBadge";
import { baseTooltipProps } from "./BaseTooltip";

export type BaseFidelityBadgeProps = {
  fidelity?: CaptureFidelity;
};

/**
 * Calm completeness pill. Renders only when a source's capture looks less
 * than complete (`partial` / `fragment` / `unknown`); a `full` or absent
 * fidelity renders nothing, so this is a quiet honesty signal rather than
 * chrome on every row. The reasons surface as a hover tooltip.
 */
export function BaseFidelityBadge({ fidelity }: BaseFidelityBadgeProps) {
  if (!fidelity) return null;
  const display = getCaptureFidelityDisplay(fidelity);
  if (!display.shouldSurface) return null;
  return (
    <BaseStatusBadge tone={display.tone}>
      <span {...baseTooltipProps(describeCaptureFidelity(fidelity), "status")}>
        {display.label}
      </span>
    </BaseStatusBadge>
  );
}
