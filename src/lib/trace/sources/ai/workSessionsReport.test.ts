import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeCodeSessionMeta } from "../../../claude/types";

const claude = vi.hoisted(() => ({
  code: vi.fn<() => Promise<ClaudeCodeSessionMeta[]>>(),
  desktop: vi.fn<() => Promise<unknown[]>>(),
  codex: vi.fn<() => Promise<unknown[]>>(),
  inbox: vi.fn<() => Promise<{ rootExists: boolean; files: unknown[] }>>(),
}));

vi.mock("../../../claude/claudeTauri", () => ({
  discoverClaudeCodeSessions: claude.code,
  listClaudeDesktopConversations: claude.desktop,
  getClaudeCodeSession: vi.fn(),
  getClaudeDesktopConversation: vi.fn(),
}));
vi.mock("../../../codex/codexTauri", () => ({ discoverCodexSessions: claude.codex, getCodexSession: vi.fn() }));
vi.mock("../../../antigravity/antigravityTauri", () => ({ discoverAntigravitySessions: async () => [], getAntigravitySession: vi.fn() }));
vi.mock("../../../opencode/opencodeTauri", () => ({ discoverOpenCodeSessions: async () => [], getOpenCodeSession: vi.fn() }));
vi.mock("../../../continueAgent/continueTauri", () => ({ discoverContinueSessions: async () => [], getContinueSession: vi.fn() }));
vi.mock("../../../cline/clineTauri", () => ({ discoverClineSessions: async () => [], getClineSession: vi.fn() }));
vi.mock("../../../cursor/cursorTauri", () => ({ discoverCursorSessions: async () => [], getCursorSession: vi.fn() }));
vi.mock("../../../desktop/connectorInbox", () => ({
  listConnectorJsonlInbox: claude.inbox,
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
    claude.codex.mockReset().mockResolvedValue([]);
    claude.inbox.mockReset().mockResolvedValue({ rootExists: false, files: [] });
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

  it("Claude Desktop not installed is an answer, not a failed listing", async () => {
    claude.code.mockResolvedValue([meta("a")]);
    claude.desktop.mockRejectedValue("No Claude Desktop SQLite database was found. Probed: /home/u/.config/Claude");
    expect((await listAllAgentWorkSessionsReport()).vouchingAgents.has("claude")).toBe(true);
    claude.desktop.mockRejectedValue("No recognised Claude Desktop conversation table was found in the SQLite database.");
    expect((await listAllAgentWorkSessionsReport()).vouchingAgents.has("claude")).toBe(true);
    claude.desktop.mockRejectedValue("database is locked");
    expect((await listAllAgentWorkSessionsReport()).vouchingAgents.has("claude")).toBe(false);
  });

  it("an unreadable Codex rollout placeholder stops Codex vouching", async () => {
    claude.code.mockResolvedValue([]);
    claude.desktop.mockResolvedValue([]);
    const codex = (id: string, title: string) => ({
      sessionId: id, projectPath: "/w", projectName: "w", filePath: `/c/${id}.jsonl`,
      startedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", messageCount: 1, title,
      originator: "codex", source: "cli", activityClass: "unknown",
    });
    claude.codex.mockResolvedValue([codex("s1", "고치기")]);
    expect((await listAllAgentWorkSessionsReport()).vouchingAgents.has("codex")).toBe(true);
    claude.codex.mockResolvedValue([codex("s1", "고치기"), codex("rollout-x", "⚠ 읽을 수 없는 세션 · 8 MB 초과")]);
    expect((await listAllAgentWorkSessionsReport()).vouchingAgents.has("codex")).toBe(false);
  });

  it("a failed connector inbox fails the whole pass, so nothing is pruned on it", async () => {
    claude.code.mockResolvedValue([meta("a")]);
    claude.desktop.mockResolvedValue([]);
    claude.inbox.mockRejectedValue(new Error("inbox unreadable"));
    await expect(listAllAgentWorkSessionsReport()).rejects.toThrow("inbox unreadable");
  });
});
