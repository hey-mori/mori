import type { LucideIcon } from "lucide-react";

export type ViewKey =
  | "home"
  /** Retired landing surface, now the "이어가기" continuation view reached from
   *  Home's 검토 이어가기 action and the command palette. */
  | "continue"
  | "start"
  | "session"
  | "timeline"
  | "flow"
  | "evidence"
  | "review"
  | "reports"
  | "memory"
  | "consolidation"
  /** Ask Mori — a standalone "ask your reviewed memory" surface reached from
   *  the command palette; consumes the memory-api facade. */
  | "ask"
  | "companion"
  | "connections"
  | "dashboard"
  | "workbench"
  | "workspace"
  /** Project workspace — aggregates every session that shares a sourceLabel. */
  | "project"
  /** Experimental work-graph overview, reached from the command palette. */
  | "graph"
  /** Live Follow Lab, a palette-only dev screen that tails a running Claude
   *  Code session by delta read and lists the work under each request. */
  | "liveFollowLab"
  | "profile"
  | "login"
  | "security"
  | "settings";

export type TrustLevel = "verified" | "observed" | "inferred";
export type RecordingMode = "summary" | "full" | "ephemeral";
export type LlmProvider =
  | "deterministic"
  | "ollama"
  | "lmStudio"
  | "openAiCompatible"
  | "cloudApi";
export type SourceKind = 
  | "aiConversation" 
  | "claudeTranscript" 
  | "chatgptTranscript" 
  | "codexTranscript" 
  | "desktopTranscriptImport"
  | "connectorJsonl"
  | "browser" 
  | "browserTab"
  | "file" 
  | "fileSystem"
  | "editor"
  | "vscode"
  | "cursor"
  | "terminal" 
  | "terminalShell"
  | "manualNote" 
  | "url"
  | "docs"
  | "notion"
  | "slack"
  | "discord"
  | "figma"
  | "gitDiff"
  | "tauriGitDiff"
  | "git"
  | "gitCommand"
  | "githubPrImport"
  | "repository"
  | "linear"
  | "jira"
  | "buildLog"
  | "deployLog"
  | "automation";
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

/**
 * How complete / faithful a captured source looks relative to the work it
 * claims to represent. This judges the *capture*, not the content quality:
 * - `full` — the capture looks whole (a transcript with a natural start and
 *   both sides of the exchange, a valid full diff, a session bracketed by
 *   start/finish events).
 * - `partial` — a recognisable but incomplete capture (begins mid-stream,
 *   carries a truncation marker, one side of an exchange missing).
 * - `fragment` — both ends missing / a snippet (e.g. starts mid-conversation
 *   *and* is truncated).
 * - `unknown` — completeness cannot be assessed (e.g. a paste with no
 *   structure to read). Mori says "unknown" rather than guessing.
 *
 * It sits alongside `trustLevel` (who vouches for the data) and
 * `rawRetention` (how much we kept). Downstream consumers (Resume Prompt,
 * Reports, Project Memory) must never present `partial` / `fragment` /
 * `unknown` evidence as if it were a complete record.
 */
export type CaptureFidelityLevel = "full" | "partial" | "fragment" | "unknown";

/**
 * `reasons` are stable machine codes (not prose) explaining the level, e.g.
 * `"startsMidConversation"`, `"truncationMarker"`, `"noRoleMarkers"`. UI and
 * report builders map codes to locale copy. Kept as `string[]` (not a union)
 * so the persisted shape stays stable as new capture paths add their own
 * codes.
 */
export type CaptureFidelity = {
  level: CaptureFidelityLevel;
  reasons: string[];
};

/**
 * Coarse kind of change a tool made to a file. `wrote` is a fresh create /
 * overwrite, `edited` an in-place modification, `read` a consult (no change),
 * `touched` a path-bearing tool we do not specifically map. Kept as a small
 * open union so a new tool maps without a type change.
 */
