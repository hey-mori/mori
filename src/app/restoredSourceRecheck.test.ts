import { afterEach, describe, expect, it, vi } from "vitest";

const presence = vi.fn<(paths: string[]) => Promise<string[]>>();
vi.mock("../lib/claude/claudeTauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  claudeCodeSourcePresence: (paths: string[]) => presence(paths),
}));
vi.mock("../lib/session/autoImportMetaStore", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAutoImportMeta: (sessionId: string) =>
    sessionId.startsWith("auto-desktop")
      ? { importKind: "claude-desktop", sourceFilePath: "" }
      : { importKind: "claude-code", sourceFilePath: `/c/${sessionId}.jsonl` },
}));

import { useSessionStore, type SessionState } from "./sessionStore";

function restored(sessionId: string, sessionWindow: SessionState["sessionWindow"] = null) {
  const reopen = vi.fn(async () => "opened" as const);
  useSessionStore.setState({
    draft: { session: { id: sessionId } } as SessionState["draft"],
    sessionWindow,
    openDiscoveredSession: reopen,
  });
  return reopen;
}

afterEach(() => presence.mockReset());

describe("a session restored at startup", () => {
  it("opens the usual way when its transcript is gone, so the kept copy says so", async () => {
    const reopen = restored("auto-claude-gone");
    presence.mockResolvedValue(["missing"]);
    expect(await useSessionStore.getState().recheckRestoredSource("auto-claude-gone")).toBe(true);
    expect(presence).toHaveBeenCalledWith(["/c/auto-claude-gone.jsonl"]);
    expect(reopen).toHaveBeenCalledWith("auto-claude-gone");
  });

  it("checks once per run", async () => {
    const reopen = restored("auto-claude-once");
    presence.mockResolvedValue(["missing"]);
    await useSessionStore.getState().recheckRestoredSource("auto-claude-once");
    await useSessionStore.getState().recheckRestoredSource("auto-claude-once");
    expect(presence).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it("leaves the screen alone when the transcript is there or the check failed", async () => {
    for (const [id, answer] of [["auto-claude-here", "present"], ["auto-claude-unsure", "unknown"]] as const) {
      const reopen = restored(id);
      presence.mockResolvedValue([answer]);
      expect(await useSessionStore.getState().recheckRestoredSource(id)).toBe(false);
      expect(reopen).not.toHaveBeenCalled();
    }
  });

  it("does nothing for a session already read this run or not from Claude Code", async () => {
    const read = restored("auto-claude-read", { sessionId: "auto-claude-read", status: "loading" } as SessionState["sessionWindow"]);
    expect(await useSessionStore.getState().recheckRestoredSource("auto-claude-read")).toBe(false);
    expect(read).not.toHaveBeenCalled();
    const desktop = restored("auto-desktop-1");
    expect(await useSessionStore.getState().recheckRestoredSource("auto-desktop-1")).toBe(false);
    expect(desktop).not.toHaveBeenCalled();
    expect(presence).not.toHaveBeenCalled();
  });
});
