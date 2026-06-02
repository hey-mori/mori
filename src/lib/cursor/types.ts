import type { ClaudeMessage } from "../claude/types";

export type CursorSessionMeta = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  filePath: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
};

export type CursorSessionDetail = CursorSessionMeta & {
  messages: ClaudeMessage[];
};
