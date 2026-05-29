import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import { unzipSync, zipSync } from "fflate";
import {
  buildClientSafeMoriPackage,
  buildMoriPackageFileLayout,
  createMoriPackageFromSession,
  deserializeMoriPackage,
  getPackageAuditTrail,
  getPackageConsolidatedMemories,
  getPackageIsClientSafe,
  MORI_PACKAGE_FILE_NAMES,
  parseMoriPackageFileLayout,
  serializeEventsJsonl,
  serializeMoriPackage,
  unzipMoriPackage,
  validateMoriPackage,
  zipMoriPackage,
} from "./index";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../storage/storageTypes";

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

function reviewAction(
  overrides: Partial<StoredMemoryReviewAction> = {},
): StoredMemoryReviewAction {
  return {
    id: "act-1",
    projectId: "p-1",
    actionType: "accept",
    actor: "local-user",
    timestamp: "2026-05-12T10:00:00Z",
    sourceProposalId: "prop-1",
    targetMemoryIds: ["mem-1"],
    note: "Accepted from consolidation review.",
    reversible: false,
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe(".mori package v0", () => {
  it("creates a valid package from a Mori session", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const validation = validateMoriPackage(pkg);

    expect(validation.valid).toBe(true);
    expect(pkg.manifest.formatVersion).toBe("0.1.0");
    expect(pkg.sessions[0]?.id).toBe(mockSession.session.id);
  });

  it("round-trips through JSON serialization", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const serialized = serializeMoriPackage(pkg);
    const deserialized = deserializeMoriPackage(serialized);

    expect(deserialized.manifest.packageId).toBe(pkg.manifest.packageId);
    expect(deserialized.events.length).toBe(pkg.events.length);
  });

  it("can expose events as JSONL for the future zip-like package", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const jsonl = serializeEventsJsonl(pkg);

    expect(jsonl.split("\n").length).toBe(pkg.events.length);
    expect(jsonl).toContain("evt-positioning");
  });
});

describe(".mori package v0 — accepted memory slice", () => {
  it("defaults consolidatedMemories to an empty array", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    expect(pkg.consolidatedMemories).toEqual([]);
    expect(validateMoriPackage(pkg).valid).toBe(true);
  });

  it("carries accepted memories and round-trips them through JSON", () => {
    const memories = [
      acceptedMemory({ id: "mem-a" }),
      acceptedMemory({ id: "mem-b", title: "Adopt SQLite for desktop persistence" }),
    ];
    const pkg = createMoriPackageFromSession(mockSession, {
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
    const pkg = createMoriPackageFromSession(mockSession);
    // Simulate an older package: drop the field entirely.
    const legacy = { ...pkg };
    delete (legacy as { consolidatedMemories?: unknown }).consolidatedMemories;

    const restored = deserializeMoriPackage(JSON.stringify(legacy));
    expect(restored.consolidatedMemories).toBeUndefined();
    expect(getPackageConsolidatedMemories(restored)).toEqual([]);
    expect(validateMoriPackage(legacy).valid).toBe(true);
  });

  it("rejects a non-array consolidatedMemories value", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const broken = { ...pkg, consolidatedMemories: "not-an-array" };
    const result = validateMoriPackage(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "consolidatedMemories")).toBe(true);
  });

  it("does not auto-merge: serialize fails closed on an invalid memory-bearing package", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [acceptedMemory()],
    });
    // A structurally invalid package must throw rather than silently ship.
    const invalid = { ...pkg, consolidatedMemories: 42 as unknown as [] };
    expect(() => serializeMoriPackage(invalid)).toThrow(/Invalid Mori package/);
  });
});

describe(".mori package v0 — audit trail slice", () => {
  it("defaults auditTrail to an empty array", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    expect(pkg.auditTrail).toEqual([]);
    expect(validateMoriPackage(pkg).valid).toBe(true);
  });

  it("carries review actions and round-trips them through JSON", () => {
    const actions = [
      reviewAction({ id: "act-a", actionType: "accept" }),
      reviewAction({ id: "act-b", actionType: "apply", targetMemoryIds: ["mem-b"] }),
    ];
    const pkg = createMoriPackageFromSession(mockSession, {
      auditTrail: actions,
    });
    expect(pkg.auditTrail).toHaveLength(2);

    const restored = deserializeMoriPackage(serializeMoriPackage(pkg));
    expect(getPackageAuditTrail(restored)).toHaveLength(2);
    expect(getPackageAuditTrail(restored)[0]?.id).toBe("act-a");
    expect(getPackageAuditTrail(restored)[1]?.actionType).toBe("apply");
  });

  it("treats a package exported before the field existed as empty", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const legacy = { ...pkg };
    delete (legacy as { auditTrail?: unknown }).auditTrail;

    const restored = deserializeMoriPackage(JSON.stringify(legacy));
    expect(restored.auditTrail).toBeUndefined();
    expect(getPackageAuditTrail(restored)).toEqual([]);
    expect(validateMoriPackage(legacy).valid).toBe(true);
  });

  it("rejects a non-array auditTrail value", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const broken = { ...pkg, auditTrail: "not-an-array" };
    const result = validateMoriPackage(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "auditTrail")).toBe(true);
  });
});

