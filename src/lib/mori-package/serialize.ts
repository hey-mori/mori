import type { MockSession } from "../../domain/types";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import { createDefaultPrivacy, createDefaultTheme, createManifestFromSession } from "./manifest";
import type { MoriPackageV0 } from "./types";
import { validateMoriPackage } from "./validation";

export type CreateMoriPackageOptions = {
  /**
   * Accepted project memory to carry with the package. Defaults to an
   * empty list so a package can always be exported, with or without
   * consolidated memory.
   */
  consolidatedMemories?: readonly StoredAcceptedProjectMemory[];
  /**
   * Memory Audit Trail review actions to carry with the package.
   * Defaults to an empty list so a package can always be exported,
   * with or without review history.
   */
  auditTrail?: readonly StoredMemoryReviewAction[];
};

export function createMoriPackageFromSession(
  data: MockSession,
  options: CreateMoriPackageOptions = {},
): MoriPackageV0 {
  return {
    manifest: createManifestFromSession(data),
    projects: [data.project],
    sessions: [data.session],
    events: data.events,
    issues: data.issues,
    decisions: data.decisions,
    relationships: data.relationships,
    sources: data.sources,
    nextActions: data.nextActions,
    artifacts: data.artifacts,
    summaries: [data.summary],
    privacy: createDefaultPrivacy(data.session.recordingMode),
    theme: createDefaultTheme(),
    consolidatedMemories: options.consolidatedMemories
      ? [...options.consolidatedMemories]
      : [],
    auditTrail: options.auditTrail ? [...options.auditTrail] : [],
  };
}

export function serializeMoriPackage(pkg: MoriPackageV0): string {
  const validation = validateMoriPackage(pkg);
  if (!validation.valid) {
    const messages = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid Mori package: ${messages}`);
  }

  return JSON.stringify(pkg, null, 2);
}

export function exportMoriPackageAsJson(pkg: MoriPackageV0): Blob {
  return new Blob([serializeMoriPackage(pkg)], { type: "application/vnd.mori.package+json" });
}

export function serializeEventsJsonl(pkg: MoriPackageV0): string {
  return pkg.events.map((event) => JSON.stringify(event)).join("\n");
}
