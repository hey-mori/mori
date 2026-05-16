import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import type { MoriPackageV0 } from "./types";
import { validateMoriPackage } from "./validation";

export function deserializeMoriPackage(serialized: string): MoriPackageV0 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Invalid Mori package JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }

  const validation = validateMoriPackage(parsed);
  if (!validation.valid) {
    const messages = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid Mori package: ${messages}`);
  }

  return parsed as MoriPackageV0;
}

export function importMoriPackageFromJson(serialized: string): MoriPackageV0 {
  return deserializeMoriPackage(serialized);
}

/**
 * Normalised read of a package's accepted project memory. Packages
 * exported before the `consolidatedMemories` field existed return an
 * empty list rather than `undefined`, so callers never branch on the
 * field's presence.
 */
export function getPackageConsolidatedMemories(
  pkg: MoriPackageV0,
): StoredAcceptedProjectMemory[] {
  return pkg.consolidatedMemories ?? [];
}

/**
 * Normalised read of a package's Memory Audit Trail review actions.
 * Packages exported before the `auditTrail` field existed return an
 * empty list rather than `undefined`, so callers never branch on the
 * field's presence.
 */
export function getPackageAuditTrail(
  pkg: MoriPackageV0,
): StoredMemoryReviewAction[] {
  return pkg.auditTrail ?? [];
}
