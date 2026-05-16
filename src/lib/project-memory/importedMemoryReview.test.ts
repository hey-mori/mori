import { describe, expect, it } from "vitest";
import {
  buildImportedMemoryProposals,
  parseImportedMemoryProposals,
  parseImportedMemoryProposalsFromZip,
} from "./importedMemoryReview";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import {
  buildClientSafeMoriPackage,
  createMoriPackageFromSession,
  serializeMoriPackage,
  zipMoriPackage,
} from "../mori-package";
import { moriMockSession } from "../../domain/mock-data";

function memory(
  id: string,
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id,
    projectId: "p-1",
    kind: "promotedDecision",
    title: `Decision ${id}`,
    summary: `Summary ${id}`,
    status: "accepted",
    importance: "high",
    confidence: { label: "high", score: 0.9 },
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "Sprint" }],
    sourceSessionIds: ["s-1"],
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
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("buildImportedMemoryProposals", () => {
  it("converts imported memories into reviewable proposals", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [memory("a"), memory("b")],
      existingMemories: [],
      packageId: "mori_p_s",
    });
    expect(result.proposals).toHaveLength(2);
    expect(result.skipped).toEqual([]);
    const proposal = result.proposals[0];
    expect(proposal?.kind).toBe("promotedDecision");
    expect(proposal?.proposedAction).toBe("promote");
    expect(proposal?.status).toBe("proposed");
    expect(proposal?.id).toBe("proposal::importedMemory::a");
    expect(proposal?.rationale).toContain("mori_p_s");
    expect(proposal?.rationale).toContain("never auto-merged");
  });

  it("preserves the imported memory's kind", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [memory("r", { kind: "unresolvedRisk" })],
      existingMemories: [],
    });
    expect(result.proposals[0]?.kind).toBe("unresolvedRisk");
  });

  it("skips a memory the project already holds by origin proposal id", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [memory("a", { id: "imported-a", originProposalIds: ["prop-shared"] })],
      existingMemories: [memory("local", { originProposalIds: ["prop-shared"] })],
    });
    expect(result.proposals).toEqual([]);
    expect(result.skipped).toEqual([
      { memoryId: "imported-a", title: "Decision a", reason: "duplicate-origin" },
    ]);
  });

  it("skips a memory the project already holds by title within the same kind", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [memory("imported", { title: "Storage backend." })],
      existingMemories: [memory("local", { title: "  storage backend  " })],
    });
    expect(result.proposals).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("duplicate-title");
  });

  it("does not treat a same-title different-kind memory as a duplicate", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [memory("imported", { title: "Storage backend", kind: "promotedDecision" })],
      existingMemories: [memory("local", { title: "Storage backend", kind: "unresolvedRisk" })],
    });
    expect(result.proposals).toHaveLength(1);
  });

  it("deduplicates a package that lists the same memory twice", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [
        memory("dup-1", { title: "Same decision" }),
        memory("dup-2", { title: "Same decision" }),
      ],
      existingMemories: [],
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe("duplicate-title");
  });

  it("carries evidence refs and source session ids without raw content", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [
        memory("a", {
          evidenceRefs: [{ kind: "source", sessionId: "s-1", sourceId: "src-1" }],
          sourceSessionIds: ["s-1", "s-2"],
        }),
      ],
      existingMemories: [],
    });
    const proposal = result.proposals[0];
    expect(proposal?.evidenceRefs).toEqual([
      { kind: "source", sessionId: "s-1", sourceId: "src-1" },
    ]);
    expect(proposal?.sourceSessionIds).toEqual(["s-1", "s-2"]);
  });

  it("falls back to a label-derived confidence when the memory has no score", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [memory("a", { confidence: { label: "medium" } })],
      existingMemories: [],
    });
    expect(result.proposals[0]?.confidence).toBe(0.6);
  });

  it("returns an empty result for an empty package", () => {
    const result = buildImportedMemoryProposals({
      packageMemories: [],
      existingMemories: [memory("local")],
    });
    expect(result).toEqual({ proposals: [], skipped: [] });
  });
});

function packageJson(memories: StoredAcceptedProjectMemory[]): string {
  return serializeMoriPackage(
    createMoriPackageFromSession(moriMockSession, { consolidatedMemories: memories }),
  );
}

describe("parseImportedMemoryProposals", () => {
  it("parses a .mori v0 package and builds proposals from its memories", () => {
    const result = parseImportedMemoryProposals(packageJson([memory("a"), memory("b")]), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memoryCount).toBe(2);
    expect(result.proposals).toHaveLength(2);
    expect(result.packageId).toBeTruthy();
  });

  it("reports an empty paste as an error", () => {
    const result = parseImportedMemoryProposals("   ", []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Paste a \.mori/);
  });

  it("reports malformed JSON as an error without throwing", () => {
    const result = parseImportedMemoryProposals("{ not valid json", []);
    expect(result.ok).toBe(false);
  });

  it("reports a structurally invalid package as an error", () => {
    const result = parseImportedMemoryProposals(JSON.stringify({ manifest: {} }), []);
    expect(result.ok).toBe(false);
  });

  it("deduplicates imported memories against existing accepted memories", () => {
    const result = parseImportedMemoryProposals(
      packageJson([memory("a", { title: "Shared decision" })]),
      [memory("local", { title: "Shared decision" })],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("returns ok with zero proposals for a package carrying no accepted memory", () => {
    const result = parseImportedMemoryProposals(packageJson([]), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memoryCount).toBe(0);
    expect(result.proposals).toEqual([]);
  });

  it("reports a normal package as not client-safe", () => {
    const result = parseImportedMemoryProposals(packageJson([memory("a")]), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isClientSafe).toBe(false);
  });

  it("reports a client-safe package as client-safe", () => {
    const safe = buildClientSafeMoriPackage(
      createMoriPackageFromSession(moriMockSession, { consolidatedMemories: [] }),
    );
    const result = parseImportedMemoryProposals(serializeMoriPackage(safe), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isClientSafe).toBe(true);
  });
});

function packageZip(memories: StoredAcceptedProjectMemory[]): Uint8Array {
  return zipMoriPackage(
    createMoriPackageFromSession(moriMockSession, { consolidatedMemories: memories }),
  );
}

describe("parseImportedMemoryProposalsFromZip", () => {
  it("unzips a real .mori package and builds proposals from its memories", () => {
    const result = parseImportedMemoryProposalsFromZip(
      packageZip([memory("a"), memory("b")]),
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memoryCount).toBe(2);
    expect(result.proposals).toHaveLength(2);
    expect(result.packageId).toBeTruthy();
  });

  it("reports empty bytes as an error", () => {
    const result = parseImportedMemoryProposalsFromZip(new Uint8Array(), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Pick a \.mori/);
  });

  it("reports non-zip bytes as an error without throwing", () => {
    const result = parseImportedMemoryProposalsFromZip(
      new Uint8Array([1, 2, 3, 4]),
      [],
    );
    expect(result.ok).toBe(false);
  });

  it("deduplicates zip-imported memories against existing accepted memories", () => {
    const result = parseImportedMemoryProposalsFromZip(
      packageZip([memory("a", { title: "Shared decision" })]),
      [memory("local", { title: "Shared decision" })],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("reports a client-safe zip package as client-safe", () => {
    const safe = buildClientSafeMoriPackage(
      createMoriPackageFromSession(moriMockSession, { consolidatedMemories: [] }),
    );
    const result = parseImportedMemoryProposalsFromZip(zipMoriPackage(safe), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isClientSafe).toBe(true);
  });
});
