import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import {
  buildClientSafeMoriPackage,
  buildMemoryClientSafeBreakdown,
  classifyMemoryForClientSafe,
  createMoriPackageFromSession,
  getPackageConsolidatedMemories,
} from "./index";

function memory(
  overrides: Partial<StoredAcceptedProjectMemory> & { id: string },
): StoredAcceptedProjectMemory {
  return {
    projectId: "proj-1",
    kind: "promotedDecision",
    title: "결정",
    summary: "요약",
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium", score: 0.7 },
    evidenceRefs: [],
    sourceSessionIds: ["s-1"],
    originProposalIds: ["p-1"],
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

describe("classifyMemoryForClientSafe", () => {
  it("includes only clientSafe + normal sensitivity memory", () => {
    expect(
      classifyMemoryForClientSafe(
        memory({ id: "a", reportEligibility: "clientSafe", sensitivity: "normal" }),
      ),
    ).toBe("included");
  });

  it("excludes sensitive memory regardless of report tier", () => {
    expect(
      classifyMemoryForClientSafe(
        memory({
          id: "b",
          reportEligibility: "clientSafe",
          sensitivity: "sensitive",
        }),
      ),
    ).toBe("excludedSensitive");
  });

  it("excludes personal/team tier memory even when not sensitive", () => {
    expect(
      classifyMemoryForClientSafe(memory({ id: "c", reportEligibility: "team" })),
    ).toBe("excludedTier");
    expect(
      classifyMemoryForClientSafe(memory({ id: "d", reportEligibility: "personal" })),
    ).toBe("excludedTier");
  });
});

describe("buildMemoryClientSafeBreakdown", () => {
  it("rolls categories up into included / excluded counts", () => {
    const breakdown = buildMemoryClientSafeBreakdown([
      memory({ id: "1", reportEligibility: "clientSafe" }),
      memory({ id: "2", reportEligibility: "clientSafe" }),
      memory({ id: "3", reportEligibility: "team" }),
      memory({
        id: "4",
        reportEligibility: "clientSafe",
        sensitivity: "sensitive",
      }),
    ]);
    expect(breakdown).toEqual({
      included: 2,
      excludedSensitive: 1,
      excludedTier: 1,
      totalExcluded: 2,
    });
  });

  it("matches buildClientSafeMoriPackage's actual survivor count", () => {
    const memories = [
      memory({ id: "a", reportEligibility: "clientSafe" }),
      memory({ id: "b", reportEligibility: "team" }),
      memory({
        id: "c",
        reportEligibility: "clientSafe",
        sensitivity: "sensitive",
      }),
    ];
    const breakdown = buildMemoryClientSafeBreakdown(memories);
    const fullPkg = createMoriPackageFromSession(moriMockSession, {
      consolidatedMemories: memories,
      auditTrail: [],
    });
    const survivors = getPackageConsolidatedMemories(
      buildClientSafeMoriPackage(fullPkg),
    );
    expect(survivors.length).toBe(breakdown.included);
  });
});
