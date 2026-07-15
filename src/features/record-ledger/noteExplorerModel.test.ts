import { describe, expect, it } from "vitest";
import type { KernelContext, KernelRelation, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { buildExplorerGroups, RECENT_GROUP_ID, recordTypeFacets } from "./noteExplorerModel";

function record(id: string, occurredStart: string, title = id, contextIds: string[] = []): MoriRecord {
  return {
    id,
    schemaId: "note",
    title,
    body: "",
    occurredStart,
    capturedAt: `${occurredStart}T09:00:00`,
    timeBasis: "user-provided",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds,
    properties: {},
    createdAt: `${occurredStart}T09:00:00`,
    updatedAt: `${occurredStart}T09:00:00`,
  };
}

const contexts: KernelContext[] = [
  { id: "ctx-a", type: "project", name: "tcc-ng-gw", createdAt: "2026-07-01T00:00:00" },
  { id: "ctx-b", type: "project", name: "mori", createdAt: "2026-07-01T00:00:00" },
];

describe("buildExplorerGroups", () => {
  it("groups by context via contextIds and belongs-to, with 기타 for the rest", () => {
    const records = [
      record("a1", "2026-07-14", "a1", ["ctx-a"]),
      record("b1", "2026-07-10", "b1"),
      record("loose", "2026-07-12", "loose"),
    ];
    const relations: KernelRelation[] = [
      { id: "r1", fromRecordId: "b1", type: "belongs-to", toContextId: "ctx-b", createdAt: "2026-07-10" },
    ];
    const groups = buildExplorerGroups(records, contexts, relations, "date");
    expect(groups.map((g) => g.name)).toEqual(["tcc-ng-gw", "mori", "기타"]);
    expect(groups[2].records.map((r) => r.id)).toEqual(["loose"]);
  });

  it("orders groups by newest activity, 기타 always last", () => {
    const records = [
      record("old", "2026-07-01", "old", ["ctx-b"]),
      record("new", "2026-07-20", "new", ["ctx-a"]),
      record("mid", "2026-07-10", "mid"),
    ];
    const groups = buildExplorerGroups(records, contexts, relations(), "date");
    expect(groups.map((g) => g.name)).toEqual(["tcc-ng-gw", "mori", "기타"]);
  });

  it("sorts records within a group by date or title", () => {
    const records = [
      record("z", "2026-07-10", "z", ["ctx-a"]),
      record("a", "2026-07-14", "a", ["ctx-a"]),
    ];
    const byDate = buildExplorerGroups(records, contexts, relations(), "date");
    expect(byDate[0].records.map((r) => r.id)).toEqual(["a", "z"]); // newest first
    const byTitle = buildExplorerGroups(records, contexts, relations(), "title");
    expect(byTitle[0].records.map((r) => r.id)).toEqual(["a", "z"]); // a < z
  });
});

function relations(): KernelRelation[] {
  return [];
}

const registry = createSchemaRegistry();

function typed(id: string, schemaId: string, day: string): MoriRecord {
  return { ...record(id, day), schemaId };
}

describe("recent group mode", () => {
  it("returns one flat list newest-first, no project headers", () => {
    const groups = buildExplorerGroups(
      [record("a", "2026-07-10", "a", ["ctx-a"]), record("b", "2026-07-14", "b")],
      contexts,
      relations(),
      "date",
      "recent",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(RECENT_GROUP_ID);
    expect(groups[0].records.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("recordTypeFacets", () => {
  it("lists the types present, most common first, with labels", () => {
    const facets = recordTypeFacets(
      [
        typed("a", "note", "2026-07-14"),
        typed("b", "note", "2026-07-13"),
        typed("c", "workout", "2026-07-12"),
      ],
      registry,
    );
    expect(facets[0]).toMatchObject({ schemaId: "note", count: 2 });
    expect(facets.find((f) => f.schemaId === "workout")).toMatchObject({ name: "운동", count: 1 });
  });
});
