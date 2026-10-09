import { describe, expect, it } from "vitest";
import {
  archiveSourceFor,
  formatArchiveBytes,
  formatArchiveLocator,
  keptArchiveOf,
  parseArchiveLocator,
  removedArchiveSource,
} from "./sessionArchive";

const sha = "a".repeat(64);
const archive = { fileName: `${sha}.jsonl`, path: `/m/archives/claude-code/${sha}.jsonl`, bytes: 1234, sha256: sha, sourceId: "fp", reused: false };

describe("the record that Mori keeps a session's copy", () => {
  it("names the copy by file name, never by absolute path", () => {
    const source = archiveSourceFor("auto-claude-s", archive, () => new Date("2026-10-09T10:00:00Z"));
    expect(source).toMatchObject({ kind: "agent-session", retention: "retained", contentHash: sha, capturedAt: "2026-10-09T10:00:00.000Z" });
    expect(source.rawBody).toBeUndefined();
    expect(source.locator).not.toContain("/m/archives");
    expect(parseArchiveLocator(source.locator)).toEqual({ v: 1, kind: "claude-code-archive", sessionId: "auto-claude-s", fileName: `${sha}.jsonl`, bytes: 1234, sha256: sha, sourceId: "fp" });
  });

  it("rejects malformed or mismatched locators", () => {
    const good = { v: 1 as const, kind: "claude-code-archive" as const, sessionId: "s", fileName: `${sha}.jsonl`, bytes: 1, sha256: sha, sourceId: "fp" };
    expect(parseArchiveLocator(formatArchiveLocator(good))).toEqual(good);
    expect(parseArchiveLocator(formatArchiveLocator({ ...good, fileName: "../x.jsonl" }))).toBeNull();
    expect(parseArchiveLocator(formatArchiveLocator({ ...good, sha256: "b".repeat(64) }))).toBeNull();
    expect(parseArchiveLocator(formatArchiveLocator({ ...good, bytes: -1 }))).toBeNull();
    expect(parseArchiveLocator("mori-passage:v1:{}")).toBeNull();
    expect(parseArchiveLocator(undefined)).toBeNull();
  });

  it("finds the session's newest kept copy, never a removed one or another session's", () => {
    const older = archiveSourceFor("s", archive, () => new Date("2026-10-01T00:00:00Z"));
    const newer = archiveSourceFor("s", { ...archive, fileName: `${"c".repeat(64)}.jsonl`, sha256: "c".repeat(64) }, () => new Date("2026-10-09T00:00:00Z"));
    const other = archiveSourceFor("t", archive, () => new Date("2026-10-10T00:00:00Z"));
    expect(keptArchiveOf([older, newer, other], "s")?.source.id).toBe(newer.id);
    expect(keptArchiveOf([older, removedArchiveSource(newer), other], "s")?.source.id).toBe(older.id);
    expect(keptArchiveOf([removedArchiveSource(older)], "s")).toBeNull();
    expect(removedArchiveSource(older)).toMatchObject({ retention: "notCaptured", locator: older.locator });
  });

  it("states sizes plainly", () => {
    expect(formatArchiveBytes(151 * 1024 * 1024)).toBe("151 MB");
    expect(formatArchiveBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatArchiveBytes(2048)).toBe("2 KB");
  });
});