export type FileChangeKind = "wrote" | "edited" | "read" | "touched" | (string & {});

/**
 * One file an agent's tool call touched, recovered from the structured tool
 * payload (e.g. a Claude Code `tool_use` block's `file_path`) before it is
 * flattened into rendered text. Faithful and minimal: one entry per touch, so
 * a file read three times appears three times. The per-file rollup, and
 * reconciling `path` against the current filesystem to detect moves /
 * deletions, are pure derivations done downstream, never baked in here.
 *
 * This is the source of truth for "what files did this session use, and how
 * did they change" and the foundation the timeline glyphs and the file panel
 * read from. See `docs/design/agent-work-visibility-vision.md` §1.
 */
export type FileTouch = {
  /** Absolute path exactly as the tool recorded it. Not validated. */
  path: string;
  /** The tool, e.g. "Edit", "Write", "Read", "MultiEdit", "NotebookEdit". */
  tool: string;
  changeKind: FileChangeKind;
  /** Timestamp of the originating event, or "" when unknown. */
  at: string;
  /**
   * Lines added / removed by this change, counted exactly from the tool
   * result's structured patch. Both 0 for a read or a change whose patch could
   * not be correlated. Optional — sources captured before line counts existed
   * omit them; consumers treat a missing value as 0.
   */
  additions?: number;
  deletions?: number;
  /**
   * Id of the agent turn / message this touch came from, used to attribute it
   * to a specific timeline event. Optional — present for agent sources whose
   * raw log exposes per-message ids (Claude Code today).
   */
  messageId?: string;
  /**
   * A bounded preview of the change — the added / removed lines only, capped to
   * a handful of short lines (summary-level, never the full file). Optional and
   * empty for reads or uncorrelated changes. Drives the inspector's diff peek.
   */
  diffPreview?: string;
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
  /**
   * Optional honest assessment of how complete the captured input looked at
   * import time. Additive — sources captured before this field, and paths
   * where completeness genuinely cannot be assessed, omit it; consumers treat
   * a missing value as `unknown` and never overclaim. See {@link CaptureFidelity}.
   */
  captureFidelity?: CaptureFidelity;
  /**
   * Files this source's tool calls touched, in order. Present on agent
   * sources whose raw log carries structured tool payloads (Claude Code
   * today). Additive — sources imported before this field, and sources with
   * no file activity, omit it; consumers treat a missing value as an empty
   * list. See {@link FileTouch}.
   */
  fileTouches?: FileTouch[];
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
   * Whether this turn was opened by a real user request (a human prompt, not a
   * tool result). Distinct from `actor`: a turn can run tools (so `actor` is
   * `'tool'`) yet still be the one the user kicked off. Marks the boundary of a
   * "request → AI work" unit and drives the 요청 affordance. Additive — omitted
   * on events that did not open with a user prompt, and on non-conversation
   * sources.
   */
  openedByUser?: boolean;
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
  /**
   * Files this turn's tool calls touched, attributed from the source's
   * `fileTouches` by message id. Present on agent-conversation events whose
   * turn ran file tools (Claude Code today); additive — omitted otherwise.
   * Lets the inspector and timeline show what a turn did to the codebase. See
   * {@link FileTouch}.
   */
  fileTouches?: FileTouch[];
  /**
   * Full text of the user's request for this turn, retained verbatim so the
   * inspector can show what was actually sent (the card `title` / `summary`
   * stay truncated for the dense timeline). The user's own words, so it is
   * privacy-gated by the same disclosure level as a request event. Additive —
   * omitted on events whose import keeps only a summary, or that carry no ask.
   */
  requestText?: string;
  /**
   * Full text of the assistant's reply for this turn, retained verbatim so the
   * inspector can show how it was answered in full. Additive — omitted when the
   * import keeps only a summary, or the turn has no reply.
   */
  responseText?: string;
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

export type MockSession = {
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
