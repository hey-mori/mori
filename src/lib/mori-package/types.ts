import type {
  Artifact,
  Decision,
  Issue,
  NextAction,
  Project,
  RecordingMode,
  Relationship,
  Session,
  SourceRef,
  Summary,
  TimelineEvent,
} from "../../domain/types";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

export type MoriPackageFormatVersion = "0.1.0";

export type MoriPackageManifestV0 = {
  appName: "Mori";
  formatVersion: MoriPackageFormatVersion;
  packageId: string;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
  sessionIds: string[];
  primarySessionId?: string;
  recordingMode: RecordingMode;
  /**
   * Set to `true` when the package was produced by the client-safe
   * export filter (`buildClientSafeMoriPackage`) — it carries only
   * `clientSafe`, non-sensitive accepted memory. Optional and additive:
   * absent on every normal package, so no `formatVersion` bump is
   * required. An importer can surface that the package was filtered.
   */
  clientSafeExport?: boolean;
};

export type MoriPackagePrivacyV0 = {
  localFirst: true;
  cloudOptIn: boolean;
  rawDataPolicy: "summaryOnly" | "retained" | "deleted";
  redactionEnabled: boolean;
  sensitiveAppBlocklist: string[];
};

export type MoriPackageThemeV0 = {
  theme: "formal" | "forest" | "nightLake";
  accent: "purple" | "green" | "blue";
};

export type MoriPackageV0 = {
  manifest: MoriPackageManifestV0;
  projects: Project[];
  sessions: Session[];
  events: TimelineEvent[];
  issues: Issue[];
  decisions: Decision[];
  relationships: Relationship[];
  sources: SourceRef[];
  nextActions: NextAction[];
  artifacts: Artifact[];
  summaries: Summary[];
  privacy: MoriPackagePrivacyV0;
  theme: MoriPackageThemeV0;
  /**
   * Accepted (reviewed, durable) project memory carried with the
   * package so it can travel between devices. Optional and additive:
   * packages exported before this field existed deserialize with it
   * absent and are treated as an empty list — no format-version bump
   * is required for an absent-safe additive field.
   *
   * Importing a package never auto-merges these records into durable
   * memory; the import path re-enters them for review, preserving the
   * review-before-apply rule.
   */
  consolidatedMemories?: StoredAcceptedProjectMemory[];
  /**
   * Memory Audit Trail review actions (`accept` / `edit` / `apply`
   * etc.) that produced the package's accepted memory. Optional and
   * additive in the same way as `consolidatedMemories`: packages
   * exported before this field existed deserialize with it absent and
   * are treated as an empty list — no format-version bump is required.
   *
   * These rows are history, not writes. Importing a package never
   * replays them; they travel so an exported package preserves the
   * review history behind its accepted memory.
   */
  auditTrail?: StoredMemoryReviewAction[];
};

export type MoriPackageValidationIssue = {
  path: string;
  message: string;
};

export type MoriPackageValidationResult = {
  valid: boolean;
  issues: MoriPackageValidationIssue[];
};
