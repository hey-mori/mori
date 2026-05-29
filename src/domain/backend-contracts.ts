import type {
  Artifact,
  Decision,
  Issue,
  LlmProvider,
  MockSession,
  NextAction,
  Project,
  RecordingMode,
  Relationship,
  Session,
  SourceKind,
  SourceRef,
  Summary,
  TimelineEvent,
} from "./types";

export type BackendCommand =
  | "projects.list"
  | "projects.create"
  | "sessions.create"
  | "sessions.stop"
  | "sessions.get"
  | "sources.import"
  | "timeline.list"
  | "issues.list"
  | "decisions.list"
  | "reports.exportMarkdown"
  | "package.save"
  | "package.open"
  | "llm.providers.list"
  | "analysis.quickPass";

export type CreateProjectInput = {
  name: string;
  description?: string;
};

export type CreateSessionInput = {
  projectId: string;
  title: string;
  recordingMode: RecordingMode;
  llmProvider: LlmProvider;
  llmModel: string;
  selectedSourceKinds: SourceKind[];
  storageLocation: string;
};

export type ImportSourceInput = {
  sessionId: string;
  kind: SourceKind;
  title: string;
  content?: string;
  uri?: string;
  retainRaw: boolean;
};

export type QuickPassInput = {
  sessionId: string;
  sourceIds: string[];
};

export type QuickPassOutput = {
  events: TimelineEvent[];
  issues: Issue[];
  decisions: Decision[];
  relationships: Relationship[];
  nextActions: NextAction[];
  summary: Summary;
};

export type MarkdownReportInput = {
  sessionId: string;
  includeTimeline: boolean;
  includeDecisions: boolean;
  includeIssues: boolean;
  includeFileChanges: boolean;
  includeAiConversations: boolean;
  includeResearch: boolean;
  includeNextActions: boolean;
  redactSensitiveInfo: boolean;
  maskFilePaths: boolean;
};

export type MarkdownReportOutput = {
  filename: string;
  markdown: string;
};

export type MoriPackageManifest = {
  formatVersion: "0.1";
  appName: "Mori";
  createdAt: string;
  updatedAt: string;
  projectId: string;
  sessionIds: string[];
  privacyMode: RecordingMode;
};

export type MoriPackageContents = {
  manifest: MoriPackageManifest;
  projects: Project[];
  sessions: Session[];
  events: TimelineEvent[];
  sources: SourceRef[];
  issues: Issue[];
  decisions: Decision[];
  relationships: Relationship[];
  artifacts: Artifact[];
  nextActions: NextAction[];
  summaries: Summary[];
};

export type SaveMoriPackageInput = {
  packagePath: string;
  contents: MoriPackageContents;
};

export type OpenMoriPackageOutput = {
  packagePath: string;
  contents: MoriPackageContents;
};

export type LlmProviderStatus = {
  provider: LlmProvider;
  label: string;
  endpoint?: string;
  installed: boolean;
  reachable: boolean;
  models: string[];
};

export type BackendCommandMap = {
  "projects.list": { input: undefined; output: Project[] };
  "projects.create": { input: CreateProjectInput; output: Project };
  "sessions.create": { input: CreateSessionInput; output: Session };
  "sessions.stop": { input: { sessionId: string }; output: MockSession };
  "sessions.get": { input: { sessionId: string }; output: MockSession };
  "sources.import": { input: ImportSourceInput; output: SourceRef };
  "timeline.list": { input: { sessionId: string }; output: TimelineEvent[] };
  "issues.list": { input: { sessionId: string }; output: Issue[] };
  "decisions.list": { input: { sessionId: string }; output: Decision[] };
  "reports.exportMarkdown": { input: MarkdownReportInput; output: MarkdownReportOutput };
  "package.save": { input: SaveMoriPackageInput; output: { packagePath: string } };
  "package.open": { input: { packagePath: string }; output: OpenMoriPackageOutput };
  "llm.providers.list": { input: undefined; output: LlmProviderStatus[] };
  "analysis.quickPass": { input: QuickPassInput; output: QuickPassOutput };
};

export type BackendCommandInput<TCommand extends BackendCommand> = BackendCommandMap[TCommand]["input"];
export type BackendCommandOutput<TCommand extends BackendCommand> = BackendCommandMap[TCommand]["output"];
