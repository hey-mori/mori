import { invoke } from "@tauri-apps/api/core";
import type { MockSession } from "../../domain/types";
import type {
  ClearAllSqliteDataResult,
  DatabaseStatus,
  ListSessionsOutput,
  PersistSessionSnapshotOutput,
  PersistSqliteSnapshotInput,
  SqliteBackupInfo,
} from "../sqlite/repositoryContracts";
import type { SqlitePersistenceSnapshot } from "../sqlite/records";
import type {
  SqliteAcceptedMemoryRow,
  SqliteAcceptedMemoryWriteResult,
  SqliteMemoryReviewActionRow,
  SqliteMemoryReviewActionWriteResult,
} from "../sqlite/acceptedMemoryRows";
import type {
  SqliteSessionImportRow,
  SqliteSessionImportWriteResult,
} from "../sqlite/sessionImportRows";
import type {
  SqliteIntakeRequestRow,
  SqliteIntakeWriteResult,
} from "../sqlite/intakeRequestRows";
import type {
  DurableDocumentKind,
  SqliteDurableDocumentRow,
  SqliteDurableDocumentWriteResult,
} from "../sqlite/durableDocumentRows";
import type {
  SqliteKernelObjectRow,
  SqliteKernelRecordRow,
  SqliteKernelRevisionRow,
  SqliteKernelWriteResult,
} from "../sqlite/kernelRows";
import type {
  ClaudeCodeSessionDelta,
  ClaudeCodeSessionWindow,
  ClaudeCodeSearchBatch,
  ClaudeCodeSessionArchive,
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
  ClaudeConversationDetail,
  ClaudeConversationMeta,
  ClaudeDesktopDiscovery,
} from "../claude/types";
import type { LocalAiToolReport } from "../claude/installations";
import type { ResolvedFileLocation } from "../file-provenance/fileProvenance";
import type { CodexSessionDetail, CodexSessionMeta } from "../codex/types";
import type { AntigravitySessionDetail, AntigravitySessionMeta } from "../antigravity/types";
import type { OpenCodeSessionDetail, OpenCodeSessionMeta } from "../opencode/types";
import type { ContinueSessionDetail, ContinueSessionMeta } from "../continueAgent/types";
import type { ClineSessionDetail, ClineSessionMeta } from "../cline/types";
import type { CursorSessionDetail, CursorSessionMeta } from "../cursor/types";
import type {
  ClaudeHookInstallResult,
  ClaudeHookUninstallResult,
  ConnectorDetectionResult,
} from "../connectors/installers/connectorInstaller";
import { createDesktopUnavailableError, isTauriRuntime } from "./environment";
import type { LlmHttpRequest, LlmHttpResponse } from "./llmHttp";
import type { GitDiffCaptureRequest, GitDiffCaptureResult } from "./gitCommands";
import type { RepositoryVerificationResult, VerifyRepositoryRequest } from "./repositoryCommands";

