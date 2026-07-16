import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  buildCommands,
  capBrowseCommands,
  filterCommands,
  groupCommands,
  type CommandEntry,
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
    expect(nav.map((c) => c.id)).toContain("nav-connections");
    // The legacy 메모리 surfaces are retired from the palette (durable memory
    // is the 기록 record ledger now).
    expect(nav.map((c) => c.id)).not.toContain("nav-memory");
    expect(nav.map((c) => c.id)).not.toContain("nav-consolidation");
  });

  it("drops the current view from the navigate list to avoid no-op rows", () => {
    const cmds = buildCommands({ sessions: [], currentView: "home" });
    expect(cmds.find((c) => c.id === "nav-home")).toBeUndefined();
  });

  it("includes every session sorted most-recent-first so search reaches all of them", () => {
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
    expect(sessionRows.length).toBe(40);
    expect(sessionRows[0]!.label).toBe("세션 39");
    // The oldest session is present, so a query can reach it even though it is
    // far past the old 25-row browse cap.
    expect(sessionRows.some((row) => row.label === "세션 0")).toBe(true);
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
    const local = buildCommands({
      sessions: [
        summary({ sessionId: "p1", title: "결제 오류 수정", sourceLabel: "x" }),
        summary({ sessionId: "p2", title: "빠른 결제 흐름", sourceLabel: "x" }),
      ],
    });
    const result = filterCommands(local, "결제");
    expect(result[0]!.label).toMatch(/^결제/);
  });

  it("matches sessions by their source label keyword", () => {
    const result = filterCommands(cmds, "jinga");
    expect(result.some((c) => c.id === "session:s-b")).toBe(true);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCommands(cmds, "xyzqqq")).toEqual([]);
  });

  it("finds a session far past the old browse cap", () => {
    const sessions: StoredSessionSummary[] = Array.from({ length: 40 }).map(
      (_, index) =>
        summary({
          sessionId: `sess-${index}`,
          title: index === 39 ? "가장 오래된 인증 리팩터링" : `세션 ${index}`,
          // index 39 is the OLDEST, so it sorts last, well beyond a 25-row cap.
          savedAt: new Date(2026, 4, 40 - index).toISOString(),
        }),
    );
    const cmds = buildCommands({ sessions });
    const result = filterCommands(cmds, "인증 리팩터링");
    expect(result.some((c) => c.id === "session:sess-39")).toBe(true);
  });
});

describe("capBrowseCommands", () => {
  function sessionsOf(count: number): StoredSessionSummary[] {
    return Array.from({ length: count }).map((_, index) =>
      summary({
        sessionId: `sess-${index}`,
        title: `세션 ${index}`,
        savedAt: new Date(2026, 4, 1 + index).toISOString(),
      }),
    );
  }

  it("caps the session group for the browse view but keeps other groups whole", () => {
    const cmds = buildCommands({ sessions: sessionsOf(30) });
    const browsed = capBrowseCommands(cmds);
    expect(browsed.filter((c) => c.group === "session").length).toBe(8);
    // Non-session groups are untouched.
    expect(browsed.filter((c) => c.group === "navigate").length).toBe(
      cmds.filter((c) => c.group === "navigate").length,
    );
    // The freshest sessions are the ones kept.
    expect(browsed.find((c) => c.group === "session")!.label).toBe("세션 29");
  });

  it("honours a custom session limit", () => {
    const cmds = buildCommands({ sessions: sessionsOf(30) });
    expect(capBrowseCommands(cmds, { sessionLimit: 3 }).filter((c) => c.group === "session").length).toBe(3);
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

  it("places record entries in a 기록 section between 이동 and 세션 (S1)", () => {
    const record: CommandEntry = {
      id: "record:r-1",
      group: "record",
      label: "운동 기록",
      target: { kind: "openRecord", recordId: "r-1" },
    };
    const cmds = buildCommands({
      sessions: [summary({ sessionId: "s-a", title: "Auth" })],
    });
    const sections = groupCommands([...cmds, record]);
    expect(sections.map((s) => s.group)).toEqual([
      "navigate",
      "record",
      "session",
      "action",
      "theme",
      "settings",
    ]);
    const recordSection = sections.find((s) => s.group === "record");
    expect(recordSection?.entries).toHaveLength(1);
    expect(recordSection?.entries[0]?.target).toEqual({
      kind: "openRecord",
      recordId: "r-1",
    });
  });
});
