import type { TrustLevel } from "../../domain/types";
import { getTrustDisplay } from "../../lib/evidence/trust";
import { trustIcon } from "../brand/moriIcons";
import { BaseStatusBadge } from "./BaseStatusBadge";

export type BaseTrustBadgeProps = {
  level: TrustLevel;
  /** Optional override label (defaults to the canonical trust label). */
  label?: string;
  /** Hide the leading trust icon (e.g. in very dense rows). Defaults false. */
  iconless?: boolean;
};

/**
 * Trust display pill. Reads from the canonical
 * `src/lib/evidence/trust.ts` so the label and tone can never drift out
 * of sync between surfaces, and from `trustIcon` so the verified /
 * observed / inferred marks stay consistent everywhere.
 */
export function BaseTrustBadge({ level, label, iconless = false }: BaseTrustBadgeProps) {
  const display = getTrustDisplay(level);
  const Icon = trustIcon[level];
  return (
    <BaseStatusBadge tone={display.level}>
      {iconless ? null : <Icon size={12} aria-hidden="true" />}
      {label ?? display.label}
    </BaseStatusBadge>
  );
}
