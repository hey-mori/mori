import type { TrustLevel } from "../../domain/types";
import { getTrustDisplay } from "../../lib/evidence/trust";
import { MoriStatusBadge } from "./MoriStatusBadge";

export type MoriTrustBadgeProps = {
  level: TrustLevel;
  /** Optional override label (defaults to the canonical trust label). */
  label?: string;
};

/**
 * Trust display pill. Reads from the canonical
 * `src/lib/evidence/trust.ts` so the label and tone can never drift out
 * of sync between surfaces.
 */
export function MoriTrustBadge({ level, label }: MoriTrustBadgeProps) {
  const display = getTrustDisplay(level);
  return <MoriStatusBadge tone={display.level}>{label ?? display.label}</MoriStatusBadge>;
}
