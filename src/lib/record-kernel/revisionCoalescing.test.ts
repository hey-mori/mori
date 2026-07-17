import { describe, expect, it } from "vitest";
import type { KernelRevision, MoriRecord } from "./kernelTypes";
import {
  canCoalesceRevisions,
  coalesceRevision,
  REVISION_COALESCE_WINDOW_MS,
} from "./revisionCoalescing";

function record(body: string): MoriRecord {
  return {
    id: "rec-1",
    schemaId: "note",
    title: "메모",
    body,
    capturedAt: "2026-07-17T09:00:00.000Z",
    timeBasis: "capture-fallback",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds: [],
    properties: {},
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
  };
}

function revision(over: Partial<KernelRevision> = {}): KernelRevision {
  return {
    id: "rev-1",
    recordId: "rec-1",
    operation: "update",
    actor: "user",
    createdAt: "2026-07-17T09:00:00.000Z",
    before: record("가"),
    after: record("가나"),
    ...over,
  };
}

describe("canCoalesceRevisions", () => {
  it("groups a user's consecutive edits inside the idle window", () => {
    const first = revision({ createdAt: "2026-07-17T09:00:00.000Z" });
    const second = revision({ id: "rev-2", createdAt: "2026-07-17T09:00:02.000Z" });
    expect(canCoalesceRevisions(first, second)).toBe(true);
  });

  it("breaks the group once the writer has been idle", () => {
    const first = revision({ createdAt: "2026-07-17T09:00:00.000Z" });
    const late = revision({
      id: "rev-2",
      createdAt: new Date(Date.parse("2026-07-17T09:00:00.000Z") + REVISION_COALESCE_WINDOW_MS + 1).toISOString(),
    });
    expect(canCoalesceRevisions(first, late)).toBe(false);
  });

  it("never swallows the events a history is actually read for", () => {
    const first = revision();
    // A status change is its own entry.
    expect(canCoalesceRevisions(first, revision({ id: "r2", operation: "status-change" }))).toBe(false);
    expect(canCoalesceRevisions(revision({ operation: "create" }), revision({ id: "r2" }))).toBe(false);
    // So is a different actor's edit landing on top of yours.
    expect(canCoalesceRevisions(first, revision({ id: "r2", actor: "ai" }))).toBe(false);
    // And a different record never groups.
    expect(canCoalesceRevisions(first, revision({ id: "r2", recordId: "rec-2" }))).toBe(false);
  });
});

describe("coalesceRevision", () => {
  it("takes over the previous id and keeps its starting point", () => {
    // The id is the store key, so reusing it overwrites instead of appending;
    // keeping `before` means 되돌리기 reverts the whole burst.
    const first = revision({ id: "rev-1", before: record(""), after: record("가") });
    const second = revision({ id: "rev-2", createdAt: "2026-07-17T09:00:01.000Z", before: record("가"), after: record("가나다") });
    const merged = coalesceRevision(first, second);
    expect(merged.id).toBe("rev-1");
    expect((merged.before as MoriRecord).body).toBe("");
    expect((merged.after as MoriRecord).body).toBe("가나다");
  });

  it("passes a revision through untouched when there is nothing to group with", () => {
    const next = revision({ id: "rev-9" });
    expect(coalesceRevision(undefined, next)).toBe(next);
    expect(coalesceRevision(revision({ operation: "create" }), next)).toBe(next);
  });
});
