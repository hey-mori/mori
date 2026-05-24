import { describe, expect, it } from "vitest";
import type { Session } from "../../domain/types";
import {
  applySessionRename,
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
