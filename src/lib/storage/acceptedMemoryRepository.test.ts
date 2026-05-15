import { describe, expect, it } from "vitest";
import { BrowserDraftRepository } from "./localStorageAdapter";
import { MemoryKeyValueStorage } from "./memoryStorage";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "./storageTypes";

function memory(
  id: string,
  projectId: string,
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id,
    projectId,
    kind: "promotedDecision",
    title: `Memory ${id}`,
    summary: `Summary ${id}`,
    status: "accepted",
    importance: "medium",
    confidence: { label: "high", score: 0.85 },
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "Sample" }],
    sourceSessionIds: ["s-1"],
    originProposalIds: [`p-${id}`],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-15T11:00:00Z",
    acceptedAt: "2026-05-15T11:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

function action(
  id: string,
  projectId: string,
  overrides: Partial<StoredMemoryReviewAction> = {},
): StoredMemoryReviewAction {
  return {
    id,
    projectId,
    actionType: "accept",
    actor: "local-user",
    timestamp: "2026-05-15T11:00:00Z",
    targetMemoryIds: [],
    reversible: true,
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("BrowserDraftRepository — Accepted Project Memory", () => {
  it("saves a single accepted memory and reads it back via list/get", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const stored = repo.saveAcceptedProjectMemory(memory("m1", "p1"));
    expect(stored.id).toBe("m1");
    expect(stored.adapter).toBe("browser-local-storage");
    expect(stored.schemaVersion).toBe(1);
    expect(repo.listAcceptedProjectMemories("p1")).toEqual([stored]);
    expect(repo.getAcceptedProjectMemory("m1")).toEqual(stored);
  });

  it("saves multiple memories and lists them most-recent first", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repo.saveAcceptedProjectMemories([
      memory("m1", "p1", { acceptedAt: "2026-05-10T10:00:00Z" }),
      memory("m2", "p1", { acceptedAt: "2026-05-15T10:00:00Z" }),
      memory("m3", "p1", { acceptedAt: "2026-05-12T10:00:00Z" }),
    ]);
    const list = repo.listAcceptedProjectMemories("p1");
    expect(list.map((entry) => entry.id)).toEqual(["m2", "m3", "m1"]);
  });

  it("lists only the records that match the requested projectId", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repo.saveAcceptedProjectMemory(memory("m1", "p1"));
    repo.saveAcceptedProjectMemory(memory("m2", "p2"));
    expect(repo.listAcceptedProjectMemories("p1").map((entry) => entry.id)).toEqual(["m1"]);
    expect(repo.listAcceptedProjectMemories("p2").map((entry) => entry.id)).toEqual(["m2"]);
  });

  it("listAcceptedProjectMemories returns an empty array when nothing was saved", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    expect(repo.listAcceptedProjectMemories("p1")).toEqual([]);
  });

  it("ignores stored records with an unknown schema version", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.consolidatedMemory.p1.future",
      JSON.stringify({ ...memory("future", "p1"), schemaVersion: 99 }),
    );
    const repo = new BrowserDraftRepository(storage);
    expect(repo.listAcceptedProjectMemories("p1")).toEqual([]);
    expect(repo.getAcceptedProjectMemory("future")).toBeNull();
  });

  it("ignores stored records that fail to parse", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem("mori.consolidatedMemory.p1.broken", "{not-valid}");
    const repo = new BrowserDraftRepository(storage);
    expect(repo.listAcceptedProjectMemories("p1")).toEqual([]);
  });

  it("getAcceptedProjectMemory returns null when no record matches", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    expect(repo.getAcceptedProjectMemory("missing")).toBeNull();
  });

  it("saveAcceptedProjectMemory replaces an existing record with the same id", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repo.saveAcceptedProjectMemory(memory("m1", "p1", { title: "Initial" }));
    repo.saveAcceptedProjectMemory(memory("m1", "p1", { title: "Updated" }));
    const list = repo.listAcceptedProjectMemories("p1");
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("Updated");
  });
});

describe("BrowserDraftRepository — Memory Review Action audit log", () => {
  it("appends actions and lists them most-recent first", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repo.appendMemoryReviewAction(action("a1", "p1", { timestamp: "2026-05-10T10:00:00Z" }));
    repo.appendMemoryReviewAction(action("a2", "p1", { timestamp: "2026-05-15T10:00:00Z" }));
    repo.appendMemoryReviewAction(action("a3", "p1", { timestamp: "2026-05-12T10:00:00Z" }));
    const list = repo.listMemoryReviewActions("p1");
    expect(list.map((entry) => entry.id)).toEqual(["a2", "a3", "a1"]);
  });

  it("partitions audit rows by projectId", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    repo.appendMemoryReviewAction(action("a1", "p1"));
    repo.appendMemoryReviewAction(action("a2", "p2"));
    expect(repo.listMemoryReviewActions("p1").map((entry) => entry.id)).toEqual(["a1"]);
    expect(repo.listMemoryReviewActions("p2").map((entry) => entry.id)).toEqual(["a2"]);
  });

  it("listMemoryReviewActions returns an empty array when nothing was logged", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    expect(repo.listMemoryReviewActions("p1")).toEqual([]);
  });

  it("normalises adapter + schemaVersion fields on append", () => {
    const repo = new BrowserDraftRepository(new MemoryKeyValueStorage());
    const stored = repo.appendMemoryReviewAction(action("a1", "p1"));
    expect(stored.adapter).toBe("browser-local-storage");
    expect(stored.schemaVersion).toBe(1);
  });

  it("ignores audit rows with mismatched schema versions", () => {
    const storage = new MemoryKeyValueStorage();
    storage.setItem(
      "mori.consolidatedMemoryAudit.p1.future",
      JSON.stringify({ ...action("future", "p1"), schemaVersion: 99 }),
    );
    const repo = new BrowserDraftRepository(storage);
    expect(repo.listMemoryReviewActions("p1")).toEqual([]);
  });
});