describe(".mori package v0 — per-record validation", () => {
  it("rejects a record missing its id with a precise path", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const broken = {
      ...pkg,
      events: pkg.events.map((event, index) =>
        index === 0 ? { ...event, id: "" } : event,
      ),
    };
    const result = validateMoriPackage(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "events[0].id")).toBe(true);
  });

  it("rejects an event missing its type", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const broken = {
      ...pkg,
      events: pkg.events.map((event, index) => {
        if (index !== 0) return event;
        const { type: _type, ...rest } = event;
        return rest;
      }),
    };
    const result = validateMoriPackage(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "events[0].type")).toBe(true);
  });

  it("rejects a non-object record in a slice", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const broken = { ...pkg, projects: [null as unknown as (typeof pkg.projects)[number]] };
    const result = validateMoriPackage(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "projects[0]")).toBe(true);
  });

  it("still validates a well-formed package clean", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [acceptedMemory()],
      auditTrail: [reviewAction()],
    });
    expect(validateMoriPackage(pkg)).toEqual({ valid: true, issues: [] });
  });
});

describe(".mori package v0 — zip-like file layout", () => {
  it("emits every documented file and each value parses", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const layout = buildMoriPackageFileLayout(pkg);

    expect(Object.keys(layout).sort()).toEqual([...MORI_PACKAGE_FILE_NAMES].sort());
    for (const name of MORI_PACKAGE_FILE_NAMES) {
      if (name.endsWith(".jsonl")) continue;
      expect(() => JSON.parse(layout[name])).not.toThrow();
    }
    expect(JSON.parse(layout["manifest.json"]).formatVersion).toBe("0.1.0");
  });

  it("round-trips events.jsonl through serializeEventsJsonl", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const layout = buildMoriPackageFileLayout(pkg);
    expect(layout["events.jsonl"]).toBe(serializeEventsJsonl(pkg));
    expect(layout["events.jsonl"].split("\n").length).toBe(pkg.events.length);
  });

  it("normalises the optional slices to an empty array when absent", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const legacy = { ...pkg };
    delete (legacy as { consolidatedMemories?: unknown }).consolidatedMemories;
    delete (legacy as { auditTrail?: unknown }).auditTrail;

    const layout = buildMoriPackageFileLayout(legacy as typeof pkg);
    expect(JSON.parse(layout["consolidated_memories.json"])).toEqual([]);
    expect(JSON.parse(layout["audit_trail.json"])).toEqual([]);
  });

  it("carries the optional slices when the package holds them", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [acceptedMemory({ id: "mem-x" })],
      auditTrail: [reviewAction({ id: "act-x" })],
    });
    const layout = buildMoriPackageFileLayout(pkg);
    expect(JSON.parse(layout["consolidated_memories.json"])[0].id).toBe("mem-x");
    expect(JSON.parse(layout["audit_trail.json"])[0].id).toBe("act-x");
  });

  it("round-trips a package through build / parse file layout", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [acceptedMemory({ id: "mem-x" })],
      auditTrail: [reviewAction({ id: "act-x" })],
    });
    const restored = parseMoriPackageFileLayout(buildMoriPackageFileLayout(pkg));

    expect(restored.manifest.packageId).toBe(pkg.manifest.packageId);
    expect(restored.events.length).toBe(pkg.events.length);
    expect(getPackageConsolidatedMemories(restored)[0]?.id).toBe("mem-x");
    expect(getPackageAuditTrail(restored)[0]?.id).toBe("act-x");
    expect(validateMoriPackage(restored).valid).toBe(true);
  });

  it("tolerates a trailing newline on events.jsonl", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const layout = buildMoriPackageFileLayout(pkg);
    const restored = parseMoriPackageFileLayout({
      ...layout,
      "events.jsonl": `${layout["events.jsonl"]}\n`,
    });
    expect(restored.events.length).toBe(pkg.events.length);
  });

  it("rejects a layout missing a required file", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const layout = buildMoriPackageFileLayout(pkg);
    const broken = { ...layout };
    delete (broken as Record<string, string>)["manifest.json"];
    expect(() => parseMoriPackageFileLayout(broken)).toThrow(/missing file/i);
  });
});

