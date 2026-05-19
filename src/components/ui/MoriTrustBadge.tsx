import type { TrustLevel } from "../../domain/types";
import { getTrustDisplay } from "../../lib/evidence/trust";
import { moriTrustIcon } from "../brand/moriIcons";
import { MoriStatusBadge } from "./MoriStatusBadge";

export type MoriTrustBadgeProps = {
  level: TrustLevel;
  /** Optional override label (defaults to the canonical trust label). */
  label?: string;
  /** Hide the leading trust icon (e.g. in very dense rows). Defaults false. */
  iconless?: boolean;
};

/**
 * Trust display pill. Reads from the canonical
 * `src/lib/evidence/trust.ts` so the label and tone can never drift out
 * of sync between surfaces, and from `moriTrustIcon` so the verified /
 * observed / inferred marks stay consistent everywhere.
 */
export function MoriTrustBadge({ level, label, iconless = false }: MoriTrustBadgeProps) {
  const display = getTrustDisplay(level);
  const Icon = moriTrustIcon[level];
  return (
    <MoriStatusBadge tone={display.level}>
      {iconless ? null : <Icon size={12} aria-hidden="true" />}
      {label ?? display.label}
    </MoriStatusBadge>
  );
}