export type TauriCommandName =
  | "get_app_info"
  | "host_platform"
  | "send_os_notification"
  | "get_storage_location"
  | "set_storage_location"
  | "save_mori_package_json"
  | "save_mori_package_json_as"
  | "save_mori_package_zip_as"
  | "open_mori_package_json"
  | "read_mori_package_file"
  | "pick_mori_package_file"
  | "list_recent_mori_packages"
  | "get_sqlite_migration_status"
  | "initialize_sqlite_database"
  | "persist_session_snapshot"
  | "load_sqlite_session_snapshot"
  | "list_sqlite_sessions"
  | "save_accepted_project_memories"
  | "list_accepted_project_memories"
  | "list_all_accepted_project_memories"
  | "append_memory_review_action_rows"
  | "list_memory_review_action_rows"
  | "persist_session_imports"
  | "list_session_import_rows"
  | "save_intake_request_rows"
  | "list_intake_request_rows_for_session"
  | "list_intake_request_rows_for_project"
  | "list_all_intake_request_rows"
  | "delete_intake_request_rows_for_session"
  | "save_durable_document_rows"
  | "get_durable_document_row"
  | "list_durable_document_rows"
  | "delete_durable_document_row"
  | "list_all_session_import_rows"
  | "save_kernel_record_rows"
  | "list_kernel_record_rows"
  | "get_kernel_record_row"
  | "delete_kernel_record_row"
  | "search_kernel_record_rows"
  | "save_kernel_object_rows"
  | "list_kernel_object_rows"
  | "delete_kernel_object_row"
  | "append_kernel_revision_rows"
  | "list_kernel_revision_rows"
  | "clear_all_sqlite_data"
  | "reset_sqlite_database"
  | "list_sqlite_backups"
  | "restore_sqlite_backup"
  | "run_git_diff"
  | "pick_repository_directory"
  | "verify_repository_path"
  | "list_connector_jsonl_inbox"
  | "read_connector_jsonl_file"
  | "write_lens_capability"
  | "list_lens_transfers"
  | "read_lens_transfer"
  | "import_lens_transfer"
  | "detect_connector_status"
  | "install_claude_hook"
  | "uninstall_claude_hook"
  | "stage_mori_cli"
  | "mori_cli_target_path"
  | "stage_explicit_emitters"
  | "stage_mcp_server"
  | "mcp_server_target_path"
  | "discover_claude_desktop"
  | "list_claude_desktop_conversations"
  | "get_claude_desktop_conversation"
  | "discover_claude_code_sessions"
  | "get_claude_code_session"
  | "get_claude_code_session_delta"
  | "get_claude_code_session_window"
  | "search_claude_code_session"
  | "archive_claude_code_session"
  | "remove_claude_code_archive"
  | "claude_code_archive_dir"
  | "verify_claude_code_archive"
  | "claude_code_cleanup_policy"
  | "claude_code_source_presence"
  | "resolve_file_locations"
  | "reveal_path_in_os"
  | "llm_http_request"
  | "llm_http_stream"
  | "cancel_llm_stream"
  | "set_llm_allowed_endpoints"
  | "discover_local_ai_tools"
  | "discover_codex_sessions"
  | "get_codex_session"
  | "discover_antigravity_sessions"
  | "get_antigravity_session"
  | "discover_opencode_sessions"
  | "get_opencode_session"
  | "discover_continue_sessions"
  | "get_continue_session"
  | "discover_cline_sessions"
  | "get_cline_session"
  | "discover_cursor_sessions"
  | "get_cursor_session";

export type AppInfo = {
  name: string;
  version: string;
  identifier: string;
};

export type StorageLocation = {
  path: string;
  exists: boolean;
};

export type StorageRelocation = {
  /** The new storage directory, or `null` when the user cancelled the picker. */
  path: string | null;
  cancelled: boolean;
  /** Whether an existing `mori.sqlite` was carried over to the new location. */
  movedDb: boolean;
};

export type SavedMoriPackage = {
  path: string;
  bytes_written: number;
};

export type SavedMoriPackageDialog = {
  /** Absolute path written, or `null` when the user cancelled. */
  path: string | null;
  bytesWritten: number;
  cancelled: boolean;
};

export type PickedMoriPackageFile = {
  /** Absolute path chosen, or `null` when the user cancelled. */
  path: string | null;
  cancelled: boolean;
};

export type RecentMoriPackage = {
  path: string;
  filename: string;
  size_bytes: number;
};

export type SaveMoriPackageJsonInput = {
  serializedPackage: string;
  suggestedFilename?: string;
};

export type SaveMoriPackageZipInput = {
  /** Zip archive bytes (from `zipMoriPackage`), as a plain number array. */
  packageBytes: number[];
  suggestedFilename?: string;
};

