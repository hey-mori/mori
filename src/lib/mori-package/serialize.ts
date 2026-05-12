import type { MoriMockSession } from "../../domain/types";
import { createDefaultPrivacy, createDefaultTheme, createManifestFromSession } from "./manifest";
import type { MoriPackageV0 } from "./types";
import { validateMoriPackage } from "./validation";

export function createMoriPackageFromSession(data: MoriMockSession): MoriPackageV0 {
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
