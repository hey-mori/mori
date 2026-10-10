import { describe, expect, it } from "vitest";
import { calendarDayLabel, groupDaySessions, INVALID_PROJECT_LABEL, NO_PROJECT_LABEL } from "./calendarDaySessions";

const session = (id: string, at: string, contextIds: string[] = []) => ({ id, title: id, occurredStart: at, capturedAt: at, contextIds }) as never;
const ctx = (id: string, name: string, archived = false, extra: object = {}) => ({ id, name, type: "project", archived, createdAt: "", ...extra }) as never;

describe("a calendar day's sessions", () => {
  it("groups by reviewed project, busiest first, no-project last, sessions in time order", () => {
    const groups = groupDaySessions(
      [session("a", "2026-10-08T10:00:00Z", ["c1"]), session("b", "2026-10-08T09:00:00Z", ["c1"]), session("c", "2026-10-08T08:00:00Z", ["c2"]), session("d", "2026-10-08T07:00:00Z")],
      [ctx("c1", "infra"), ctx("c2", "mori")],
    );
    expect(groups.map((group) => [group.label, group.sessions.map((s) => s.id)])).toEqual([
      ["infra", ["a", "b"]],
      ["mori", ["c"]],
      [NO_PROJECT_LABEL, ["d"]],
    ]);
  });

  it("groups an unfiled session by its folder, labelled as a folder, after reviewed projects", () => {
    const groups = groupDaySessions(
      [session("a", "2026-10-08T10:00:00Z", ["c1"]), session("b", "2026-10-08T09:00:00Z"), session("c", "2026-10-08T08:00:00Z"), session("d", "2026-10-08T07:00:00Z")],
      [ctx("c1", "infra")],
      (id) => (id === "b" || id === "c" ? "mori" : null),
    );
    expect(groups.map((group) => [group.kind, group.label, group.sessions.length])).toEqual([
      ["project", "infra", 1],
      ["folder", "mori", 2],
      ["none", NO_PROJECT_LABEL, 1],
    ]);
  });

  it("exposes a session whose reviewed project is missing or archived, never re-filing it", () => {
    const groups = groupDaySessions(
      [session("a", "2026-10-08T10:00:00Z", ["ctx-gone"]), session("b", "2026-10-08T10:00:00Z", ["child"])],
      [ctx("old", "old", true), ctx("child", "child", false, { parentId: "old" })],
      () => "some-folder",
    );
    expect(groups.map((group) => [group.kind, group.label, group.sessions.length])).toEqual([["invalid", INVALID_PROJECT_LABEL, 2]]);
  });

  it("never treats a non-project context as a project", () => {
    const groups = groupDaySessions([session("a", "2026-10-08T10:00:00Z", ["t"])], [ctx("t", "topic", false, { type: "topic" })]);
    expect(groups[0]!.label).toBe(NO_PROJECT_LABEL);
  });
});

describe("the way-back label of a calendar day", () => {
  const now = new Date(2026, 9, 10);
  it("names the day from its key", () => {
    expect(calendarDayLabel("2026-10-10", now)).toBe("캘린더 10월 10일");
    expect(calendarDayLabel("2026-01-05", now)).toBe("캘린더 1월 5일");
  });
  it("names the year of a day in another year", () => {
    expect(calendarDayLabel("2025-10-10", now)).toBe("캘린더 2025년 10월 10일");
  });
  it("falls back to the calendar for a malformed key", () => {
    expect(calendarDayLabel("oops", now)).toBe("캘린더");
  });
});