export type TauriCommandMap = {
  get_app_info: { input: undefined; output: AppInfo };
  host_platform: { input: undefined; output: string };
  send_os_notification: { input: { title: string; body: string }; output: null };
  get_storage_location: { input: undefined; output: StorageLocation };
  set_storage_location: { input: undefined; output: StorageRelocation };
  save_mori_package_json: { input: SaveMoriPackageJsonInput; output: SavedMoriPackage };
  save_mori_package_json_as: {
    input: SaveMoriPackageJsonInput;
    output: SavedMoriPackageDialog;
  };
  save_mori_package_zip_as: {
    input: SaveMoriPackageZipInput;
    output: SavedMoriPackageDialog;
  };
  open_mori_package_json: { input: { path: string }; output: string };
  read_mori_package_file: { input: { path: string }; output: number[] };
  pick_mori_package_file: { input: undefined; output: PickedMoriPackageFile };
  list_recent_mori_packages: { input: undefined; output: RecentMoriPackage[] };
  get_sqlite_migration_status: { input: undefined; output: DatabaseStatus };
  initialize_sqlite_database: { input: undefined; output: DatabaseStatus };
  persist_session_snapshot: { input: PersistSqliteSnapshotInput; output: PersistSessionSnapshotOutput };
  load_sqlite_session_snapshot: { input: { sessionId: string }; output: SqlitePersistenceSnapshot };
  list_sqlite_sessions: { input: undefined; output: ListSessionsOutput };
  save_accepted_project_memories: {
    input: { memories: SqliteAcceptedMemoryRow[] };
    output: SqliteAcceptedMemoryWriteResult;
  };
  list_accepted_project_memories: {
    input: { projectId: string };
    output: SqliteAcceptedMemoryRow[];
  };
  list_all_accepted_project_memories: {
    input: undefined;
    output: SqliteAcceptedMemoryRow[];
  };
  append_memory_review_action_rows: {
    input: { actions: SqliteMemoryReviewActionRow[] };
    output: SqliteMemoryReviewActionWriteResult;
  };
  list_memory_review_action_rows: {
    input: { projectId: string };
    output: SqliteMemoryReviewActionRow[];
  };
  save_kernel_record_rows: {
    input: { records: SqliteKernelRecordRow[] };
    output: SqliteKernelWriteResult;
  };
  list_kernel_record_rows: { input: undefined; output: SqliteKernelRecordRow[] };
  get_kernel_record_row: { input: { id: string }; output: SqliteKernelRecordRow | null };
  delete_kernel_record_row: { input: { id: string }; output: number };
  search_kernel_record_rows: {
    input: { query: string; limit?: number };
    output: SqliteKernelRecordRow[];
  };
  save_kernel_object_rows: {
    input: { objects: SqliteKernelObjectRow[] };
    output: SqliteKernelWriteResult;
  };
  list_kernel_object_rows: {
    input: { collection: string };
    output: SqliteKernelObjectRow[];
  };
  delete_kernel_object_row: { input: { collection: string; id: string }; output: number };
  append_kernel_revision_rows: {
    input: { revisions: SqliteKernelRevisionRow[] };
    output: SqliteKernelWriteResult;
  };
  list_kernel_revision_rows: {
    input: { recordId: string };
    output: SqliteKernelRevisionRow[];
  };
  persist_session_imports: {
    input: { imports: SqliteSessionImportRow[] };
    output: SqliteSessionImportWriteResult;
  };
  list_session_import_rows: {
    input: { sessionId: string };
    output: SqliteSessionImportRow[];
  };
  list_all_session_import_rows: {
    input: undefined;
    output: SqliteSessionImportRow[];
  };
  save_intake_request_rows: {
    input: { rows: SqliteIntakeRequestRow[] };
    output: SqliteIntakeWriteResult;
  };
  list_intake_request_rows_for_session: {
    input: { sessionKey: string };
    output: SqliteIntakeRequestRow[];
  };
  list_intake_request_rows_for_project: {
    input: { projectPath: string };
    output: SqliteIntakeRequestRow[];
  };
  list_all_intake_request_rows: { input: undefined; output: SqliteIntakeRequestRow[] };
  delete_intake_request_rows_for_session: {
    input: { sessionKey: string };
    output: number;
  };
  save_durable_document_rows: {
    input: { documents: SqliteDurableDocumentRow[] };
    output: SqliteDurableDocumentWriteResult;
  };
  get_durable_document_row: {
    input: { kind: DurableDocumentKind; ownerId: string };
    output: SqliteDurableDocumentRow | null;
  };
  list_durable_document_rows: {
    input: { kind: DurableDocumentKind };
    output: SqliteDurableDocumentRow[];
  };
  delete_durable_document_row: {
    input: { kind: DurableDocumentKind; ownerId: string };
    output: number;
  };
  clear_all_sqlite_data: { input: undefined; output: ClearAllSqliteDataResult };
  reset_sqlite_database: { input: undefined; output: null };
  list_sqlite_backups: { input: undefined; output: SqliteBackupInfo[] };
  restore_sqlite_backup: { input: { backupPath: string }; output: null };
  run_git_diff: { input: { request: GitDiffCaptureRequest }; output: GitDiffCaptureResult };
  pick_repository_directory: {
    input: { input?: { initialDirectory?: string; title?: string } };
    output: { path: string | null; cancelled: boolean };
  };
  verify_repository_path: { input: { request: VerifyRepositoryRequest }; output: RepositoryVerificationResult };
  list_connector_jsonl_inbox: { input: undefined; output: ConnectorInboxListing };
  read_connector_jsonl_file: { input: { input: { path: string } }; output: ConnectorJsonlFile };
  write_lens_capability: { input: undefined; output: string };
  list_lens_transfers: { input: undefined; output: LensInboxListing };
  read_lens_transfer: { input: { file_name: string }; output: LensTransferPayload };
  import_lens_transfer: { input: { file_name: string }; output: LensImportResult };
  detect_connector_status: { input: undefined; output: ConnectorDetectionResult[] };
  install_claude_hook: {
    input: { scope: "global" | "project"; command: string; projectPath?: string };
    output: ClaudeHookInstallResult;
  };
  uninstall_claude_hook: {
    input: { scope: "global" | "project"; projectPath?: string };
    output: ClaudeHookUninstallResult;
  };
  stage_mori_cli: {
    input: undefined;
    output: {
      rootPath: string;
      cliPath: string;
      files: Array<{ label: string; path: string; wrote: boolean }>;
      wroteCount: number;
    };
  };
  mori_cli_target_path: { input: undefined; output: string };
  stage_explicit_emitters: {
    input: undefined;
    output: {
      rootPath: string;
      localCapturePath: string;
      terminalHelperPath: string;
      vscodeTasksPath: string;
      files: Array<{ label: string; path: string; wrote: boolean }>;
      wroteCount: number;
    };
  };
  stage_mcp_server: { input: undefined; output: { scriptPath: string; wrote: boolean } };
  mcp_server_target_path: { input: undefined; output: string };
  discover_claude_desktop: { input: undefined; output: ClaudeDesktopDiscovery };
  list_claude_desktop_conversations: { input: undefined; output: ClaudeConversationMeta[] };
  get_claude_desktop_conversation: {
    input: { conversationId: string };
    output: ClaudeConversationDetail;
  };
  discover_claude_code_sessions: { input: undefined; output: ClaudeCodeSessionMeta[] };
  get_claude_code_session: {
    input: { sessionPath: string };
    output: ClaudeCodeSessionDetail;
  };
  get_claude_code_session_delta: {
    input: { sessionPath: string; byteOffset: number };
    output: ClaudeCodeSessionDelta;
  };
  get_claude_code_session_window: {
    input: {
      sessionPath: string;
      beforeOffset: number | null;
      sourceId: string | null;
      anchor: string | null;
      endAnchor: string | null;
      afterOffset: number | null;
    };
    output: ClaudeCodeSessionWindow;
  };
  search_claude_code_session: {
    input: {
      sessionPath: string;
      query: string;
      beforeOffset: number | null;
      sourceId: string | null;
      anchor: string | null;
      maxHits: number | null;
      wholeWords: boolean;
    };
    output: ClaudeCodeSearchBatch;
  };
  archive_claude_code_session: { input: { sessionPath: string }; output: ClaudeCodeSessionArchive };
  remove_claude_code_archive: { input: { fileName: string }; output: boolean };
  claude_code_archive_dir: { input: Record<string, never>; output: string };
  verify_claude_code_archive: { input: { fileName: string; bytes: number }; output: "ok" | "missing" | "damaged" };
  claude_code_cleanup_policy: {
    input: Record<string, never>;
    output: { periodDays: number | null; source: "managed" | "user" | "unset" | "invalid" };
  };
  claude_code_source_presence: { input: { paths: string[] }; output: ("present" | "missing" | "unknown")[] };
  resolve_file_locations: {
    input: { paths: string[]; searchRoot?: string };
    output: ResolvedFileLocation[];
  };
  reveal_path_in_os: { input: { path: string }; output: null };
  llm_http_request: { input: { request: LlmHttpRequest }; output: LlmHttpResponse };
  // The channel is passed through untyped here: its element type lives with the
  // streaming bridge, which is the only caller, and duplicating the event union
  // in this table would give two places to keep in step with the Rust enum.
  llm_http_stream: {
    input: { request: LlmHttpRequest & { requestId: string }; onEvent: unknown };
    output: null;
  };
  cancel_llm_stream: { input: { requestId: string }; output: null };
  set_llm_allowed_endpoints: {
    input: { entries: Array<{ url: string; allowsAuthorization: boolean }> };
    output: number;
  };
  discover_local_ai_tools: { input: undefined; output: LocalAiToolReport };
  discover_codex_sessions: { input: undefined; output: CodexSessionMeta[] };
  get_codex_session: {
    input: { sessionPath: string };
    output: CodexSessionDetail;
  };
  discover_antigravity_sessions: { input: undefined; output: AntigravitySessionMeta[] };
  get_antigravity_session: {
    input: { sessionPath: string };
    output: AntigravitySessionDetail;
  };
  discover_opencode_sessions: { input: undefined; output: OpenCodeSessionMeta[] };
  get_opencode_session: {
    input: { sessionPath: string };
    output: OpenCodeSessionDetail;
  };
  discover_continue_sessions: { input: undefined; output: ContinueSessionMeta[] };
  get_continue_session: {
    input: { sessionPath: string };
    output: ContinueSessionDetail;
  };
  discover_cline_sessions: { input: undefined; output: ClineSessionMeta[] };
  get_cline_session: {
    input: { sessionPath: string };
    output: ClineSessionDetail;
  };
  discover_cursor_sessions: { input: undefined; output: CursorSessionMeta[] };
  get_cursor_session: {
    input: { sessionPath: string };
    output: CursorSessionDetail;
  };
};

