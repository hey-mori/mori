import type { ClaudeMessage } from "../claude/types";

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
};

export type CodexSessionDetail = CodexSessionMeta & {
  messages: ClaudeMessage[];
};
