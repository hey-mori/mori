import { describe, expect, it } from "vitest";

import type { FileTouch } from "../../domain/types";
import {
  commonAncestorDir,
  reconcileFileProvenance,
  rollUpFileTouches,
  summarizeFileProvenance,
  toResolutionMap,
  type FileLocationResolution,
} from "./fileProvenance";

function touch(
  path: string,
  tool: string,
  changeKind: string,
  at = "",
  additions = 0,
  deletions = 0,
): FileTouch {
  return { path, tool, changeKind, at, additions, deletions };
}

describe("rollUpFileTouches", () => {
  it("folds repeated touches into one entry per file", () => {
    const entries = rollUpFileTouches([
      touch("/repo/a.ts", "Edit", "edited", "2026-01-01T00:00:01Z"),
      touch("/repo/a.ts", "Edit", "edited", "2026-01-01T00:00:03Z"),
      touch("/repo/a.ts", "Read", "read", "2026-01-01T00:00:02Z"),
    ]);

    expect(entries).toHaveLength(1);
    const a = entries[0];
    expect(a.path).toBe("/repo/a.ts");
    expect(a.edited).toBe(2);
    expect(a.read).toBe(1);
    expect(a.totalCount).toBe(3);
    expect(a.changeCount).toBe(2);
    // First / last span across all touches regardless of arrival order.
    expect(a.firstAt).toBe("2026-01-01T00:00:01Z");
    expect(a.lastAt).toBe("2026-01-01T00:00:03Z");
  });

  it("orders changed files before read-only ones, by change count", () => {
    const entries = rollUpFileTouches([
      touch("/repo/read-only.ts", "Read", "read"),
      touch("/repo/read-only.ts", "Read", "read"),
      touch("/repo/small.ts", "Edit", "edited"),
      touch("/repo/big.ts", "Edit", "edited"),
      touch("/repo/big.ts", "Edit", "edited"),
      touch("/repo/big.ts", "Write", "wrote"),
    ]);

    expect(entries.map((e) => e.fileName)).toEqual([
      "big.ts", // 3 changes
      "small.ts", // 1 change
      "read-only.ts", // 0 changes, sinks despite 2 touches
    ]);
  });

  it("derives a headline kind: a created-then-read file reads as wrote", () => {
    const [entry] = rollUpFileTouches([
      touch("/repo/new.ts", "Write", "wrote"),
      touch("/repo/new.ts", "Read", "read"),
    ]);
    expect(entry.primaryChangeKind).toBe("wrote");
  });

  it("extracts a basename from both posix and windows paths", () => {
    const posix = rollUpFileTouches([touch("/a/b/c.ts", "Edit", "edited")]);
    const win = rollUpFileTouches([touch("C:\\dev\\mori\\d.ts", "Edit", "edited")]);
    expect(posix[0].fileName).toBe("c.ts");
    expect(win[0].fileName).toBe("d.ts");
  });

  it("ignores touches with an empty path and never mutates the input", () => {
    const input: FileTouch[] = [touch("   ", "Edit", "edited"), touch("/repo/a.ts", "Edit", "edited")];
    const snapshot = JSON.stringify(input);
    const entries = rollUpFileTouches(input);
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("sums added and removed lines across a file's changes", () => {
    const [entry] = rollUpFileTouches([
      touch("/repo/a.ts", "Edit", "edited", "", 3, 1),
      touch("/repo/a.ts", "Edit", "edited", "", 2, 4),
      touch("/repo/a.ts", "Read", "read"), // no counts
    ]);
    expect(entry.additions).toBe(5);
    expect(entry.deletions).toBe(5);
  });

  it("accumulates bounded diff previews per file, skipping empty ones", () => {
    const [entry] = rollUpFileTouches([
      { path: "/r/a.ts", tool: "Edit", changeKind: "edited", at: "", additions: 1, deletions: 1, diffPreview: "+a\n-b" },
      { path: "/r/a.ts", tool: "Read", changeKind: "read", at: "", additions: 0, deletions: 0, diffPreview: "" },
      { path: "/r/a.ts", tool: "Edit", changeKind: "edited", at: "", additions: 1, deletions: 0, diffPreview: "+c" },
    ]);
    expect(entry.diffPreview).toBe("+a\n-b\n+c");
  });

  it("counts an unmapped change kind as a generic touch", () => {
    const [entry] = rollUpFileTouches([touch("/repo/x", "Future", "renamed")]);
    expect(entry.touched).toBe(1);
    expect(entry.changeCount).toBe(0);
    expect(entry.primaryChangeKind).toBe("touched");
  });
});

describe("reconcileFileProvenance", () => {
  const entries = rollUpFileTouches([
    touch("/repo/here.ts", "Edit", "edited"),
    touch("/repo/moved.ts", "Edit", "edited"),
    touch("/repo/gone.ts", "Edit", "edited"),
    touch("/repo/unchecked.ts", "Read", "read"),
  ]);

  const resolutions: Record<string, FileLocationResolution> = {
    "/repo/here.ts": { status: "present" },
    "/repo/moved.ts": { status: "moved", currentPath: "/repo/sub/moved.ts" },
    "/repo/gone.ts": { status: "missing" },
    // /repo/unchecked.ts intentionally absent.
  };

  it("merges location and points openPath at the moved location", () => {
    const reconciled = reconcileFileProvenance(entries, resolutions);
    const byName = Object.fromEntries(reconciled.map((e) => [e.fileName, e]));

    expect(byName["here.ts"].location.status).toBe("present");
    expect(byName["here.ts"].openPath).toBe("/repo/here.ts");

    expect(byName["moved.ts"].location.status).toBe("moved");
    expect(byName["moved.ts"].openPath).toBe("/repo/sub/moved.ts");

    expect(byName["gone.ts"].location.status).toBe("missing");
    expect(byName["gone.ts"].openPath).toBe("/repo/gone.ts");
  });

  it("treats an unresolved path as unknown, never assumes present", () => {
    const reconciled = reconcileFileProvenance(entries, resolutions);
    const unchecked = reconciled.find((e) => e.fileName === "unchecked.ts");
    expect(unchecked?.location.status).toBe("unknown");
    expect(unchecked?.openPath).toBe("/repo/unchecked.ts");
  });

  it("summarizes counts across the reconciled set", () => {
    const reconciled = reconcileFileProvenance(entries, resolutions);
    const summary = summarizeFileProvenance(reconciled);
    expect(summary.fileCount).toBe(4);
    expect(summary.changedFileCount).toBe(3);
    expect(summary.readOnlyFileCount).toBe(1);
    expect(summary.missingFileCount).toBe(1);
    expect(summary.movedFileCount).toBe(1);
  });
});

describe("toResolutionMap", () => {
  it("keys resolutions by path and carries currentPath only when moved", () => {
    const map = toResolutionMap([
      { path: "/a.ts", status: "present" },
      { path: "/b.ts", status: "moved", currentPath: "/sub/b.ts" },
    ]);
    expect(map["/a.ts"]).toEqual({ status: "present" });
    expect(map["/b.ts"]).toEqual({ status: "moved", currentPath: "/sub/b.ts" });
  });
});

describe("commonAncestorDir", () => {
  it("finds the deepest shared directory of posix paths", () => {
    expect(
      commonAncestorDir(["/repo/src/a/x.ts", "/repo/src/b/y.ts", "/repo/src/a/z.ts"]),
    ).toBe("/repo/src");
  });

  it("works on windows paths and returns a windows-separated root", () => {
    expect(
      commonAncestorDir(["C:\\dev\\mori\\src\\a.ts", "C:\\dev\\mori\\docs\\b.md"]),
    ).toBe("C:\\dev\\mori");
  });

  it("returns the directory itself for a single file", () => {
    expect(commonAncestorDir(["/repo/src/only.ts"])).toBe("/repo/src");
  });

  it("returns empty when paths share no common directory", () => {
    expect(commonAncestorDir(["C:\\dev\\a.ts", "D:\\other\\b.ts"])).toBe("");
    expect(commonAncestorDir([])).toBe("");
  });
});
