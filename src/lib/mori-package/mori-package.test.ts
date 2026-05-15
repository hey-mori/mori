import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import {
  createMoriPackageFromSession,
  deserializeMoriPackage,
  getPackageConsolidatedMemories,
  serializeEventsJsonl,
  serializeMoriPackage,
  validateMoriPackage,
} from "./index";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

function acceptedMemory(
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id: "mem-1",
    projectId: "p-1",
    kind: "promotedDecision",
    title: "Keep Import Review as a non-bypassable gate",
    summary: "Every captured event passes through Import Review.",
    status: "accepted",
    importance: "high",
    confidence: { label: "high", score: 0.9 },
    evidenceRefs: [{ kind: "session", sessionId: "s-cur" }],
    sourceSessionIds: ["s-cur"],
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

describe(".mori package v0", () => {
  it("creates a valid package from a Mori session", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const validation = validateMoriPackage(pkg);

    expect(validation.valid).toBe(true);
    expect(pkg.manifest.formatVersion).toBe("0.1.0");
    expect(pkg.sessions[0]?.id).toBe(moriMockSession.session.id);
  });

  it("round-trips through JSON serialization", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const serialized = serializeMoriPackage(pkg);
    const deserialized = deserializeMoriPackage(serialized);

    expect(deserialized.manifest.packageId).toBe(pkg.manifest.packageId);
    expect(deserialized.events.length).toBe(pkg.events.length);
  });

  it("can expose events as JSONL for the future zip-like package", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const jsonl = serializeEventsJsonl(pkg);

    expect(jsonl.split("\n").length).toBe(pkg.events.length);
    expect(jsonl).toContain("evt-positioning");
  });
});

describe(".mori package v0 — accepted memory slice", () => {
  it("defaults consolidatedMemories to an empty array", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    expect(pkg.consolidatedMemories).toEqual([]);
    expect(validateMoriPackage(pkg).valid).toBe(true);
  });

  it("carries accepted memories and round-trips them through JSON", () => {
    const memories = [
      acceptedMemory({ id: "mem-a" }),
      acceptedMemory({ id: "mem-b", title: "Adopt SQLite for desktop persistence" }),
    ];
    const pkg = createMoriPackageFromSession(moriMockSession, {
      consolidatedMemories: memories,
    });
    expect(pkg.consolidatedMemories).toHaveLength(2);

    const restored = deserializeMoriPackage(serializeMoriPackage(pkg));
    expect(getPackageConsolidatedMemories(restored)).toHaveLength(2);
    expect(getPackageConsolidatedMemories(restored)[0]?.id).toBe("mem-a");
    expect(getPackageConsolidatedMemories(restored)[1]?.title).toBe(
      "Adopt SQLite for desktop persistence",
    );
  });

  it("treats a package exported before the field existed as empty", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    // Simulate an older package: drop the field entirely.
    const legacy = { ...pkg };
    delete (legacy as { consolidatedMemories?: unknown }).consolidatedMemories;

    const restored = deserializeMoriPackage(JSON.stringify(legacy));
    expect(restored.consolidatedMemories).toBeUndefined();
    expect(getPackageConsolidatedMemories(restored)).toEqual([]);
    expect(validateMoriPackage(legacy).valid).toBe(true);
  });

  it("rejects a non-array consolidatedMemories value", () => {
    const pkg = createMoriPackageFromSession(moriMockSession);
    const broken = { ...pkg, consolidatedMemories: "not-an-array" };
    const result = validateMoriPackage(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "consolidatedMemories")).toBe(true);
  });

  it("does not auto-merge: serialize fails closed on an invalid memory-bearing package", () => {
    const pkg = createMoriPackageFromSession(moriMockSession, {
      consolidatedMemories: [acceptedMemory()],
    });
    // A structurally invalid package must throw rather than silently ship.
    const invalid = { ...pkg, consolidatedMemories: 42 as unknown as [] };
    expect(() => serializeMoriPackage(invalid)).toThrow(/Invalid Mori package/);
  });
});
