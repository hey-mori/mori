import type { ClaudeMessage } from "../claude/types";

export type OpenCodeSessionMeta = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
};

export type OpenCodeSessionDetail = OpenCodeSessionMeta & {
  messages: ClaudeMessage[];
};
