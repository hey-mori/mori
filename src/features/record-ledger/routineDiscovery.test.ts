import { describe, expect, it } from "vitest";
import type {
  KernelContext,
  KernelEntity,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import { discoverRoutines, routineEntityIds } from "./routineDiscovery";

function record(id: string): MoriRecord {
  return {
    id,
    schemaId: "workout",
    title: id,
    body: "",
    capturedAt: "2026-07-14T09:00:00Z",
    timeBasis: "unknown",
    status: "active",
    origin: "derived",
    ownership: "db",
    contextIds: [],
    properties: {},
    createdAt: "2026-07-14T09:00:00Z",
    updatedAt: "2026-07-14T09:00:00Z",
  };
}

const running: KernelEntity = { id: "ent-run", type: "exercise", canonicalName: "러닝", createdAt: "x" };
const plank: KernelEntity = { id: "ent-plank", type: "exercise", canonicalName: "플랭크", createdAt: "x" };

function ref(recordId: string, entityId: string): KernelRelation {
  return { id: `rel-${recordId}`, fromRecordId: recordId, type: "references", toEntityId: entityId, createdAt: "x" };
}

function belongs(recordId: string, contextId: string): KernelRelation {
  return { id: `bel-${recordId}`, fromRecordId: recordId, type: "belongs-to", toContextId: contextId, createdAt: "x" };
}

describe("discoverRoutines", () => {
  it("suggests a routine for an entity that recurs at least the threshold", () => {
    const suggestions = discoverRoutines(
      [record("a"), record("b"), record("c")],
      [ref("a", "ent-run"), ref("b", "ent-run"), ref("c", "ent-run")],
      [running],
      [],
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].entity.canonicalName).toBe("러닝");
    expect(suggestions[0].count).toBe(3);
  });

  it("does not suggest below the threshold", () => {
    const suggestions = discoverRoutines(
      [record("a"), record("b")],
      [ref("a", "ent-run"), ref("b", "ent-run")],
      [running],
      [],
    );
    expect(suggestions).toEqual([]);
  });

  it("suppresses a suggestion once a routine context exists", () => {
    const context: KernelContext = { id: "ctx-routine", type: "routine", name: "러닝", createdAt: "x" };
    const suggestions = discoverRoutines(
      [record("a"), record("b"), record("c")],
      [ref("a", "ent-run"), ref("b", "ent-run"), ref("c", "ent-run"), belongs("a", "ctx-routine")],
      [running],
      [context],
    );
    expect(suggestions).toEqual([]);
  });

  it("ranks by recurrence count", () => {
    const suggestions = discoverRoutines(
      [record("a"), record("b"), record("c"), record("d"), record("e"), record("f"), record("g")],
      [
        ref("a", "ent-run"), ref("b", "ent-run"), ref("c", "ent-run"), ref("d", "ent-run"),
        ref("e", "ent-plank"), ref("f", "ent-plank"), ref("g", "ent-plank"),
      ],
      [running, plank],
      [],
    );
    expect(suggestions.map((s) => s.entity.canonicalName)).toEqual(["러닝", "플랭크"]);
  });
});

describe("routineEntityIds", () => {
  it("marks entities whose records belong to a routine context", () => {
    const context: KernelContext = { id: "ctx-routine", type: "routine", name: "러닝", createdAt: "x" };
    const ids = routineEntityIds(
      [record("a"), record("b")],
      [ref("a", "ent-run"), ref("b", "ent-run"), belongs("a", "ctx-routine")],
      [context],
    );
    expect(ids.has("ent-run")).toBe(true);
    expect(ids.size).toBe(1);
  });
});
