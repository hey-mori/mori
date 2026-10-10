import { describe, expect, it } from "vitest";
import { groupDaySessions, NO_PROJECT_LABEL } from "./calendarDaySessions";

const session = (id: string, at: string, contextIds: string[] = []) => ({ id, title: id, occurredStart: at, capturedAt: at, contextIds }) as never;
const ctx = (id: string, name: string, archived = false) => ({ id, name, type: "project", archived, createdAt: "" }) as never;

describe("a calendar day's sessions", () => {
  it("groups by reviewed project, busiest first, no-project last, sessions in time order", () => {
    const groups = groupDaySessions(
      [session("a", "2026-10-08T10:00:00Z", ["c1"]), session("b", "2026-10-08T09:00:00Z", ["c1"]), session("c", "2026-10-08T08:00:00Z", ["c2"]), session("d", "2026-10-08T07:00:00Z")],
      [ctx("c1", "infra"), ctx("c2", "mori")],
    );
    expect(groups.map((group) => [group.label, group.sessions.map((s) => s.id)])).toEqual([
      ["infra", ["b", "a"]],
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

  it("never files a session under an archived or unknown project", () => {
    const groups = groupDaySessions([session("a", "2026-10-08T10:00:00Z", ["gone"]), session("b", "2026-10-08T10:00:00Z", ["old"])], [ctx("old", "old", true)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe(NO_PROJECT_LABEL);
  });
});
