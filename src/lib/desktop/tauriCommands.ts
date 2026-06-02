import { invoke } from "@tauri-apps/api/core";
import type {
  CreateSessionInput,
  ImportSourceInput,
  MarkdownReportInput,
  MarkdownReportOutput,
  QuickPassInput,
  QuickPassOutput,
} from "../../domain/backend-contracts";
import type { MockSession, Session, SourceRef } from "../../domain/types";
import type {
  ClearAllSqliteDataResult,
  DatabaseStatus,
  ListSessionsOutput,
  PersistSessionSnapshotOutput,
  PersistSqliteSnapshotInput,
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
  ClaudeCodeSessionDetail,
  ClaudeCodeSessionMeta,
  ClaudeConversationDetail,
  ClaudeConversationMeta,
  ClaudeDesktopDiscovery,
} from "../claude/types";
import type { LocalAiToolReport } from "../claude/installations";
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
import type { GitDiffCaptureRequest, GitDiffCaptureResult } from "./gitCommands";
import type { RepositoryVerificationResult, VerifyRepositoryRequest } from "./repositoryCommands";

export type TauriCommandName =
  | "get_app_info"
  | "get_storage_location"
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
  | "append_memory_review_action_rows"
  | "list_memory_review_action_rows"
  | "persist_session_imports"
  | "list_session_import_rows"
  | "list_all_session_import_rows"
  | "clear_all_sqlite_data"
  | "create_session"
  | "import_ai_conversation"
  | "import_git_diff"
  | "run_git_diff"
  | "pick_repository_directory"
  | "verify_repository_path"
  | "list_connector_jsonl_inbox"
  | "read_connector_jsonl_file"
  | "detect_connector_status"
  | "install_claude_hook"
  | "uninstall_claude_hook"
  | "discover_claude_desktop"
  | "list_claude_desktop_conversations"
  | "get_claude_desktop_conversation"
  | "discover_claude_code_sessions"
  | "get_claude_code_session"
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
  | "get_cursor_session"
  | "analyze_session_quick_pass"
  | "generate_report";

export type AppInfo = {
  name: string;
  version: string;
  identifier: string;
};

export type StorageLocation = {
  path: string;
  exists: boolean;
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
  get_storage_location: { input: undefined; output: StorageLocation };
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
  append_memory_review_action_rows: {
    input: { actions: SqliteMemoryReviewActionRow[] };
    output: SqliteMemoryReviewActionWriteResult;
  };
  list_memory_review_action_rows: {
    input: { projectId: string };
    output: SqliteMemoryReviewActionRow[];
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
  clear_all_sqlite_data: { input: undefined; output: ClearAllSqliteDataResult };
  create_session: { input: CreateSessionInput; output: Session };
  import_ai_conversation: { input: ImportSourceInput; output: SourceRef };
  import_git_diff: { input: ImportSourceInput; output: SourceRef };
  run_git_diff: { input: { request: GitDiffCaptureRequest }; output: GitDiffCaptureResult };
  pick_repository_directory: {
    input: { input?: { initialDirectory?: string; title?: string } };
    output: { path: string | null; cancelled: boolean };
  };
  verify_repository_path: { input: { request: VerifyRepositoryRequest }; output: RepositoryVerificationResult };
  list_connector_jsonl_inbox: { input: undefined; output: ConnectorInboxListing };
  read_connector_jsonl_file: { input: { input: { path: string } }; output: ConnectorJsonlFile };
  detect_connector_status: { input: undefined; output: ConnectorDetectionResult[] };
  install_claude_hook: {
    input: { scope: "global" | "project"; command: string; projectPath?: string };
    output: ClaudeHookInstallResult;
  };
  uninstall_claude_hook: {
    input: { scope: "global" | "project"; projectPath?: string };
    output: ClaudeHookUninstallResult;
  };
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
  analyze_session_quick_pass: { input: QuickPassInput; output: QuickPassOutput };
  generate_report: { input: MarkdownReportInput; output: MarkdownReportOutput };
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
  appendMemoryReviewActionRows(
    actions: SqliteMemoryReviewActionRow[],
  ): Promise<SqliteMemoryReviewActionWriteResult> {
    return invokeTauriCommand("append_memory_review_action_rows", { actions });
  },
  listMemoryReviewActionRows(projectId: string): Promise<SqliteMemoryReviewActionRow[]> {
    return invokeTauriCommand("list_memory_review_action_rows", { projectId });
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
  createSession(input: CreateSessionInput): Promise<Session> {
    return invokeTauriCommand("create_session", input);
  },
  importAiConversation(input: ImportSourceInput): Promise<SourceRef> {
    return invokeTauriCommand("import_ai_conversation", input);
  },
  importGitDiff(input: ImportSourceInput): Promise<SourceRef> {
    return invokeTauriCommand("import_git_diff", input);
  },
  analyzeSessionQuickPass(input: QuickPassInput): Promise<QuickPassOutput> {
    return invokeTauriCommand("analyze_session_quick_pass", input);
  },
  generateReport(input: MarkdownReportInput): Promise<MarkdownReportOutput> {
    return invokeTauriCommand("generate_report", input);
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
