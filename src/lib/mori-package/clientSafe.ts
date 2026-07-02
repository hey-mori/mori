/**
 * `.mori` package — client-safe export filter.
 *
 * A *client-safe* `.mori` package is one an Author can hand to a
 * non-teammate (see `docs/team-shared-memory.md` §5). It is a filtered
 * copy of a package, produced with explicit intent — never a default.
 *
 * `buildClientSafeMoriPackage` is a pure `MoriPackageV0` →
 * `MoriPackageV0` transform: it never mutates the input and never
 * widens what a slice exposes. The filter rules:
 *
 *   - `consolidatedMemories` keeps only memories whose
 *     `reportEligibility` is `clientSafe` AND whose `sensitivity` is
 *     `normal` — `sensitive` / `clientSafeExcluded` memory is dropped
 *     regardless of its report tier.
 *   - `auditTrail` keeps only rows that reference *surviving* memories
 *     (every `targetMemoryId` is in the filtered set); review history
 *     for excluded memory is dropped.
 *   - the manifest is marked `clientSafeExport: true` so an importer
 *     can see the package was filtered.
 *
 * Every other slice (issues, …) is carried through unchanged. Timeline
 * events are copied with verbatim transcript fields stripped, because
 * `requestText` / `responseText` may contain raw prompts, code, local paths,
 * secrets, customer data, or other content that must not leave in a
 * client-safe artifact.
 */
import {
  getPackageAuditTrail,
  getPackageConsolidatedMemories,
} from "./deserialize";
import type { MoriPackageV0 } from "./types";
import type { TimelineEvent } from "../../domain/types";

/**
 * Produce a client-safe copy of a `.mori v0` package. Pure — the input
 * package is never mutated.
 */
function stripClientUnsafeEventFields(event: TimelineEvent): TimelineEvent {
  const safeEvent = { ...event };
  delete safeEvent.requestText;
  delete safeEvent.responseText;
  return safeEvent;
}

export function buildClientSafeMoriPackage(pkg: MoriPackageV0): MoriPackageV0 {
  const memories = getPackageConsolidatedMemories(pkg).filter(
    (memory) =>
      memory.reportEligibility === "clientSafe" &&
      memory.sensitivity === "normal",
  );
  const survivingIds = new Set(memories.map((memory) => memory.id));
  const auditTrail = getPackageAuditTrail(pkg).filter(
    (row) =>
      Array.isArray(row.targetMemoryIds) &&
      row.targetMemoryIds.length > 0 &&
      row.targetMemoryIds.every((id) => survivingIds.has(id)),
  );
  const events = pkg.events.map(stripClientUnsafeEventFields);

  return {
    ...pkg,
    manifest: { ...pkg.manifest, clientSafeExport: true },
    events,
    consolidatedMemories: memories,
    auditTrail,
  };
}

/**
 * Whether a package was produced by the client-safe export filter.
 * Normal packages have the manifest flag absent and return `false`.
 */
export function getPackageIsClientSafe(pkg: MoriPackageV0): boolean {
  return pkg.manifest.clientSafeExport === true;
}
