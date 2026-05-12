import type { LucideIcon } from "lucide-react";

export type ViewKey = "start" | "timeline" | "flow" | "issues" | "reports" | "sources" | "projects" | "settings";

export type TrustLevel = "verified" | "observed" | "inferred";
export type RecordingMode = "summary" | "full" | "ephemeral";
export type LlmProvider = "ollama" | "lmStudio" | "openAiCompatible" | "cloudApi";
export type SourceKind = "aiConversation" | "browser" | "file" | "terminal" | "manualNote" | "gitDiff";
export type RelationshipType =
  | "ledTo"
  | "caused"
  | "supported"
  | "contradicted"
  | "createdIssue"
  | "resolvedIssue"
  | "influencedDecision"
  | "producedArtifact"
  | "splitFrom"
  | "mergedInto";
export type IssueStatus = "open" | "inProgress" | "resolved" | "watching";
export type Priority = "high" | "medium" | "low";
export type EventType = "aiConversation" | "decision" | "issue" | "fileCode" | "webResearch" | "documentNote" | "artifact" | "other";
export type CreatedBy = "user" | "ai" | "system" | "import";

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  projectId: string;
  title: string;
  startedAt: string;
  endedAt: string;
  recordingMode: RecordingMode;
  llmProvider: LlmProvider;
  llmModel: string;
  storageLocation: string;
  selectedSourceIds: string[];
  status: "recording" | "analyzing" | "complete";
};

export type SourceRef = {
  id: string;
  sessionId: string;
  kind: SourceKind;
  title: string;
  detail: string;
  uri?: string;
  trustLevel: TrustLevel;
  redactionStatus: "notNeeded" | "redacted" | "pending";
  rawRetention: "retained" | "deleted" | "summaryOnly";
  capturedAt: string;
  relatedEventIds: string[];
};

export type TimelineEvent = {
  id: string;
  sessionId: string;
  projectId: string;
  start: string;
  end?: string;
  type: EventType;
  title: string;
  summary: string;
  sourceRefs: string[];
  linkedIssueIds: string[];
  linkedDecisionIds: string[];
  relationshipIds: string[];
  artifactIds?: string[];
  trustLevel: TrustLevel;
  confidence: number;
  createdBy: CreatedBy;
  userModified: boolean;
};

export type Issue = {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  sourceEventIds: string[];
  relatedDecisionIds: string[];
  relatedFileIds: string[];
  suggestedNextAction: string;
  assignee?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  trustLevel: TrustLevel;
};

export type Decision = {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  decision: string;
  rationale: string;
  rejectedOptions: string[];
  impact: string[];
  sourceEventIds: string[];
  relatedIssueIds: string[];
  relatedSourceIds: string[];
  createdAt: string;
  importance: Priority;
  trustLevel: TrustLevel;
  confirmed: boolean;
};

export type Relationship = {
  id: string;
  fromId: string;
  fromType: "event" | "issue" | "decision" | "artifact";
  toId: string;
  toType: "event" | "issue" | "decision" | "artifact";
  type: RelationshipType;
  confidence: number;
  reason: string;
};

export type Artifact = {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  kind: "document" | "code" | "report" | "prompt" | "design" | "email" | "package";
  path?: string;
  sourceEventIds: string[];
  createdAt: string;
};

export type NextAction = {
  id: string;
  sessionId: string;
  title: string;
  priority: Priority;
  relatedIssueIds: string[];
  relatedEventIds: string[];
};

export type Summary = {
  id: string;
  sessionId: string;
  sessionSummary: string;
  resumePrompt: string;
  reportMarkdown: string;
  nextActionIds: string[];
  generatedAt: string;
};

export type SourceOption = {
  id: string;
  name: string;
  detail: string;
  kind: SourceKind;
  enabled: boolean;
  selected: boolean;
  icon: LucideIcon;
};

export type MoriMockSession = {
  project: Project;
  session: Session;
  sources: SourceRef[];
  events: TimelineEvent[];
  issues: Issue[];
  decisions: Decision[];
  relationships: Relationship[];
  artifacts: Artifact[];
  nextActions: NextAction[];
  summary: Summary;
};
