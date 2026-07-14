import { describe, expect, it } from "vitest";
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import { contextTypeLabel, groupRecordsByContext } from "./contextGrouping";

function record(id: string, contextIds: string[] = [], capturedAt = "2026-07-14T09:00:00Z"): MoriRecord {
  return {
    id,
    schemaId: "note",
    title: id,
    body: "",
    capturedAt,
    timeBasis: "unknown",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds,
    properties: {},
    createdAt: capturedAt,
    updatedAt: capturedAt,
  };
}

const projectCtx: KernelContext = { id: "ctx-project-mori", type: "project", name: "mori", createdAt: "x" };
const routineCtx: KernelContext = { id: "ctx-run", type: "routine", name: "러닝", createdAt: "x" };
const emptyCtx: KernelContext = { id: "ctx-empty", type: "topic", name: "빈 주제", createdAt: "x" };

function belongs(recordId: string, contextId: string): KernelRelation {
  return { id: `bel-${recordId}`, fromRecordId: recordId, type: "belongs-to", toContextId: contextId, createdAt: "x" };
}

describe("groupRecordsByContext", () => {
  it("gathers records via both contextIds and belongs-to relations", () => {
    const groups = groupRecordsByContext(
      [projectCtx, routineCtx],
      [record("a", ["ctx-project-mori"]), record("b"), record("c")],
      [belongs("b", "ctx-project-mori"), belongs("c", "ctx-run")],
    );
    const project = groups.find((group) => group.context.id === "ctx-project-mori");
    expect(project?.records.map((r) => r.id).sort()).toEqual(["a", "b"]);
    const routine = groups.find((group) => group.context.id === "ctx-run");
    expect(routine?.records.map((r) => r.id)).toEqual(["c"]);
  });

  it("omits contexts with no records", () => {
    const groups = groupRecordsByContext([projectCtx, emptyCtx], [record("a", ["ctx-project-mori"])], []);
    expect(groups.map((group) => group.context.id)).toEqual(["ctx-project-mori"]);
  });

  it("does not double-count a record in both membership paths", () => {
    const groups = groupRecordsByContext(
      [projectCtx],
      [record("a", ["ctx-project-mori"])],
      [belongs("a", "ctx-project-mori")],
    );
    expect(groups[0].records).toHaveLength(1);
  });

  it("sorts contexts by record count", () => {
    const groups = groupRecordsByContext(
      [projectCtx, routineCtx],
      [record("a", ["ctx-project-mori"]), record("b", ["ctx-project-mori"]), record("c", ["ctx-run"])],
      [],
    );
    expect(groups.map((group) => group.context.id)).toEqual(["ctx-project-mori", "ctx-run"]);
  });
});

describe("contextTypeLabel", () => {
  it("labels context types in Korean", () => {
    expect(contextTypeLabel("project")).toBe("프로젝트");
    expect(contextTypeLabel("routine")).toBe("루틴");
    expect(contextTypeLabel("person")).toBe("사람");
  });
});
