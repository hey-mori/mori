import { describe, expect, it } from "vitest";
import type { KernelContext, KernelRelation, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { inProjectScope, projectLabel, recordProject, resolveProjectScope } from "./projectScope";
import { buildExplorerGroups } from "./noteExplorerModel";

const ctx = (id: string, name: string, extra: Partial<KernelContext> = {}): KernelContext => ({
  id,
  type: "project",
  name,
  createdAt: "2026-10-08T00:00:00Z",
  ...extra,
});
const work = ctx("ctx-work", "회사");
const personal = ctx("ctx-personal", "개인");
const infraWork = ctx("ctx-infra-w", "infra", { parentId: "ctx-work" });
const infraHome = ctx("ctx-infra-p", "infra", { parentId: "ctx-personal" });
const storage = ctx("ctx-storage", "storage", { parentId: "ctx-infra-w" });
const routine: KernelContext = { id: "ctx-routine", type: "routine", name: "아침", createdAt: "x" };
const topic: KernelContext = { id: "ctx-topic", type: "topic", name: "infra", createdAt: "x" };
const contexts = [work, personal, infraWork, infraHome, storage, routine, topic];

let n = 0;
function rec(overrides: Partial<MoriRecord> = {}): MoriRecord {
  n += 1;
  return {
    id: `r${n}`,
    schemaId: "agent-session",
    title: `세션 ${n}`,
    body: "",
    capturedAt: "2026-10-08T00:00:00Z",
    occurredStart: "2026-10-08T00:00:00Z",
    timeBasis: "source-observed",
    status: "active",
    origin: "automation",
    ownership: "db",
    contextIds: [],
    properties: { agentId: "claude" },
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

const scopeOf = (id: string) => {
  const scope = resolveProjectScope(id, contexts);
  if (scope.kind !== "ok") throw new Error("unavailable");
  return scope;
};
const members = (records: MoriRecord[], id: string, relations: KernelRelation[] = []) =>
  records.filter((record) => inProjectScope(record, scopeOf(id), contexts, relations)).map((record) => record.id);

describe("project scope · durable membership only", () => {
  it("holds confirmed sessions and leaves out suggested, rejected, and unfiled ones (A1-A4)", () => {
    const confirmed = rec({ id: "confirmed", contextIds: ["ctx-infra-w"] });
    const suggested = rec({ id: "suggested" });
    const rejected = rec({ id: "rejected", properties: { agentId: "claude", projectReview: { rejected: ["ctx-infra-w"] } } });
    const unfiled = rec({ id: "unfiled", contextIds: ["ctx-routine"], properties: { agentId: "claude", projectReview: { rejected: ["ctx-infra-w"] } } });
    expect(members([confirmed, suggested, rejected, unfiled], "ctx-infra-w")).toEqual(["confirmed"]);
  });

  it("follows a move and a refiling by id (A5, A6)", () => {
    const moved = rec({ id: "moved", contextIds: ["ctx-infra-p"] });
    const refiled = rec({ id: "refiled", contextIds: ["ctx-infra-w"] });
    expect(members([moved, refiled], "ctx-infra-w")).toEqual(["refiled"]);
    expect(members([moved, refiled], "ctx-infra-p")).toEqual(["moved"]);
  });

  it("never mixes two projects that share a name, and labels them by path (B1, B5)", () => {
    const a = rec({ id: "a", contextIds: ["ctx-infra-w"] });
    const b = rec({ id: "b", contextIds: ["ctx-infra-p"] });
    expect(members([a, b], "ctx-infra-w")).toEqual(["a"]);
    expect(projectLabel(infraWork, contexts)).toBe("회사/infra");
    expect(projectLabel(storage, contexts)).toBe("storage");
  });

  it("finds a record whose routine is listed before its project, and never takes a topic as the project (C1, C2)", () => {
    const record = rec({ id: "multi", schemaId: "note", contextIds: ["ctx-routine", "ctx-topic", "ctx-infra-w"] });
    expect(recordProject(record, contexts)?.id).toBe("ctx-infra-w");
    expect(recordProject(rec({ contextIds: ["ctx-topic"] }), contexts)).toBeNull();
    expect(members([record], "ctx-infra-w")).toEqual(["multi"]);
  });

  it("rolls a sub-project up into its parent, as the 프로젝트 page does (C3)", () => {
    const child = rec({ id: "child", contextIds: ["ctx-storage"] });
    expect(members([child], "ctx-infra-w")).toEqual(["child"]);
    expect(members([child], "ctx-storage")).toEqual(["child"]);
    expect(members([child], "ctx-infra-p")).toEqual([]);
  });

  it("reports an archived or missing project as unavailable instead of widening (C4, C5)", () => {
    expect(resolveProjectScope("ctx-gone", contexts)).toEqual({ kind: "unavailable" });
    const archived = [...contexts.filter((c) => c.id !== "ctx-work"), { ...work, archived: true }];
    expect(resolveProjectScope("ctx-infra-w", archived)).toEqual({ kind: "unavailable" });
    expect(resolveProjectScope("ctx-routine", contexts)).toEqual({ kind: "unavailable" });
    // A record still naming a missing project is in no project's scope, even a same-named one.
    const stale = rec({ id: "stale", contextIds: ["ctx-old-infra"] });
    expect(members([stale], "ctx-infra-w")).toEqual([]);
  });

  it("counts a belongs-to relation to a project, as the 프로젝트 page does", () => {
    const note = rec({ id: "note", schemaId: "note" });
    const relation: KernelRelation = { id: "rel", type: "belongs-to", fromRecordId: "note", toContextId: "ctx-infra-w", createdAt: "x" } as KernelRelation;
    expect(members([note], "ctx-infra-w", [relation])).toEqual(["note"]);
  });

  it("is complete over every loaded record, so many better matches elsewhere never hide the project's one (D1)", () => {
    const elsewhere = Array.from({ length: 30 }, () => rec({ title: "storage access storage access", contextIds: ["ctx-infra-p"] }));
    const target = rec({ id: "target", title: "회의", body: "storage access 조사", contextIds: ["ctx-infra-w"] });
    const text = "storage access";
    const found = [...elsewhere, target].filter(
      (record) =>
        inProjectScope(record, scopeOf("ctx-infra-w"), contexts) &&
        (record.title.toLowerCase().includes(text) || record.body.toLowerCase().includes(text)),
    );
    expect(found.map((record) => record.id)).toEqual(["target"]);
  });
});

describe("buildExplorerGroups · project lens", () => {
  it("groups a record under its project even when a routine is listed first (C1)", () => {
    const record = rec({ id: "g", schemaId: "note", contextIds: ["ctx-routine", "ctx-infra-w"] });
    const groups = buildExplorerGroups([record], contexts, [], "date", "project");
    expect(groups.map((group) => group.id)).toEqual(["ctx-infra-w"]);
  });

  it("still groups a record with only a routine under that routine", () => {
    const record = rec({ id: "h", schemaId: "note", contextIds: ["ctx-routine"] });
    expect(buildExplorerGroups([record], contexts, [], "date", "project").map((group) => group.id)).toEqual(["ctx-routine"]);
  });
});
