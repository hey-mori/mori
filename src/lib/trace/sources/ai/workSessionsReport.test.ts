import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeCodeSessionMeta } from "../../../claude/types";

const claude = vi.hoisted(() => ({
  code: vi.fn<() => Promise<ClaudeCodeSessionMeta[]>>(),
  desktop: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("../../../claude/claudeTauri", () => ({
  discoverClaudeCodeSessions: claude.code,
  listClaudeDesktopConversations: claude.desktop,
  getClaudeCodeSession: vi.fn(),
  getClaudeDesktopConversation: vi.fn(),
}));
const empty = async () => [];
vi.mock("../../../codex/codexTauri", () => ({ discoverCodexSessions: empty, getCodexSession: vi.fn() }));
vi.mock("../../../antigravity/antigravityTauri", () => ({ discoverAntigravitySessions: empty, getAntigravitySession: vi.fn() }));
vi.mock("../../../opencode/opencodeTauri", () => ({ discoverOpenCodeSessions: empty, getOpenCodeSession: vi.fn() }));
vi.mock("../../../continueAgent/continueTauri", () => ({ discoverContinueSessions: empty, getContinueSession: vi.fn() }));
vi.mock("../../../cline/clineTauri", () => ({ discoverClineSessions: empty, getClineSession: vi.fn() }));
vi.mock("../../../cursor/cursorTauri", () => ({ discoverCursorSessions: empty, getCursorSession: vi.fn() }));
vi.mock("../../../desktop/connectorInbox", () => ({
  listConnectorJsonlInbox: async () => ({ rootExists: false, files: [] }),
  readConnectorJsonlFile: vi.fn(),
}));

import { listAllAgentWorkSessionsReport } from "./workSessions";

const meta = (id: string): ClaudeCodeSessionMeta => ({
  sessionId: id,
  projectPath: "/work/app",
  projectName: "app",
  filePath: `/root/${id}.jsonl`,
  startedAt: "2026-01-01T00:00:00Z",
  modifiedAt: "2026-01-01T00:00:00Z",
  messageCount: 0,
  title: id,
});

describe("which agents can vouch that a session is gone", () => {
  beforeEach(() => {
    claude.code.mockReset();
    claude.desktop.mockReset();
  });

  it("an agent whose listings all succeeded and found sessions vouches", async () => {
    claude.code.mockResolvedValue([meta("a")]);
    claude.desktop.mockResolvedValue([]);
    const report = await listAllAgentWorkSessionsReport();
    expect(report.sessions.map((session) => session.sessionId)).toEqual(["a"]);
    expect([...report.vouchingAgents]).toEqual(["claude"]);
  });

  it("one failed listing of an agent stops it vouching, even when another found sessions", async () => {
    claude.code.mockRejectedValue(new Error("projects folder unreadable"));
    claude.desktop.mockResolvedValue([]);
    const failedCode = await listAllAgentWorkSessionsReport();
    expect(failedCode.vouchingAgents.has("claude")).toBe(false);

    claude.code.mockResolvedValue([meta("a")]);
    claude.desktop.mockRejectedValue(new Error("desktop store locked"));
    const failedDesktop = await listAllAgentWorkSessionsReport();
    expect(failedDesktop.sessions).toHaveLength(1);
    expect(failedDesktop.vouchingAgents.has("claude")).toBe(false);
  });

  it("an agent whose listing found nothing does not vouch", async () => {
    claude.code.mockResolvedValue([]);
    claude.desktop.mockResolvedValue([]);
    expect((await listAllAgentWorkSessionsReport()).vouchingAgents.size).toBe(0);
  });
});
