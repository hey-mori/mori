import { describe, expect, it } from "vitest";
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import {
  contextTypeLabel,
  groupRecordsByContext,
  groupRecordsBySection,
  sectionForSchema,
} from "./contextGrouping";

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

function recordOf(id: string, schemaId: string): MoriRecord {
  return { ...record(id), schemaId };
}

describe("sectionForSchema", () => {
  it("maps schema families to sections and unlisted schemas to 기타", () => {
    expect(sectionForSchema("agent-session")).toBe("session");
    expect(sectionForSchema("decision")).toBe("decision");
    expect(sectionForSchema("insight")).toBe("decision");
    expect(sectionForSchema("note")).toBe("note");
    expect(sectionForSchema("activity")).toBe("activity");
    expect(sectionForSchema("something-new")).toBe("other");
  });
});

describe("groupRecordsBySection", () => {
  it("splits records into labeled sections in a fixed order, dropping empties", () => {
    const sections = groupRecordsBySection([
      recordOf("n1", "note"),
      recordOf("s1", "agent-session"),
      recordOf("d1", "decision"),
      recordOf("n2", "knowledge"),
      recordOf("x1", "something-new"),
    ]);
    // Fixed order: 세션 · 결정 · 노트 · 활동 · 기타 (활동 absent here).
    expect(sections.map((s) => s.id)).toEqual(["session", "decision", "note", "other"]);
    expect(sections.map((s) => s.label)).toEqual(["세션", "결정", "노트", "기타"]);
    expect(sections.find((s) => s.id === "note")?.records.map((r) => r.id)).toEqual(["n1", "n2"]);
  });

  it("preserves input order within a section", () => {
    const sections = groupRecordsBySection([
      recordOf("s2", "agent-session"),
      recordOf("s1", "agent-session"),
    ]);
    expect(sections[0].records.map((r) => r.id)).toEqual(["s2", "s1"]);
  });
});

describe("contextTypeLabel", () => {
  it("labels context types in Korean", () => {
    expect(contextTypeLabel("project")).toBe("프로젝트");
    expect(contextTypeLabel("routine")).toBe("루틴");
    expect(contextTypeLabel("person")).toBe("사람");
  });
});
