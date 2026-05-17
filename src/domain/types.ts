import type { LucideIcon } from "lucide-react";

export type ViewKey =
  | "start"
  | "timeline"
  | "flow"
  | "evidence"
  | "review"
  | "reports"
  | "memory"
  | "consolidation"
  | "companion"
  | "workspace"
  | "profile"
  | "login"
  | "security"
  | "settings";

export type TrustLevel = "verified" | "observed" | "inferred";
export type RecordingMode = "summary" | "full" | "ephemeral";
export type LlmProvider = "ollama" | "lmStudio" | "openAiCompatible" | "cloudApi";
export type SourceKind = 
  | "aiConversation" 
  | "claudeTranscript" 
  | "chatgptTranscript" 
  | "codexTranscript" 
  | "browser" 
  | "file" 
  | "terminal" 
  | "manualNote" 
  | "gitDiff";
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
  /**
   * Stable identity from an external connector (Claude Code hook / Codex
   * CLI wrapper / terminal / git connector). Optional — only present on
   * events imported through a Mori connector JSONL pass. Mori uses this
   * for duplicate detection on subsequent connector imports.
   *
   * Encoded as `<connectorId>::<externalSessionId|unscoped>::<eventId>` so
   * the same raw `event.id` re-used across distinct connector sessions
   * stays distinct in the duplicate index.
   */
  connectorEventId?: string;
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
  /**
   * User-set completion state. Optional so sessions saved before the
   * Next Action completion capability default to pending. `completedAt`
   * is an ISO timestamp set when the user marks the action done; it is
   * cleared when the action is reopened.
   */
  done?: boolean;
  completedAt?: string;
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
  /**
   * Whether this capture source is an explicit import that works
   * today (`available`) or a not-yet-built integration (`planned`).
   * The Start Session picker only lets `available` sources be
   * selected — it never implies Mori captures a planned surface.
   */
  status: "available" | "planned";
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
