import { describe, expect, it } from "vitest";
import {
  buildMemoryAuditTrailViewModel,
  describeMemoryAuditAction,
} from "./memoryAuditTrail";
import type { StoredMemoryReviewAction } from "../storage/storageTypes";

function action(overrides: Partial<StoredMemoryReviewAction> = {}): StoredMemoryReviewAction {
  return {
    id: "act-1",
    projectId: "p-1",
    actionType: "accept",
    actor: "local-user",
    timestamp: "2026-05-14T09:00:00Z",
    targetMemoryIds: ["mem-1"],
    reversible: true,
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("buildMemoryAuditTrailViewModel", () => {
  it("returns an empty view-model when there are no actions", () => {
    const vm = buildMemoryAuditTrailViewModel([]);
    expect(vm.isEmpty).toBe(true);
    expect(vm.totalCount).toBe(0);
    expect(vm.groups).toEqual([]);
    expect(vm.actionTypeCounts.apply).toBe(0);
  });

  it("sorts entries newest first across groups", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({ id: "old", timestamp: "2026-05-10T08:00:00Z" }),
      action({ id: "new", timestamp: "2026-05-14T12:00:00Z" }),
      action({ id: "mid", timestamp: "2026-05-12T10:00:00Z" }),
    ]);
    const flat = vm.groups.flatMap((group) => group.entries.map((entry) => entry.id));
    expect(flat).toEqual(["new", "mid", "old"]);
  });

  it("groups entries by UTC date, newest group first", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({ id: "a", timestamp: "2026-05-14T23:30:00Z" }),
      action({ id: "b", timestamp: "2026-05-14T01:00:00Z" }),
      action({ id: "c", timestamp: "2026-05-13T12:00:00Z" }),
    ]);
    expect(vm.groups.map((group) => group.dateKey)).toEqual(["2026-05-14", "2026-05-13"]);
    expect(vm.groups[0]?.entries.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(vm.groups[1]?.entries.map((entry) => entry.id)).toEqual(["c"]);
  });

  it("filters by action type while keeping pre-filter counts for chips", () => {
    const actions = [
      action({ id: "x", actionType: "accept" }),
      action({ id: "y", actionType: "apply" }),
      action({ id: "z", actionType: "discard" }),
    ];
    const vm = buildMemoryAuditTrailViewModel(actions, { filter: "apply" });
    expect(vm.filteredCount).toBe(1);
    expect(vm.groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual(["y"]);
    // Counts reflect ALL actions so the chips still show real totals.
    expect(vm.actionTypeCounts.accept).toBe(1);
    expect(vm.actionTypeCounts.apply).toBe(1);
    expect(vm.actionTypeCounts.discard).toBe(1);
    expect(vm.totalCount).toBe(3);
  });

  it("caps rendered entries and reports truncation", () => {
    const actions = Array.from({ length: 5 }, (_, i) =>
      action({ id: `act-${i}`, timestamp: `2026-05-1${i}T10:00:00Z` }),
    );
    const vm = buildMemoryAuditTrailViewModel(actions, { maxEntries: 3 });
    expect(vm.truncated).toBe(true);
    expect(vm.groups.flatMap((g) => g.entries).length).toBe(3);
    expect(vm.filteredCount).toBe(5);
  });

  it("tolerates a missing targetMemoryIds array and a missing note", () => {
    const legacy = {
      id: "legacy",
      projectId: "p-1",
      actionType: "accept",
      actor: "local-user",
      timestamp: "2026-05-14T09:00:00Z",
      reversible: true,
      schemaVersion: 1,
      adapter: "browser-local-storage",
    } as unknown as StoredMemoryReviewAction;
    const vm = buildMemoryAuditTrailViewModel([legacy]);
    const entry = vm.groups[0]?.entries[0];
    expect(entry?.targetMemoryCount).toBe(0);
    expect(entry?.note).toBeNull();
  });

  it("groups an unparseable timestamp under an unknown-date bucket", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({ id: "good", timestamp: "2026-05-14T09:00:00Z" }),
      action({ id: "bad", timestamp: "not-a-date" }),
    ]);
    const unknown = vm.groups.find((group) => group.dateKey === "unknown");
    expect(unknown).toBeDefined();
    expect(unknown?.entries.map((entry) => entry.id)).toEqual(["bad"]);
    // The valid action still sorts ahead of the unparseable one.
    expect(vm.groups[0]?.dateKey).toBe("2026-05-14");
    expect(unknown?.entries[0]?.timeLabel).toBe("—");
  });

  it("keeps a readable label for an unknown legacy action type", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({ id: "weird", actionType: "supersede" as StoredMemoryReviewAction["actionType"] }),
    ]);
    expect(vm.groups[0]?.entries[0]?.actionLabel).toBe("Supersede");
  });

  it("never exposes before/after snapshots in the formatted entry", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({
        id: "snap",
        before: { title: "Secret /Users/me/work decision", summary: "raw content" },
        after: { title: "Another secret", summary: "more raw content" },
        note: "reviewer note kept",
      }),
    ]);
    const entry = vm.groups[0]?.entries[0];
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("/Users/me/work");
    expect(serialized).not.toContain("raw content");
    expect(entry?.note).toBe("reviewer note kept");
  });

  it("describes known action types and falls back for empty input", () => {
    expect(describeMemoryAuditAction("apply")).toBe("Applied");
    expect(describeMemoryAuditAction("watch")).toBe("Kept watching");
    expect(describeMemoryAuditAction("")).toBe("Unknown action");
  });

  it("derives a status transition from before/after snapshots", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({
        id: "lifecycle",
        before: { title: "Decision", status: "accepted", summary: "..." },
        after: { title: "Decision", status: "stale", summary: "..." },
      }),
    ]);
    const entry = vm.groups[0]?.entries[0];
    expect(entry?.statusChange).toEqual({ from: "accepted", to: "stale" });
  });

  it("reports a new-memory transition as from=null", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({
        id: "new",
        before: { proposalTitle: "Decision", proposalStatus: "proposed" },
        after: { title: "Decision", status: "accepted", summary: "..." },
      }),
    ]);
    expect(vm.groups[0]?.entries[0]?.statusChange).toEqual({ from: null, to: "accepted" });
  });

  it("has no statusChange when neither snapshot carries a status", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({ id: "discard", actionType: "discard", before: { proposalTitle: "x" } }),
    ]);
    expect(vm.groups[0]?.entries[0]?.statusChange).toBeNull();
  });

  it("surfaces the source proposal id and never the raw snapshot fields", () => {
    const vm = buildMemoryAuditTrailViewModel([
      action({
        id: "row",
        sourceProposalId: "proposal::staleMemory::mem-1",
        before: { title: "Secret /Users/me decision", status: "accepted", summary: "raw" },
        after: { title: "Secret", status: "stale", summary: "raw" },
      }),
    ]);
    const entry = vm.groups[0]?.entries[0];
    expect(entry?.sourceProposalId).toBe("proposal::staleMemory::mem-1");
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("/Users/me");
    expect(serialized).not.toContain("raw");
  });
});
