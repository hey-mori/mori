import { describe, expect, it } from "vitest";
import { buildSourceActivity } from "./sourceActivity";

const meta = (id: string, path: string, lastMessageAt?: string) => ({
  id,
  agentId: "claude" as const,
  sourceFilePath: path,
  lastMessageAt,
});

describe("when a session's conversation last moved", () => {
  const activity = buildSourceActivity({
    metas: [meta("a", "/a.jsonl", "2026-10-09T07:00:00Z"), meta("b", "/b.jsonl", "2026-10-09T07:10:00Z"), meta("c", "/c.jsonl")],
    followedKeys: new Set(["/b.jsonl"]),
    titleOfMeta: (m) => `title ${m.id}`,
  });

  it("reads the last message time by source file", () => {
    expect(activity.activeAt("/a.jsonl")).toBe("2026-10-09T07:00:00Z");
  });

  it("gives no time for a session Mori is following", () => {
    expect(activity.activeAt("/b.jsonl")).toBeUndefined();
    expect(activity.titleOf("/b.jsonl")).toBe("title b");
  });

  it("gives no time when discovery never read a last message", () => {
    expect(activity.activeAt("/c.jsonl")).toBeUndefined();
    expect(activity.activeAt("/unknown.jsonl")).toBeUndefined();
  });
});
