import { describe, expect, it } from "vitest";
import { runGitDiff } from "./gitCommands";
import { isTauriRuntime } from "./environment";
import { normalizeGitDiff } from "../import";

describe("runGitDiff browser fallback", () => {
  it("rejects with the desktop-required error when not in Tauri", async () => {
    expect(isTauriRuntime()).toBe(false);
    await expect(runGitDiff({ repoPath: "C:/some/path" })).rejects.toThrow("requires the Tauri app");
  });

  it("rejects an empty repo path before reaching the bridge", async () => {
    await expect(runGitDiff({ repoPath: "" })).rejects.toThrow("Repository path is required.");
    await expect(runGitDiff({ repoPath: "   " })).rejects.toThrow("Repository path is required.");
  });
});

describe("fetched git diff flows into the existing normalizer", () => {
  it("feeds the captured diff text through normalizeGitDiff", () => {
    const captured = {
      diffText: [
        "diff --git a/src/lib/foo.ts b/src/lib/foo.ts",
        "index 1111111..2222222 100644",
        "--- a/src/lib/foo.ts",
        "+++ b/src/lib/foo.ts",
        "@@ -1,2 +1,3 @@",
        " keep",
        "-old",
        "+new",
        "+added",
        "",
      ].join("\n"),
      repoPath: "/tmp/mori-fixture",
      range: "HEAD~1..HEAD",
    };

    const candidate = normalizeGitDiff({
      projectId: "proj-1",
      sessionId: "sess-1",
      diffText: captured.diffText,
      origin: `${captured.repoPath} ${captured.range}`,
      capturedAt: "2026-05-12T13:00:00+09:00",
    });

    expect(candidate.source.kind).toBe("gitDiff");
    expect(candidate.source.trustLevel).toBe("verified");
    expect(candidate.source.uri).toContain("HEAD~1..HEAD");
    expect(candidate.events).toHaveLength(1);
    expect(candidate.events[0]?.type).toBe("fileCode");
    expect(candidate.events[0]?.summary).toContain("src/lib/foo.ts");
  });
});
