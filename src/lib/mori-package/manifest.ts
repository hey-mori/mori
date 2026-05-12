import type { MoriMockSession, RecordingMode } from "../../domain/types";
import type { MoriPackageManifestV0, MoriPackagePrivacyV0, MoriPackageThemeV0 } from "./types";

export function createPackageId(projectId: string, sessionId: string): string {
  return `mori_${projectId}_${sessionId}`;
}

export function createManifestFromSession(data: MoriMockSession): MoriPackageManifestV0 {
  const now = new Date().toISOString();
  return {
    appName: "Mori",
    formatVersion: "0.1.0",
    packageId: createPackageId(data.project.id, data.session.id),
    createdAt: now,
    updatedAt: now,
    projectIds: [data.project.id],
    sessionIds: [data.session.id],
    primarySessionId: data.session.id,
    recordingMode: data.session.recordingMode,
  };
}

export function createDefaultPrivacy(recordingMode: RecordingMode): MoriPackagePrivacyV0 {
  return {
    localFirst: true,
    cloudOptIn: false,
    rawDataPolicy: recordingMode === "full" ? "retained" : recordingMode === "ephemeral" ? "deleted" : "summaryOnly",
    redactionEnabled: true,
    sensitiveAppBlocklist: ["password manager", "banking", "private messenger", "incognito", "keychain", "2FA"],
  };
}

export function createDefaultTheme(): MoriPackageThemeV0 {
  return {
    theme: "formal",
    accent: "purple",
  };
}
