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
};

export type MoriPackageValidationIssue = {
  path: string;
  message: string;
};

export type MoriPackageValidationResult = {
  valid: boolean;
  issues: MoriPackageValidationIssue[];
};
