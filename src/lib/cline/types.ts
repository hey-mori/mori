import type { ClaudeMessage } from "../claude/types";

export type ClineSessionMeta = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
};

export type ClineSessionDetail = ClineSessionMeta & {
  messages: ClaudeMessage[];
};
