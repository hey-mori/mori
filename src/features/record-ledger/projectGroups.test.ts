import { describe, expect, it } from "vitest";
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { buildProjectGroups } from "./projectGroups";

function session(overrides: Partial<StoredSessionSummary> & { sessionId: string }): StoredSessionSummary {
  return {
    projectId: "p",
    title: overrides.sessionId,
    projectName: "proj",
    savedAt: "2026-07-14T09:00:00.000Z",
    status: "complete",
    ...overrides,
  };
}

function record(id: string, contextIds: string[] = []): MoriRecord {
  return {
    id,
    schemaId: "note",
    title: id,
    body: "",
    capturedAt: "2026-07-14T09:00:00Z",
    timeBasis: "unknown",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds,
    properties: {},
    createdAt: "2026-07-14T09:00:00Z",
    updatedAt: "2026-07-14T09:00:00Z",
  };
}

const moriCtx: KernelContext = { id: "ctx-mori", type: "project", name: "mori", createdAt: "x" };

describe("buildProjectGroups", () => {
  it("groups sessions by their source label's leaf", () => {
    const groups = buildProjectGroups(
      [
        session({ sessionId: "s1", sourceLabel: "C:/dev/mori" }),
        session({ sessionId: "s2", sourceLabel: "C:/dev/mori" }),
        session({ sessionId: "s3", sourceLabel: "C:/dev/tcc-ng-gw" }),
      ],
      [],
      [],
      [],
    );
    expect(groups.map((g) => g.name).sort()).toEqual(["mori", "tcc-ng-gw"]);
    const mori = groups.find((g) => g.name === "mori");
    expect(mori?.sessions).toHaveLength(2);
  });

  it("merges a kernel context and its sessions into one project group", () => {
    const groups = buildProjectGroups(
      [session({ sessionId: "s1", sourceLabel: "C:/dev/mori" })],
      [moriCtx],
      [record("r1", ["ctx-mori"])],
      [],
    );
    // One "mori" group, carrying both the session and the record.
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("mori");
    expect(groups[0].sessions).toHaveLength(1);
    expect(groups[0].records).toHaveLength(1);
    expect(groups[0].context?.id).toBe("ctx-mori");
  });

  it("skips sessions with no source label", () => {
    const groups = buildProjectGroups([session({ sessionId: "s1" })], [], [], []);
    expect(groups).toHaveLength(0);
  });

  it("sorts busiest project first", () => {
    const groups = buildProjectGroups(
      [
        session({ sessionId: "s1", sourceLabel: "C:/dev/quiet" }),
        session({ sessionId: "s2", sourceLabel: "C:/dev/busy" }),
        session({ sessionId: "s3", sourceLabel: "C:/dev/busy" }),
      ],
      [],
      [],
      [],
    );
    expect(groups[0].name).toBe("busy");
  });
});
