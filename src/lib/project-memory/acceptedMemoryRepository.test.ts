import { describe, expect, it, vi } from "vitest";
import {
  AcceptedMemoryRepository,
  describeAcceptedMemoryStorageSource,
  type AcceptedMemoryDesktopCommands,
} from "./acceptedMemoryRepository";
import { BrowserDraftRepository } from "../storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import {
  toSqliteAcceptedMemoryRow,
  toSqliteMemoryReviewActionRow,
} from "../sqlite/acceptedMemoryRows";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

function memory(
  id: string,
  projectId = "p-1",
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id,
    projectId,
    kind: "promotedDecision",
    title: `Memory ${id}`,
    summary: `Summary ${id}`,
    status: "accepted",
    importance: "high",
    confidence: { label: "high", score: 0.9 },
    evidenceRefs: [{ kind: "session", sessionId: "s-1" }],
    sourceSessionIds: ["s-1"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
    acceptedAt: "2026-05-12T10:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: ["act-1"],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

function action(
  id: string,
  projectId = "p-1",
  overrides: Partial<StoredMemoryReviewAction> = {},
): StoredMemoryReviewAction {
  return {
    id,
    projectId,
    actionType: "accept",
    actor: "local-user",
    timestamp: "2026-05-12T10:00:00Z",
    targetMemoryIds: ["mem-1"],
    reversible: true,
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

function browserRepo(): BrowserDraftRepository {
  return new BrowserDraftRepository(new MemoryKeyValueStorage());
}

/** Desktop command bridge backed by in-memory arrays. */
function fakeDesktopCommands() {
  const memories: ReturnType<typeof toSqliteAcceptedMemoryRow>[] = [];
  const actions: ReturnType<typeof toSqliteMemoryReviewActionRow>[] = [];
  const commands: AcceptedMemoryDesktopCommands = {
    saveAcceptedProjectMemories: vi.fn(async (rows) => {
      memories.push(...rows);
      return { memoriesWritten: rows.length };
    }),
    listAcceptedProjectMemories: vi.fn(async (projectId: string) =>
      memories.filter((row) => row.project_id === projectId),
    ),
    appendMemoryReviewActionRows: vi.fn(async (rows) => {
      actions.push(...rows);
      return { actionsWritten: rows.length };
    }),
    listMemoryReviewActionRows: vi.fn(async (projectId: string) =>
      actions.filter((row) => row.project_id === projectId),
    ),
  };
  return { commands, memories, actions };
}

describe("AcceptedMemoryRepository — browser mode", () => {
  it("routes save and list through localStorage", async () => {
    const repo = new AcceptedMemoryRepository({ runtime: "browser", repository: browserRepo() });

    const saved = await repo.saveAcceptedProjectMemories("p-1", [memory("mem-1")]);
    expect(saved.source).toBe("browser-local-storage");
    expect(saved.fellBack).toBe(false);

    const listed = await repo.listAcceptedProjectMemories("p-1");
    expect(listed.source).toBe("browser-local-storage");
    expect(listed.data.map((row) => row.id)).toEqual(["mem-1"]);
  });

  it("routes review actions through localStorage", async () => {
    const repo = new AcceptedMemoryRepository({ runtime: "browser", repository: browserRepo() });

    const appended = await repo.appendMemoryReviewActions("p-1", [action("act-1"), action("act-2")]);
    expect(appended.source).toBe("browser-local-storage");
    expect(appended.data).toHaveLength(2);

    const listed = await repo.listMemoryReviewActions("p-1");
    expect(listed.data.map((row) => row.id).sort()).toEqual(["act-1", "act-2"]);
  });

  it("does not touch the SQLite commands in browser mode", async () => {
    const { commands } = fakeDesktopCommands();
    const repo = new AcceptedMemoryRepository({
      runtime: "browser",
      repository: browserRepo(),
      commands,
    });
    await repo.saveAcceptedProjectMemories("p-1", [memory("mem-1")]);
    await repo.listMemoryReviewActions("p-1");
    expect(commands.saveAcceptedProjectMemories).not.toHaveBeenCalled();
    expect(commands.listMemoryReviewActionRows).not.toHaveBeenCalled();
  });
});

describe("AcceptedMemoryRepository — desktop mode", () => {
  it("routes save and list through the SQLite command bridge", async () => {
    const { commands } = fakeDesktopCommands();
    const repo = new AcceptedMemoryRepository({
      runtime: "desktop",
      repository: browserRepo(),
      commands,
    });

    const saved = await repo.saveAcceptedProjectMemories("p-1", [memory("mem-1")]);
    expect(commands.saveAcceptedProjectMemories).toHaveBeenCalledTimes(1);
    expect(saved.source).toBe("desktop-sqlite");
    expect(saved.fellBack).toBe(false);
    expect(saved.data[0]?.adapter).toBe("desktop-sqlite");

    const listed = await repo.listAcceptedProjectMemories("p-1");
    expect(commands.listAcceptedProjectMemories).toHaveBeenCalledWith("p-1");
    expect(listed.source).toBe("desktop-sqlite");
    expect(listed.data.map((row) => row.id)).toEqual(["mem-1"]);
    expect(listed.data[0]?.adapter).toBe("desktop-sqlite");
  });

  it("routes review actions through the SQLite command bridge", async () => {
    const { commands } = fakeDesktopCommands();
    const repo = new AcceptedMemoryRepository({
      runtime: "desktop",
      repository: browserRepo(),
      commands,
    });

    const appended = await repo.appendMemoryReviewActions("p-1", [action("act-1")]);
    expect(commands.appendMemoryReviewActionRows).toHaveBeenCalledTimes(1);
    expect(appended.source).toBe("desktop-sqlite");

    const listed = await repo.listMemoryReviewActions("p-1");
    expect(listed.data.map((row) => row.id)).toEqual(["act-1"]);
  });

  it("does not write to localStorage when SQLite succeeds", async () => {
    const { commands } = fakeDesktopCommands();
    const fallback = browserRepo();
    const repo = new AcceptedMemoryRepository({ runtime: "desktop", repository: fallback, commands });
    await repo.saveAcceptedProjectMemories("p-1", [memory("mem-1")]);
    // No duplicate write — localStorage stays empty.
    expect(fallback.listAcceptedProjectMemories("p-1")).toEqual([]);
  });
});

describe("AcceptedMemoryRepository — desktop fallback", () => {
  it("falls back to localStorage when a SQLite save fails, honestly", async () => {
    const { commands } = fakeDesktopCommands();
    commands.saveAcceptedProjectMemories = vi.fn(async () => {
      throw new Error("sqlite unavailable");
    });
    const fallback = browserRepo();
    const repo = new AcceptedMemoryRepository({ runtime: "desktop", repository: fallback, commands });

    const saved = await repo.saveAcceptedProjectMemories("p-1", [memory("mem-1")]);
    expect(saved.fellBack).toBe(true);
    expect(saved.source).toBe("browser-local-storage");
    expect(saved.fallbackReason).toContain("sqlite unavailable");
    // The record genuinely landed in localStorage.
    expect(fallback.listAcceptedProjectMemories("p-1").map((row) => row.id)).toEqual(["mem-1"]);
  });

  it("falls back to localStorage when a SQLite list fails", async () => {
    const { commands } = fakeDesktopCommands();
    commands.listMemoryReviewActionRows = vi.fn(async () => {
      throw new Error("sqlite read error");
    });
    const fallback = browserRepo();
    fallback.appendMemoryReviewAction(action("act-local"));
    const repo = new AcceptedMemoryRepository({ runtime: "desktop", repository: fallback, commands });

    const listed = await repo.listMemoryReviewActions("p-1");
    expect(listed.fellBack).toBe(true);
    expect(listed.source).toBe("browser-local-storage");
    expect(listed.data.map((row) => row.id)).toEqual(["act-local"]);
  });

  it("never claims desktop-sqlite as the source after a fallback", async () => {
    const { commands } = fakeDesktopCommands();
    commands.listAcceptedProjectMemories = vi.fn(async () => {
      throw new Error("boom");
    });
    const repo = new AcceptedMemoryRepository({
      runtime: "desktop",
      repository: browserRepo(),
      commands,
    });
    const listed = await repo.listAcceptedProjectMemories("p-1");
    expect(listed.source).not.toBe("desktop-sqlite");
  });
});

describe("describeAcceptedMemoryStorageSource", () => {
  it("maps each source to honest copy", () => {
    expect(describeAcceptedMemoryStorageSource("desktop-sqlite")).toBe("데스크톱 SQLite");
    expect(describeAcceptedMemoryStorageSource("browser-local-storage")).toBe("브라우저 저장소");
  });
});
