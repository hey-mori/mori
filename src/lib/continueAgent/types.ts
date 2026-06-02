import type { ClaudeMessage } from "../claude/types";

export type ContinueSessionMeta = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
};

export type ContinueSessionDetail = ContinueSessionMeta & {
  messages: ClaudeMessage[];
};
