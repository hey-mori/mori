import { invoke } from "@tauri-apps/api/core";
import type {
  CreateSessionInput,
  ImportSourceInput,
  MarkdownReportInput,
  MarkdownReportOutput,
  QuickPassInput,
  QuickPassOutput,
} from "../../domain/backend-contracts";
import type { MoriMockSession, Session, SourceRef } from "../../domain/types";
import { createDesktopUnavailableError, isTauriRuntime } from "./environment";

export type TauriCommandName =
  | "get_app_info"
  | "get_storage_location"
  | "save_mori_package_json"
  | "open_mori_package_json"
  | "list_recent_mori_packages"
  | "create_session"
  | "import_ai_conversation"
  | "import_git_diff"
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

export type RecentMoriPackage = {
  path: string;
  filename: string;
  size_bytes: number;
};

export type SaveMoriPackageJsonInput = {
  serializedPackage: string;
  suggestedFilename?: string;
};

export type TauriCommandMap = {
  get_app_info: { input: undefined; output: AppInfo };
  get_storage_location: { input: undefined; output: StorageLocation };
  save_mori_package_json: { input: SaveMoriPackageJsonInput; output: SavedMoriPackage };
  open_mori_package_json: { input: { path: string }; output: string };
  list_recent_mori_packages: { input: undefined; output: RecentMoriPackage[] };
  create_session: { input: CreateSessionInput; output: Session };
  import_ai_conversation: { input: ImportSourceInput; output: SourceRef };
  import_git_diff: { input: ImportSourceInput; output: SourceRef };
  analyze_session_quick_pass: { input: QuickPassInput; output: QuickPassOutput };
  generate_report: { input: MarkdownReportInput; output: MarkdownReportOutput };
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
  openMoriPackageJson(path: string): Promise<string> {
    return invokeTauriCommand("open_mori_package_json", { path });
  },
  listRecentMoriPackages(): Promise<RecentMoriPackage[]> {
    return invokeTauriCommand("list_recent_mori_packages", undefined);
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

export type DesktopLoadedSession = MoriMockSession;

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
