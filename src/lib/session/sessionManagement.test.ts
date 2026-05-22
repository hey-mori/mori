import { describe, expect, it } from "vitest";
import type { Session } from "../../domain/types";
import {
  applySessionArchive,
  applySessionRename,
  applySessionUnarchive,
  isSessionArchived,
  normalizeSessionTitle,
} from "./sessionManagement";

function session(over: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    projectId: "proj-1",
    title: "원래 제목",
    startedAt: "2026-05-20T09:00:00+09:00",
    endedAt: "2026-05-20T10:30:00+09:00",
    recordingMode: "summary",
    llmProvider: "ollama",
    llmModel: "llama3.1:8b",
    storageLocation: "browser:localStorage",
    selectedSourceIds: [],
    status: "complete",
    ...over,
  };
}

describe("normalizeSessionTitle", () => {
  it("trims and returns null for blank input", () => {
    expect(normalizeSessionTitle("  새 제목  ")).toBe("새 제목");
    expect(normalizeSessionTitle("   ")).toBeNull();
    expect(normalizeSessionTitle("")).toBeNull();
  });
});

describe("applySessionRename", () => {
  it("renames to a trimmed title", () => {
    const next = applySessionRename(session(), "  바뀐 제목 ");
    expect(next.title).toBe("바뀐 제목");
  });

  it("returns the same reference for a blank or unchanged title", () => {
    const base = session();
    expect(applySessionRename(base, "   ")).toBe(base);
    expect(applySessionRename(base, "원래 제목")).toBe(base);
    // A title that only differs by surrounding whitespace is unchanged.
    expect(applySessionRename(base, "  원래 제목  ")).toBe(base);
  });
});

describe("applySessionArchive", () => {
  it("stamps archivedAt with the supplied timestamp", () => {
    const next = applySessionArchive(session(), "2026-05-22T12:00:00+09:00");
    expect(next.archivedAt).toBe("2026-05-22T12:00:00+09:00");
  });

  it("is idempotent for an already-archived session", () => {
    const archived = session({ archivedAt: "2026-05-21T00:00:00+09:00" });
    expect(applySessionArchive(archived, "2026-05-22T12:00:00+09:00")).toBe(archived);
  });

  it("preserves the underlying status when archiving", () => {
    const next = applySessionArchive(
      session({ status: "analyzing" }),
      "2026-05-22T12:00:00+09:00",
    );
    expect(next.status).toBe("analyzing");
  });
});

describe("applySessionUnarchive", () => {
  it("clears archivedAt", () => {
    const archived = session({ archivedAt: "2026-05-21T00:00:00+09:00" });
    const next = applySessionUnarchive(archived);
    expect(next.archivedAt).toBeUndefined();
    expect("archivedAt" in next).toBe(false);
  });

  it("returns the same reference when the session was not archived", () => {
    const base = session();
    expect(applySessionUnarchive(base)).toBe(base);
  });
});

describe("isSessionArchived", () => {
  it("reflects the archivedAt flag", () => {
    expect(isSessionArchived(session())).toBe(false);
    expect(isSessionArchived(session({ archivedAt: "2026-05-21T00:00:00+09:00" }))).toBe(
      true,
    );
  });
});
