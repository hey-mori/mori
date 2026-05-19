import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";
import { buildMoriPackageExportPlan } from "./moriPackageExportPlan";

function memory(
  id: string,
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id,
    projectId: "p-1",
    kind: "promotedDecision",
    title: `Memory ${id}`,
    summary: "Reviewed project memory.",
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium", score: 0.7 },
    evidenceRefs: [{ kind: "session", sessionId: "s-cur" }],
    sourceSessionIds: ["s-cur"],
    originProposalIds: [`prop-${id}`],
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
    reviewActionIds: [`act-${id}`],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

function action(
  id: string,
  targetMemoryIds: string[],
): StoredMemoryReviewAction {
  return {
    id,
    projectId: "p-1",
    actionType: "accept",
    actor: "local-user",
    timestamp: "2026-05-12T10:00:00Z",
    sourceProposalId: `prop-${id}`,
    targetMemoryIds,
    note: "Accepted from consolidation review.",
    reversible: false,
    schemaVersion: 1,
    adapter: "browser-local-storage",
  };
}

describe("buildMoriPackageExportPlan", () => {
  it("counts the full package records and accepted-memory slices", () => {
    const plan = buildMoriPackageExportPlan({
      view: moriMockSession,
      consolidatedMemories: [
        memory("a", { reportEligibility: "clientSafe" }),
        memory("b", { sensitivity: "sensitive" }),
      ],
      auditTrail: [action("a", ["a"]), action("b", ["b"])],
    });

    expect(plan.full.sources).toBe(moriMockSession.sources.length);
    expect(plan.full.events).toBe(moriMockSession.events.length);
    expect(plan.full.issues).toBe(moriMockSession.issues.length);
    expect(plan.full.decisions).toBe(moriMockSession.decisions.length);
    expect(plan.full.nextActions).toBe(moriMockSession.nextActions.length);
    expect(plan.full.memories).toBe(2);
    expect(plan.full.auditRows).toBe(2);
    expect(plan.full.sensitiveMemories).toBe(1);
  });

  it("shows the client-safe memory and audit rows that survive filtering", () => {
    const plan = buildMoriPackageExportPlan({
      view: moriMockSession,
      consolidatedMemories: [
        memory("keep", { reportEligibility: "clientSafe", sensitivity: "normal" }),
        memory("drop-team", { reportEligibility: "team", sensitivity: "normal" }),
        memory("drop-sensitive", {
          reportEligibility: "clientSafe",
          sensitivity: "sensitive",
        }),
      ],
      auditTrail: [
        action("keep", ["keep"]),
        action("drop-team", ["drop-team"]),
        action("mixed", ["keep", "drop-team"]),
      ],
    });

    expect(plan.clientSafe.memories).toBe(1);
    expect(plan.clientSafe.auditRows).toBe(1);
    expect(plan.clientSafe.droppedMemories).toBe(2);
    expect(plan.clientSafe.droppedAuditRows).toBe(2);
  });
});