describe(".mori package v0 — real zip package", () => {
  it("round-trips a package through zip / unzip", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [acceptedMemory({ id: "mem-x" })],
      auditTrail: [reviewAction({ id: "act-x" })],
    });
    const bytes = zipMoriPackage(pkg);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const restored = unzipMoriPackage(bytes);
    expect(restored.manifest.packageId).toBe(pkg.manifest.packageId);
    expect(restored.events.length).toBe(pkg.events.length);
    expect(getPackageConsolidatedMemories(restored)[0]?.id).toBe("mem-x");
    expect(getPackageAuditTrail(restored)[0]?.id).toBe("act-x");
    expect(validateMoriPackage(restored).valid).toBe(true);
  });

  it("archives the canonical one-file-per-slice layout", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const unzipped = unzipSync(zipMoriPackage(pkg));
    expect(Object.keys(unzipped).sort()).toEqual([...MORI_PACKAGE_FILE_NAMES].sort());
  });

  it("rejects bytes that are not a zip archive", () => {
    expect(() => unzipMoriPackage(new Uint8Array([1, 2, 3, 4]))).toThrow(
      /Invalid Mori zip package/i,
    );
  });

  it("rejects a zip missing a required package file", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const layout = buildMoriPackageFileLayout(pkg);
    const entries: Record<string, Uint8Array> = {};
    for (const [name, content] of Object.entries(layout)) {
      if (name === "manifest.json") continue;
      entries[name] = new TextEncoder().encode(content);
    }
    expect(() => unzipMoriPackage(zipSync(entries))).toThrow(/missing file/i);
  });
});

describe(".mori package v0 — client-safe export filter", () => {
  it("keeps only clientSafe, non-sensitive memories", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [
        acceptedMemory({ id: "keep", reportEligibility: "clientSafe", sensitivity: "normal" }),
        acceptedMemory({ id: "drop-team", reportEligibility: "team", sensitivity: "normal" }),
        acceptedMemory({
          id: "drop-sensitive",
          reportEligibility: "clientSafe",
          sensitivity: "sensitive",
        }),
      ],
    });
    const safe = buildClientSafeMoriPackage(pkg);
    expect(getPackageConsolidatedMemories(safe).map((memory) => memory.id)).toEqual([
      "keep",
    ]);
  });

  it("keeps audit rows only for surviving memories", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [
        acceptedMemory({ id: "keep", reportEligibility: "clientSafe", sensitivity: "normal" }),
        acceptedMemory({ id: "drop", reportEligibility: "team", sensitivity: "normal" }),
      ],
      auditTrail: [
        reviewAction({ id: "act-keep", targetMemoryIds: ["keep"] }),
        reviewAction({ id: "act-drop", targetMemoryIds: ["drop"] }),
      ],
    });
    const safe = buildClientSafeMoriPackage(pkg);
    expect(getPackageAuditTrail(safe).map((row) => row.id)).toEqual(["act-keep"]);
  });

  it("marks the manifest client-safe and round-trips the marker", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    expect(getPackageIsClientSafe(pkg)).toBe(false);

    const safe = buildClientSafeMoriPackage(pkg);
    expect(getPackageIsClientSafe(safe)).toBe(true);
    expect(validateMoriPackage(safe).valid).toBe(true);

    const restored = deserializeMoriPackage(serializeMoriPackage(safe));
    expect(getPackageIsClientSafe(restored)).toBe(true);
  });

  it("does not mutate the input package", () => {
    const pkg = createMoriPackageFromSession(mockSession, {
      consolidatedMemories: [
        acceptedMemory({ id: "drop", reportEligibility: "team", sensitivity: "normal" }),
      ],
    });
    buildClientSafeMoriPackage(pkg);
    expect(getPackageConsolidatedMemories(pkg).map((memory) => memory.id)).toEqual([
      "drop",
    ]);
    expect(pkg.manifest.clientSafeExport).toBeUndefined();
  });

  it("rejects a non-boolean clientSafeExport marker", () => {
    const pkg = createMoriPackageFromSession(mockSession);
    const broken = {
      ...pkg,
      manifest: { ...pkg.manifest, clientSafeExport: "yes" as unknown as boolean },
    };
    const result = validateMoriPackage(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === "manifest.clientSafeExport")).toBe(
      true,
    );
  });
});
