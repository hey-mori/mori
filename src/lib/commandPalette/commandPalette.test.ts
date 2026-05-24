import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  buildCommands,
  filterCommands,
  groupCommands,
} from "./commandPalette";

function summary(partial: Partial<StoredSessionSummary>): StoredSessionSummary {
  return {
    sessionId: partial.sessionId ?? "s-1",
    projectId: partial.projectId ?? "p-1",
    title: partial.title ?? "세션",
    projectName: partial.projectName ?? "프로젝트",
    savedAt: partial.savedAt ?? "2026-05-22T10:00:00.000Z",
    status: partial.status ?? "complete",
    startedAt: partial.startedAt,
    sourceLabel: partial.sourceLabel,
    archivedAt: partial.archivedAt,
    eventCount: partial.eventCount,
    tokenTotal: partial.tokenTotal,
    tokenInput: partial.tokenInput,
    tokenOutput: partial.tokenOutput,
  };
}

describe("buildCommands", () => {
  it("emits navigation commands grouped under 'navigate'", () => {
    const cmds = buildCommands({ sessions: [] });
    const nav = cmds.filter((c) => c.group === "navigate");
    expect(nav.map((c) => c.id)).toContain("nav-home");
    expect(nav.map((c) => c.id)).toContain("nav-memory");
  });

  it("drops the current view from the navigate list to avoid no-op rows", () => {
    const cmds = buildCommands({ sessions: [], currentView: "home" });
    expect(cmds.find((c) => c.id === "nav-home")).toBeUndefined();
  });

  it("includes sessions sorted most-recent-first and caps the list", () => {
    const sessions: StoredSessionSummary[] = Array.from({ length: 40 }).map(
      (_, index) =>
        summary({
          sessionId: `sess-${index}`,
          title: `세션 ${index}`,
          savedAt: new Date(2026, 4, 1 + index).toISOString(),
        }),
    );
    const cmds = buildCommands({ sessions });
    const sessionRows = cmds.filter((c) => c.group === "session");
    expect(sessionRows.length).toBe(25);
    expect(sessionRows[0]!.label).toBe("세션 39");
  });

  it("emits at least one action and settings command", () => {
    const cmds = buildCommands({ sessions: [] });
    expect(cmds.some((c) => c.group === "action")).toBe(true);
    expect(cmds.some((c) => c.group === "settings")).toBe(true);
  });

  it("emits theme commands and hides the currently-applied theme", () => {
    const cmds = buildCommands({ sessions: [], currentTheme: "nightLake" });
    const themeRows = cmds.filter((c) => c.group === "theme");
    expect(themeRows.length).toBeGreaterThan(0);
    expect(themeRows.some((c) => c.id === "theme-nightlake")).toBe(false);
    expect(themeRows.some((c) => c.id === "theme-formal")).toBe(true);
  });
});

describe("filterCommands", () => {
  const cmds = buildCommands({
    sessions: [
      summary({ sessionId: "s-a", title: "Auth 마이그레이션", sourceLabel: "C:/dev/mori" }),
      summary({ sessionId: "s-b", title: "결제 흐름 정리", sourceLabel: "C:/dev/jinga" }),
    ],
  });

  it("returns everything when the query is empty or whitespace", () => {
    expect(filterCommands(cmds, "").length).toBe(cmds.length);
    expect(filterCommands(cmds, "  ").length).toBe(cmds.length);
  });

  it("ranks prefix matches above substring matches", () => {
    const result = filterCommands(cmds, "메모리");
    expect(result[0]!.label).toMatch(/^메모리/);
  });

  it("matches sessions by their source label keyword", () => {
    const result = filterCommands(cmds, "jinga");
    expect(result.some((c) => c.id === "session:s-b")).toBe(true);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCommands(cmds, "xyzqqq")).toEqual([]);
  });
});

describe("groupCommands", () => {
  it("buckets commands into a stable section order and drops empty groups", () => {
    const cmds = buildCommands({
      sessions: [summary({ sessionId: "s-a", title: "Auth" })],
    });
    const sections = groupCommands(cmds);
    expect(sections.map((s) => s.group)).toEqual([
      "navigate",
      "session",
      "action",
      "theme",
      "settings",
    ]);
  });

  it("omits the session section when there are no sessions", () => {
    const cmds = buildCommands({ sessions: [] });
    const sections = groupCommands(cmds);
    expect(sections.find((s) => s.group === "session")).toBeUndefined();
  });
});
