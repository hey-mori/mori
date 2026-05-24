import type { LucideIcon } from "lucide-react";

export type ViewKey =
  | "home"
  | "start"
  | "session"
  | "timeline"
  | "flow"
  | "evidence"
  | "review"
  | "reports"
  | "memory"
  | "consolidation"
  | "companion"
  | "connections"
  | "workspace"
  /** Project workspace — aggregates every session that shares a sourceLabel. */
  | "project"
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
/**
 * Who (or what) produced a timeline event. Stamped at import from the Claude
 * `role` + tool-use/tool-result classification, so the conversation flow no
 * longer has to guess roles from text at render time. Legacy events imported
 * before this field omit it; `inferActorFallback` reconstructs it for them.
 */
export type EventActor = "user" | "assistant" | "tool" | "file" | "decision" | "system";
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
  /**
   * Optional human-facing grouping label for the session — e.g. the Claude
   * project path (`C:/dev/mori`) the imported conversation came from. Set
   * when a session is created from an external import ("1 Claude
   * conversation = 1 Mori session"); the sidebar session switcher groups
   * sessions by this value. Additive — sessions created before this field
   * (manual Start Session, demo, older imports) simply omit it.
   */
  sourceLabel?: string;
  /**
   * ISO timestamp the user archived this session. Optional and additive:
   * archiving is a non-destructive "tidy away" — the session is hidden from
   * the default Workspace list (but reachable via the archive filter) and is
   * never deleted. Sessions saved before this field, and active sessions,
   * simply omit it. Clearing the field (un-archiving) restores the session
   * to the default list.
   */
  archivedAt?: string;
  /**
   * Optional actor id who created the session. Reserved for a future
   * multi-user workroom model (a Project containing sessions from multiple
   * teammates). Today this is always the implicit local user; callers should
   * treat `undefined` as `"local-user"`. The field is purely additive — no
   * UI consumes it yet, and saved sessions before this field load normally.
   */
  createdBy?: string;
  /**
   * Optional visibility tier for a future workroom model. Defaults to
   * `personal` when omitted, which matches today's single-user behaviour
   * (every session is the local user's). When a real team backend lands,
   * `team` sessions become visible to project members and `shared` sessions
   * include external collaborators under the client-safe filter rules.
   * Additive — no read path branches on this yet.
   */
  visibility?: SessionVisibility;
};

/**
 * Visibility tier for a session under the planned workroom model. Stored as
 * a stable string union so the persisted shape doesn't churn when the team
 * backend lands. See `docs/workroom-direction.md` for the lifecycle.
 */
export type SessionVisibility = "personal" | "team" | "shared";

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
   * Free-text note the user attached to the event from the inspector.
   * Additive — events imported before notes existed simply omit it. A note
   * is the user's own annotation; it never sets the AI-derived
   * `userModified` flag.
   */
  userNote?: string;
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
  /**
   * Token usage carried over from an imported Claude turn. Optional and
   * additive — only present on assistant events imported from a Claude
   * conversation that reported usage. Events created any other way (manual,
   * AI-derived, Claude Desktop, or older imports before this field) simply
   * omit it. `total` is `input + output`; `model` is the reporting model id
   * when known.
   */
  tokenUsage?: { input: number; output: number; total: number; model?: string };
  /**
   * Who produced this event, stamped at import from the source `role` and
   * tool classification (see `claudeImport.ts`). Additive — events imported
   * before this field, plus manual / AI-derived / demo events, omit it; the
   * conversation flow falls back to `inferActorFallback` for those.
   */
  actor?: EventActor;
  /**
   * Stable id of the conversation turn this event belongs to. A captured
   * Claude conversation is a sequence of turns; one imported turn becomes one
   * event today, but the id is carried as data so future per-message events
   * can be folded back together (see `buildTurns`). Additive — omitted on
   * events that are not part of a captured conversation.
   */
  turnId?: string;
  /** Zero-based ordinal of the turn within its conversation. Paired with `turnId`. */
  turnIndex?: number;
  /**
   * Name of the tool invoked, when `actor` is `'tool'` and the source
   * identified it (e.g. `"Bash"`). Additive and best-effort — omitted when the
   * tool could not be named.
   */
  toolName?: string;
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
  editedByUser?: boolean;
  editedAt?: string;
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
  editedByUser?: boolean;
  editedAt?: string;
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
  /** Set to `true` when the user edits the action's title or priority. */
  editedByUser?: boolean;
  editedAt?: string;
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
