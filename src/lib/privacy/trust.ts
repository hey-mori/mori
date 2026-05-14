/**
 * Backward-compat shim. The canonical trust display lives in
 * `src/lib/evidence/trust.ts`. This module re-exports the old function name
 * so existing imports continue to work.
 */
import { getTrustDisplay as getCanonicalTrustDisplay } from "../evidence/trust";
import type { TrustLevel } from "../../domain/types";

export function getTrustDisplay(trustLevel: TrustLevel): { label: string; description: string; tone: string } {
  const display = getCanonicalTrustDisplay(trustLevel);
  return { label: display.label, description: display.description, tone: display.tone };
}