export type ConnectorInboxListing = {
  rootPath: string;
  rootExists: boolean;
  files: ConnectorInboxFile[];
};

export type ConnectorInboxFile = {
  path: string;
  displayName: string;
  connectorFamily: string;
  sizeBytes: number;
  modifiedAt: string;
  relativePath: string;
};

export type ConnectorJsonlFile = {
  path: string;
  text: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type LensTransferPayload = {
  schemaVersion: number;
  transferId: string;
  original: string;
  answer: string;
  kind: string;
  sourceLanguage: string;
  targetLanguage: string;
  note: string;
  tags: string[];
  createdAt: string;
};

export type LensPendingTransfer = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  payload: LensTransferPayload;
  alreadyImported: boolean;
};

export type LensInboxListing = {
  directory: string;
  directoryExists: boolean;
  pending: LensPendingTransfer[];
};

export type LensImportResult = {
  recordId: string;
  transferId: string;
};

export async function invokeTauriCommand<TCommand extends TauriCommandName>(
  command: TCommand,
  input: TauriCommandMap[TCommand]["input"],
): Promise<TauriCommandMap[TCommand]["output"]> {
  if (!isTauriRuntime()) {
    throw createDesktopUnavailableError(command);
  }

  return invoke<TauriCommandMap[TCommand]["output"]>(command, toTauriArgs(input));
}

