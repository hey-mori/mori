import { describe, expect, it } from "vitest";
import { buildSourceActivity, reportedSessionKeys } from "./sourceActivity";

const meta = (id: string, path: string, lastMessageAt?: string) => ({
  id,
  agentId: "claude" as const,
  sourceFilePath: path,
  lastMessageAt,
});

describe("when a session's conversation last moved", () => {
  const activity = buildSourceActivity({
    metas: [meta("a", "/a.jsonl", "2026-10-09T07:00:00Z"), meta("b", "/b.jsonl", "2026-10-09T07:10:00Z"), meta("c", "/c.jsonl")],
    reportedKeys: reportedSessionKeys([{ sessionKey: "/b.jsonl" }]),
    titleOfMeta: (m) => `title ${m.id}`,
  });

  it("reads the last message time by source file", () => {
    expect(activity.activeAt("/a.jsonl")).toBe("2026-10-09T07:00:00Z");
  });

  it("gives no time for a session the live feed is reporting on", () => {
    expect(activity.activeAt("/b.jsonl")).toBeUndefined();
    expect(activity.titleOf("/b.jsonl")).toBe("title b");
  });

  it("gives no time when discovery never read a last message", () => {
    expect(activity.activeAt("/c.jsonl")).toBeUndefined();
    expect(activity.activeAt("/unknown.jsonl")).toBeUndefined();
  });
});

describe("which sessions count as reported", () => {
  it("takes only sessions the feed holds a request for, not every followed one", () => {
    // A followed session whose last prompt lies before the follower's tail
    // yields no request, so it is absent here and stays open to being set aside.
    const keys = reportedSessionKeys([{ sessionKey: "/a.jsonl" }, { sessionKey: "/a.jsonl" }, { sessionKey: "/c.jsonl" }]);
    expect([...keys].sort()).toEqual(["/a.jsonl", "/c.jsonl"]);
    const activity = buildSourceActivity({
      metas: [{ id: "x", agentId: "claude", sourceFilePath: "/long.jsonl", lastMessageAt: "2026-10-09T07:00:00Z" }],
      reportedKeys: keys,
      titleOfMeta: () => undefined,
    });
    expect(activity.activeAt("/long.jsonl")).toBe("2026-10-09T07:00:00Z");
  });
});
