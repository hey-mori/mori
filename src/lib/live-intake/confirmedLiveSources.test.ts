import { describe, expect, it } from "vitest";
import type { ProjectSearchEntry } from "../session/projectSearch";
import { liveSourcesOf } from "./confirmedLiveSources";

const entry = (sessionId: string, sourcePath: string | null, title = sessionId): ProjectSearchEntry => ({
  sessionId,
  contextId: "ctx-infra",
  title,
  agentName: "Claude Code",
  lastActiveAt: "2026-10-09T00:00:00Z",
  sourcePath,
  kind: sourcePath ? "searchable" : "no-source",
});

describe("observed sessions of a reviewed project", () => {
  it("reads each confirmed source once, whatever folder it lives in", () => {
    const scope = liveSourcesOf([
      entry("main", "/c/-home-u-dev-infra/a.jsonl"),
      entry("worktree", "/c/-home-u-dev-infra--claude-worktrees-storage/b.jsonl"),
      entry("odd", "/c/-home-u-dev/c.jsonl"),
    ]);
    expect(scope.keys).toHaveLength(3);
    expect(scope.sessionByKey.get("/c/-home-u-dev-infra--claude-worktrees-storage/b.jsonl")).toBe("worktree");
  });

  it("does not open a file named by two sessions, and leaves out a session with no source", () => {
    const scope = liveSourcesOf([entry("one", "/c/same.jsonl"), entry("two", "/c/same.jsonl"), entry("none", null)]);
    expect(scope.keys).toEqual(["/c/same.jsonl"]);
    expect(scope.sessionByKey.get("/c/same.jsonl")).toBeNull();
  });

  it("keeps same-titled sessions with different sources apart", () => {
    const scope = liveSourcesOf([entry("stub", "/c/stub.jsonl", "Observability"), entry("long", "/c/long.jsonl", "Observability")]);
    expect(scope.sessionByKey.get("/c/stub.jsonl")).toBe("stub");
    expect(scope.sessionByKey.get("/c/long.jsonl")).toBe("long");
  });
});
