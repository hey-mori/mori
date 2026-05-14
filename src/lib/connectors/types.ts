/**
 * Local connector capture types.
 *
 * These types describe the *foundation* for explicit, opt-in local connector
 * capture — they do NOT enable any background surveillance, network capture,
 * or account scraping. External tools (Claude Code hooks, Codex CLI
 * wrappers, post-commit scripts) write JSONL events to a local file; the
 * user explicitly imports that file from Mori; events flow through Import
 * Review before they ever touch the session store.
 */

import type { SourceRef, TimelineEvent } from "../../domain/types";

/**
 * Known connector identifiers. Free-form strings are allowed via
 * `string & {}` so external tools can ship their own ids without forcing a
 * registry update — Mori still validates that the value is a non-empty
 * string. Unknown ids fall back to the `manual` integration.
 */
export type ConnectorId =
  | "claudeCodeHook"
  | "codexCliWrapper"
  | "terminal"
  | "git"
  | "manual"
  | (string & {});

export const KNOWN_CONNECTOR_IDS = [
  "claudeCodeHook",
  "codexCliWrapper",
  "terminal",
  "git",
  "manual",
] as const;

export type ConnectorEventKind =
  | "session_started"
  | "prompt_submitted"
  | "assistant_message"
  | "tool_started"
  | "tool_finished"
  | "file_changed"
  | "command_started"
  | "command_finished"
  | "git_diff_captured"
  | "commit_created"
  | "session_finished";

export const CONNECTOR_EVENT_KINDS: readonly ConnectorEventKind[] = [
  "session_started",
  "prompt_submitted",
  "assistant_message",
  "tool_started",
  "tool_finished",
  "file_changed",
  "command_started",
  "command_finished",
  "git_diff_captured",
  "commit_created",
  "session_finished",
];

export type ConnectorCaptureMethod =
  | "manual_paste"
  | "local_hook"
  | "local_cli_wrapper"
  | "local_desktop_command"
  | "planned_extension";

export const CONNECTOR_CAPTURE_METHODS: readonly ConnectorCaptureMethod[] = [
  "manual_paste",
  "local_hook",
  "local_cli_wrapper",
  "local_desktop_command",
  "planned_extension",
];

export type ConnectorRawDataPolicy =
  | "summary_only"
  | "retained"
  | "redacted"
  | "reference_only";

export const CONNECTOR_RAW_DATA_POLICIES: readonly ConnectorRawDataPolicy[] = [
  "summary_only",
  "retained",
  "redacted",
  "reference_only",
];

/**
 * Privacy boundary recorded alongside every connector event. The connector
 * tool is expected to set these explicitly; the ingest layer treats missing
 * fields as the most restrictive choice.
 */
export type ConnectorPrivacyBoundary = {
  /** Capture method tag — answers "how did this event reach Mori?" */
  captureMethod: ConnectorCaptureMethod;
  /** Raw data retention policy — answers "what does Mori keep?" */
  rawDataPolicy: ConnectorRawDataPolicy;
  /** Whether the event passed through automatic redaction on the way in. */
  redacted?: boolean;
  /** Free-form privacy note attached by the tool, surfaced to the user. */
  note?: string;
};

/** Provenance describes the tool that produced the event. */
export type ConnectorProvenance = {
  /** Tool name (e.g. "mori-codex-wrapper", "claude-code/hook.sh"). */
  toolName: string;
  /** Tool version if available. */
  toolVersion?: string;
  /** Host OS + machine name if the tool chooses to record them. Optional. */
  host?: string;
};

export type ConnectorGitMetadata = {
  repoPath?: string;
  branch?: string;
  headCommit?: string;
  shortHeadCommit?: string;
  isDirty?: boolean;
  /** Files touched by this event (e.g. for `file_changed` / `commit_created`). */
  files?: ConnectorFileChange[];
  /** Aggregate counts for diff events. */
  additions?: number;
  deletions?: number;
};

export type ConnectorFileChange = {
  path: string;
  changeType?: "added" | "modified" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
  renameFrom?: string;
};

export type ConnectorToolMetadata = {
  name: string;
  input?: string;
  output?: string;
  /** Returned exit code or status when applicable. */
  exitCode?: number;
  /** Duration in ms (for command_finished / tool_finished). */
  durationMs?: number;
};

/**
 * Single connector event. Optional fields cluster by event kind: tool /
 * command / git / file. Validation enforces presence of the required
 * cluster for each kind so the normalizer can rely on shape.
 */
export type ConnectorEvent = {
  id: string;
  connectorId: ConnectorId;
  kind: ConnectorEventKind;
  /** When the event occurred on the user's machine (ISO 8601). */
  occurredAt: string;
  /** When Mori received the event. Defaults to `occurredAt` if missing. */
  receivedAt?: string;
  /** Optional project hint — Mori uses the active session if missing. */
  projectPath?: string;
  /** Optional external session id — used to bucket events under one source. */
  sessionId?: string;
  /** Short human title (e.g. the user prompt summary). */
  sourceTitle?: string;
  /** Short summary text shown in Import Review. */
  summary: string;
  /** Optional raw text payload. NEVER persisted unless rawDataPolicy says so. */
  rawText?: string;
  /** Optional command line for terminal / cli events. */
  command?: string;
  /** Optional file path for file_changed events. */
  filePath?: string;
  /** Optional git metadata. */
  git?: ConnectorGitMetadata;
  /** Optional tool metadata for tool_started / tool_finished. */
  tool?: ConnectorToolMetadata;
  privacy: ConnectorPrivacyBoundary;
  provenance: ConnectorProvenance;
};

/**
 * Multiple events imported together (e.g. one JSONL file). Validation runs
 * over each line; malformed lines are reported but never crash the import.
 */
export type ConnectorEventBatch = {
  events: ConnectorEvent[];
  /** Optional batch-level metadata (e.g. JSONL filename, session id). */
  meta?: {
    filename?: string;
    sessionId?: string;
    capturedAt?: string;
  };
};

export type ConnectorValidationError = {
  /** Line number in the original JSONL (1-based), if applicable. */
  line?: number;
  /** Index into the input array, if applicable. */
  index?: number;
  /** Field name that failed validation. `null` when the failure was at
   *  parse time (malformed JSON). */
  field: string | null;
  message: string;
};

export type ConnectorParseOutcome = {
  /** Validated events that parsed cleanly. */
  events: ConnectorEvent[];
  /** Parse / validation errors. Never throws — caller decides what to do. */
  errors: ConnectorValidationError[];
  /** Number of input lines that were skipped because they were empty / comments. */
  skippedBlankLines: number;
};

export type ConnectorIngestResult = {
  outcome: ConnectorParseOutcome;
  /** Normalized import candidates ready to feed Import Review. */
  candidates: NormalizedImportCandidateLike[];
};

/**
 * Local type alias of the shape produced by the existing `normalize*`
 * helpers in `src/lib/import/`. We re-declare it here so this module does
 * not have a circular dependency on the import module.
 */
export type NormalizedImportCandidateLike = {
  source: SourceRef;
  events: TimelineEvent[];
};