export const tauriCommands = {
  getAppInfo(): Promise<AppInfo> {
    return invokeTauriCommand("get_app_info", undefined);
  },
  getStorageLocation(): Promise<StorageLocation> {
    return invokeTauriCommand("get_storage_location", undefined);
  },
  setStorageLocation(): Promise<StorageRelocation> {
    return invokeTauriCommand("set_storage_location", undefined);
  },
  saveMoriPackageJson(input: SaveMoriPackageJsonInput): Promise<SavedMoriPackage> {
    return invokeTauriCommand("save_mori_package_json", input);
  },
  saveMoriPackageJsonAs(
    input: SaveMoriPackageJsonInput,
  ): Promise<SavedMoriPackageDialog> {
    return invokeTauriCommand("save_mori_package_json_as", input);
  },
  saveMoriPackageZipAs(
    input: SaveMoriPackageZipInput,
  ): Promise<SavedMoriPackageDialog> {
    return invokeTauriCommand("save_mori_package_zip_as", input);
  },
  openMoriPackageJson(path: string): Promise<string> {
    return invokeTauriCommand("open_mori_package_json", { path });
  },
  readMoriPackageFile(path: string): Promise<number[]> {
    return invokeTauriCommand("read_mori_package_file", { path });
  },
  pickMoriPackageFile(): Promise<PickedMoriPackageFile> {
    return invokeTauriCommand("pick_mori_package_file", undefined);
  },
  listRecentMoriPackages(): Promise<RecentMoriPackage[]> {
    return invokeTauriCommand("list_recent_mori_packages", undefined);
  },
  getSqliteMigrationStatus(): Promise<DatabaseStatus> {
    return invokeTauriCommand("get_sqlite_migration_status", undefined);
  },
  initializeSqliteDatabase(): Promise<DatabaseStatus> {
    return invokeTauriCommand("initialize_sqlite_database", undefined);
  },
  persistSessionSnapshot(input: PersistSqliteSnapshotInput): Promise<PersistSessionSnapshotOutput> {
    return invokeTauriCommand("persist_session_snapshot", input);
  },
  loadSqliteSessionSnapshot(sessionId: string): Promise<SqlitePersistenceSnapshot> {
    return invokeTauriCommand("load_sqlite_session_snapshot", { sessionId });
  },
  listSqliteSessions(): Promise<ListSessionsOutput> {
    return invokeTauriCommand("list_sqlite_sessions", undefined);
  },
  saveAcceptedProjectMemories(
    memories: SqliteAcceptedMemoryRow[],
  ): Promise<SqliteAcceptedMemoryWriteResult> {
    return invokeTauriCommand("save_accepted_project_memories", { memories });
  },
  listAcceptedProjectMemories(projectId: string): Promise<SqliteAcceptedMemoryRow[]> {
    return invokeTauriCommand("list_accepted_project_memories", { projectId });
  },
  listAllAcceptedProjectMemories(): Promise<SqliteAcceptedMemoryRow[]> {
    return invokeTauriCommand("list_all_accepted_project_memories", undefined);
  },
  appendMemoryReviewActionRows(
    actions: SqliteMemoryReviewActionRow[],
  ): Promise<SqliteMemoryReviewActionWriteResult> {
    return invokeTauriCommand("append_memory_review_action_rows", { actions });
  },
  listMemoryReviewActionRows(projectId: string): Promise<SqliteMemoryReviewActionRow[]> {
    return invokeTauriCommand("list_memory_review_action_rows", { projectId });
  },
  // Live intake index (V010). Present and tested; nothing reads it until the
  // rest of R5, so these are unreferenced by design rather than by omission.
  saveIntakeRequestRows(rows: SqliteIntakeRequestRow[]): Promise<SqliteIntakeWriteResult> {
    return invokeTauriCommand("save_intake_request_rows", { rows });
  },
  listIntakeRequestRowsForSession(sessionKey: string): Promise<SqliteIntakeRequestRow[]> {
    return invokeTauriCommand("list_intake_request_rows_for_session", { sessionKey });
  },
  listIntakeRequestRowsForProject(projectPath: string): Promise<SqliteIntakeRequestRow[]> {
    return invokeTauriCommand("list_intake_request_rows_for_project", { projectPath });
  },
  listAllIntakeRequestRows(): Promise<SqliteIntakeRequestRow[]> {
    return invokeTauriCommand("list_all_intake_request_rows", undefined);
  },
  deleteIntakeRequestRowsForSession(sessionKey: string): Promise<number> {
    return invokeTauriCommand("delete_intake_request_rows_for_session", { sessionKey });
  },
  // Durable documents (V009). Present and tested; nothing adopts them until
  // R2, so these are unreferenced by design rather than by omission.
  saveDurableDocumentRows(
    documents: SqliteDurableDocumentRow[],
  ): Promise<SqliteDurableDocumentWriteResult> {
    return invokeTauriCommand("save_durable_document_rows", { documents });
  },
  getDurableDocumentRow(
    kind: DurableDocumentKind,
    ownerId: string,
  ): Promise<SqliteDurableDocumentRow | null> {
    return invokeTauriCommand("get_durable_document_row", { kind, ownerId });
  },
  listDurableDocumentRows(kind: DurableDocumentKind): Promise<SqliteDurableDocumentRow[]> {
    return invokeTauriCommand("list_durable_document_rows", { kind });
  },
  deleteDurableDocumentRow(kind: DurableDocumentKind, ownerId: string): Promise<number> {
    return invokeTauriCommand("delete_durable_document_row", { kind, ownerId });
  },
  saveKernelRecordRows(records: SqliteKernelRecordRow[]): Promise<SqliteKernelWriteResult> {
    return invokeTauriCommand("save_kernel_record_rows", { records });
  },
  listKernelRecordRows(): Promise<SqliteKernelRecordRow[]> {
    return invokeTauriCommand("list_kernel_record_rows", undefined);
  },
  getKernelRecordRow(id: string): Promise<SqliteKernelRecordRow | null> {
    return invokeTauriCommand("get_kernel_record_row", { id });
  },
  deleteKernelRecordRow(id: string): Promise<number> {
    return invokeTauriCommand("delete_kernel_record_row", { id });
  },
  searchKernelRecordRows(query: string, limit?: number): Promise<SqliteKernelRecordRow[]> {
    return invokeTauriCommand("search_kernel_record_rows", { query, limit });
  },
  saveKernelObjectRows(objects: SqliteKernelObjectRow[]): Promise<SqliteKernelWriteResult> {
    return invokeTauriCommand("save_kernel_object_rows", { objects });
  },
  listKernelObjectRows(collection: string): Promise<SqliteKernelObjectRow[]> {
    return invokeTauriCommand("list_kernel_object_rows", { collection });
  },
  deleteKernelObjectRow(collection: string, id: string): Promise<number> {
    return invokeTauriCommand("delete_kernel_object_row", { collection, id });
  },
  appendKernelRevisionRows(revisions: SqliteKernelRevisionRow[]): Promise<SqliteKernelWriteResult> {
    return invokeTauriCommand("append_kernel_revision_rows", { revisions });
  },
  listKernelRevisionRows(recordId: string): Promise<SqliteKernelRevisionRow[]> {
    return invokeTauriCommand("list_kernel_revision_rows", { recordId });
  },
  persistSessionImports(
    imports: SqliteSessionImportRow[],
  ): Promise<SqliteSessionImportWriteResult> {
    return invokeTauriCommand("persist_session_imports", { imports });
  },
  listSessionImportRows(sessionId: string): Promise<SqliteSessionImportRow[]> {
    return invokeTauriCommand("list_session_import_rows", { sessionId });
  },
  listAllSessionImportRows(): Promise<SqliteSessionImportRow[]> {
    return invokeTauriCommand("list_all_session_import_rows", undefined);
  },
  clearAllSqliteData(): Promise<ClearAllSqliteDataResult> {
    return invokeTauriCommand("clear_all_sqlite_data", undefined);
  },
  resetSqliteDatabase(): Promise<null> {
    return invokeTauriCommand("reset_sqlite_database", undefined);
  },
  listSqliteBackups(): Promise<SqliteBackupInfo[]> {
    return invokeTauriCommand("list_sqlite_backups", undefined);
  },
  restoreSqliteBackup(backupPath: string): Promise<null> {
    return invokeTauriCommand("restore_sqlite_backup", { backupPath });
  },
};

export type DesktopLoadedSession = MockSession;

export type TauriSqliteCommands = Pick<
  typeof tauriCommands,
  | "getSqliteMigrationStatus"
  | "initializeSqliteDatabase"
  | "persistSessionSnapshot"
  | "loadSqliteSessionSnapshot"
  | "listSqliteSessions"
>;

function toTauriArgs<TCommand extends TauriCommandName>(input: TauriCommandMap[TCommand]["input"]): Record<string, unknown> | undefined {
  if (!input) return undefined;

  if (hasKey(input, "serializedPackage")) {
    const packageInput = input as SaveMoriPackageJsonInput;
    return {
      serializedPackage: packageInput.serializedPackage,
      suggestedFilename: packageInput.suggestedFilename,
    };
  }

  return input as Record<string, unknown>;
}

function hasKey<T extends string>(value: unknown, key: T): value is Record<T, unknown> {
  return value !== null && typeof value === "object" && key in value;
}
