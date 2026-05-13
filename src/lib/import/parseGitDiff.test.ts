import { describe, expect, it } from "vitest";
import { categorizeFile, inferLanguageFromPath, isLikelyGitDiff, parseGitDiff } from "./parseGitDiff";

describe("parseGitDiff", () => {
  it("parses a single modified file with additions and deletions", () => {
    const diff = [
      "diff --git a/src/lib/foo.ts b/src/lib/foo.ts",
      "index 1111111..2222222 100644",
      "--- a/src/lib/foo.ts",
      "+++ b/src/lib/foo.ts",
      "@@ -1,3 +1,4 @@",
      " keep",
      "-old",
      "+new",
      "+added",
      "",
    ].join("\n");

    const result = parseGitDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      path: "src/lib/foo.ts",
      changeType: "modified",
      additions: 2,
      deletions: 1,
      language: "typescript",
      hunks: 1,
    });
    expect(result.totals).toEqual({ files: 1, additions: 2, deletions: 1 });
  });

  it("detects new and deleted files", () => {
    const diff = [
      "diff --git a/new.md b/new.md",
      "new file mode 100644",
      "index 0000000..1111111",
      "--- /dev/null",
      "+++ b/new.md",
      "@@ -0,0 +1,2 @@",
      "+hello",
      "+world",
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "index 1111111..0000000",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-removed",
      "",
    ].join("\n");

    const result = parseGitDiff(diff);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].changeType).toBe("added");
    expect(result.files[0].additions).toBe(2);
    expect(result.files[1].changeType).toBe("deleted");
    expect(result.files[1].deletions).toBe(1);
  });

  it("handles renamed files", () => {
    const diff = [
      "diff --git a/old/name.ts b/new/name.ts",
      "similarity index 95%",
      "rename from old/name.ts",
      "rename to new/name.ts",
      "index 1111111..2222222 100644",
      "--- a/old/name.ts",
      "+++ b/new/name.ts",
      "@@ -1,3 +1,3 @@",
      "-old",
      "+new",
      "",
    ].join("\n");

    const result = parseGitDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      path: "new/name.ts",
      previousPath: "old/name.ts",
      changeType: "renamed",
      additions: 1,
      deletions: 1,
    });
  });

  it("infers language and category", () => {
    expect(inferLanguageFromPath("src/foo.tsx")).toBe("typescript");
    expect(inferLanguageFromPath("README.md")).toBe("markdown");
    expect(inferLanguageFromPath("Cargo.toml")).toBe("toml");
    expect(inferLanguageFromPath("no-extension")).toBeNull();

    expect(categorizeFile("src/lib/foo.ts")).toBe("code");
    expect(categorizeFile("src/__tests__/foo.test.ts")).toBe("test");
    expect(categorizeFile("docs/persistence.md")).toBe("docs");
    expect(categorizeFile("package.json")).toBe("config");
    expect(categorizeFile("LICENSE")).toBe("other");
  });

  it("rejects non-diff prose via isLikelyGitDiff", () => {
    expect(isLikelyGitDiff("")).toBe(false);
    expect(isLikelyGitDiff("just a note")).toBe(false);
    expect(isLikelyGitDiff("diff --git a/x b/x\nmore")).toBe(true);
    expect(isLikelyGitDiff("@@ -1,2 +1,3 @@\ncontent")).toBe(true);
  });
});
