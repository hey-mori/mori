import { describe, expect, it } from "vitest";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import { buildMemoryHealthNotifications } from "./memoryHealthNotifications";

function memory(
  overrides: Partial<StoredAcceptedProjectMemory> & { id: string },
): StoredAcceptedProjectMemory {
  return {
    projectId: "proj-1",
    kind: "promotedDecision",
    title: "결정",
    summary: "결정 요약",
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium", score: 0.7 },
    evidenceRefs: [],
    sourceSessionIds: ["sess-1"],
    originProposalIds: ["prop-1"],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    acceptedAt: "2026-05-01T00:00:00.000Z",
    acceptedBy: "local-user",
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("buildMemoryHealthNotifications", () => {
  it("emits a stale-memory notification when any superseded memory is present", () => {
    const notifications = buildMemoryHealthNotifications({
      acceptedMemories: [
        memory({ id: "m-stale", status: "superseded", supersededBy: "m-newer" }),
        memory({ id: "m-fresh" }),
      ],
    });
    const stale = notifications.find((n) => n.id === "memory-health:stale");
    expect(stale).toBeDefined();
    expect(stale?.kind).toBe("memory_stale_detected");
    expect(stale?.title).toContain("1");
    expect(stale?.actionTarget).toEqual({
      kind: "view",
      view: "consolidation",
    });
  });

  it("emits a contradiction notification when two accepted decisions disagree", () => {
    const notifications = buildMemoryHealthNotifications({
      acceptedMemories: [
        memory({ id: "m-a", title: "Auth 전략", summary: "JWT 사용" }),
        memory({ id: "m-b", title: "Auth 전략", summary: "세션 쿠키 사용" }),
      ],
    });
    const contra = notifications.find(
      (n) => n.id === "memory-health:contradiction",
    );
    expect(contra).toBeDefined();
    expect(contra?.kind).toBe("memory_contradiction_detected");
    expect(contra?.actionTarget).toEqual({
      kind: "view",
      view: "consolidation",
    });
  });

  it("returns an empty list when no health issues are detected", () => {
    const notifications = buildMemoryHealthNotifications({
      acceptedMemories: [
        memory({ id: "m-1" }),
        memory({ id: "m-2", title: "다른 결정" }),
      ],
    });
    expect(notifications).toEqual([]);
  });
});
