import { describe, expect, it } from "vitest";
import { GitDiffParseError, normalizeGitDiff } from "./normalizeGitDiff";

const base = {
  projectId: "proj-1",
  sessionId: "sess-1",
  capturedAt: "2026-05-12T13:00:00+09:00",
};

const sampleDiff = [
  "diff --git a/src/lib/foo.ts b/src/lib/foo.ts",
  "index 1111111..2222222 100644",
  "--- a/src/lib/foo.ts",
  "+++ b/src/lib/foo.ts",
  "@@ -1,3 +1,4 @@",
  " keep",
  "-old",
  "+new",
  "+added",
  "diff --git a/docs/persistence.md b/docs/persistence.md",
  "index 3333333..4444444 100644",
  "--- a/docs/persistence.md",
  "+++ b/docs/persistence.md",
  "@@ -1,1 +1,2 @@",
  " heading",
  "+TODO: clarify desktop fallback",
  "",
].join("\n");

describe("normalizeGitDiff", () => {
  it("produces a verified source and a fileCode timeline event", () => {
    const result = normalizeGitDiff({ ...base, diffText: sampleDiff });

    expect(result.source.kind).toBe("gitDiff");
    expect(result.source.trustLevel).toBe("verified");
    expect(result.source.detail).toContain("2 file");
    expect(result.source.detail).toContain("+3");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("fileCode");
    expect(result.events[0]?.trustLevel).toBe("verified");
    expect(result.events[0]?.summary).toContain("Git diff covering 2 file");
    expect(result.events[0]?.summary).toContain("src/lib/foo.ts");
  });

  it("uses an origin label when provided", () => {
    const result = normalizeGitDiff({
      ...base,
      diffText: sampleDiff,
      origin: "HEAD~1..HEAD",
    });
    expect(result.source.uri).toBe("HEAD~1..HEAD");
    expect(result.source.detail).toContain("HEAD~1..HEAD");
  });

  it("rejects pasted prose that is not a unified diff", () => {
    expect(() => normalizeGitDiff({ ...base, diffText: "just plain text" })).toThrow(GitDiffParseError);
  });

  it("rejects an empty diff body", () => {
    expect(() => normalizeGitDiff({ ...base, diffText: "" })).toThrow(GitDiffParseError);
  });
});
