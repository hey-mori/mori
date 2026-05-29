import type { ClaudeMessage } from "../claude/types";

export type AntigravitySessionMeta = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
};

export type AntigravitySessionDetail = AntigravitySessionMeta & {
  messages: ClaudeMessage[];
};
