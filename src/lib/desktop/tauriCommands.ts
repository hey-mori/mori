import type {
  CreateSessionInput,
  ImportSourceInput,
  MarkdownReportInput,
  MarkdownReportOutput,
  OpenMoriPackageOutput,
  QuickPassInput,
  QuickPassOutput,
  SaveMoriPackageInput,
} from "../../domain/backend-contracts";
import type { MoriMockSession, Session, SourceRef } from "../../domain/types";

export type TauriCommandName =
  | "create_session"
  | "save_mori_package"
  | "open_mori_package"
  | "list_recent_sessions"
  | "import_ai_conversation"
  | "import_git_diff"
  | "analyze_session_quick_pass"
  | "generate_report";

export type RecentSessionRecord = {
  sessionId: string;
  projectId: string;
  title: string;
  startedAt: string;
  status: Session["status"];
};

export type TauriCommandMap = {
  create_session: { input: CreateSessionInput; output: Session };
  save_mori_package: { input: SaveMoriPackageInput; output: { packagePath: string } };
  open_mori_package: { input: { packagePath: string }; output: OpenMoriPackageOutput };
  list_recent_sessions: { input: undefined; output: RecentSessionRecord[] };
  import_ai_conversation: { input: ImportSourceInput; output: SourceRef };
  import_git_diff: { input: ImportSourceInput; output: SourceRef };
  analyze_session_quick_pass: { input: QuickPassInput; output: QuickPassOutput };
  generate_report: { input: MarkdownReportInput; output: MarkdownReportOutput };
};

export async function invokeTauriCommand<TCommand extends TauriCommandName>(
  command: TCommand,
  _input: TauriCommandMap[TCommand]["input"],
): Promise<TauriCommandMap[TCommand]["output"]> {
  throw new Error(
    `Tauri command "${command}" is not implemented in the web prototype. Add src-tauri and bind this command before using desktop persistence.`,
  );
}

export const tauriCommands = {
  createSession(input: CreateSessionInput): Promise<Session> {
    return invokeTauriCommand("create_session", input);
  },
  saveMoriPackage(input: SaveMoriPackageInput): Promise<{ packagePath: string }> {
    return invokeTauriCommand("save_mori_package", input);
  },
  openMoriPackage(input: { packagePath: string }): Promise<OpenMoriPackageOutput> {
    return invokeTauriCommand("open_mori_package", input);
  },
  listRecentSessions(): Promise<RecentSessionRecord[]> {
    return invokeTauriCommand("list_recent_sessions", undefined);
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
