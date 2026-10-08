import type { ClaudeMessage } from "../claude/types";
import type { RepositoryObservation, SessionEvidence } from "../trace/sources/ai/sessionEvidence";

export type CodexSessionMeta = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
  originator: string;
  /** `session_meta.source` (`exec`, `cli`, `vscode`, ...), "" when absent. */
  source?: string;
  activityClass?: string;
  /** Branch and remote from `session_meta.git`; null for an unreadable file. */
  evidence?: SessionEvidence | null;
  repository?: RepositoryObservation | null;
};

export type CodexSessionDetail = CodexSessionMeta & {
  messages: ClaudeMessage[];
};
