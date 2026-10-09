import { describe, expect, it } from "vitest";
import type { KernelContext, MoriRecord } from "../record-kernel/kernelTypes";
import type { ClaudeCodeSearchBatch, ClaudeCodeSearchHit } from "../claude/types";
import {
  applySourceBatch,
  applySourceError,
  buildProjectSearchInventory,
  canContinue,
  markSearching,
  pickSources,
  PROJECT_SEARCH_MAX_HITS,
  projectSearchCoverage,
  projectSearchStatusLine,
  restrictToMembers,
  startedProjectSearch,
  type ProjectSearchInventory,
  type SourceDescriptor,
} from "./projectSearch";

const ctx = (id: string, name: string, extra: Partial<KernelContext> = {}): KernelContext => ({
  id,
  type: "project",
  name,
  createdAt: "2026-10-08T00:00:00Z",
  ...extra,
});
const work = ctx("ctx-work", "회사");
const personal = ctx("ctx-personal", "개인");
const infra = ctx("ctx-infra", "infra", { parentId: "ctx-work" });
const otherInfra = ctx("ctx-infra-2", "infra", { parentId: "ctx-personal" });
const storage = ctx("ctx-storage", "storage", { parentId: "ctx-infra" });
const oldChild = ctx("ctx-old", "old", { parentId: "ctx-infra", archived: true });
const archived = ctx("ctx-archived", "archived", { archived: true });
const topic: KernelContext = { id: "ctx-topic", type: "topic", name: "infra", createdAt: "x" };
const contexts = [work, personal, infra, otherInfra, storage, oldChild, archived, topic];

function rec(id: string, overrides: Partial<MoriRecord> = {}): MoriRecord {
  return {
    id,
    schemaId: "agent-session",
    title: `세션 ${id}`,
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

const claude = (path: string): SourceDescriptor => ({ agentName: "Claude Code", importKind: "claude-code", sourcePath: path });

function inventory(records: MoriRecord[], projectId = "ctx-infra", descriptors: Record<string, SourceDescriptor | null> = {}) {
  return buildProjectSearchInventory({
    projectId,
    contexts,
    records,
    descriptorOf: (id) => (id in descriptors ? descriptors[id]! : claude(`/c/${id}.jsonl`)),
  });
}

const ids = (result: ProjectSearchInventory) => (result.kind === "ok" ? result.entries.map((entry) => entry.sessionId) : null);

describe("which sessions a project search reads", () => {
  it("reads confirmed members only", () => {
    const records = [
      rec("confirmed", { contextIds: ["ctx-infra"] }),
      rec("unfiled"),
      // A suggestion lives in the page's projection, never in contextIds.
      rec("suggested", { properties: { agentId: "claude" } }),
      rec("rejected", { properties: { agentId: "claude", projectReview: { rejected: ["ctx-infra"] } } }),
      // Matched only by its folder or repository: nothing durable names the project.
      rec("same-folder", { title: "infra" }),
      rec("other-infra", { contextIds: ["ctx-infra-2"] }),
      rec("missing-project", { contextIds: ["ctx-gone"] }),
      rec("topic-only", { contextIds: ["ctx-topic"] }),
      rec("discarded", { contextIds: ["ctx-infra"], status: "discarded" }),
      rec("archived-record", { contextIds: ["ctx-infra"], status: "archived" }),
    ];
    expect(ids(inventory(records))).toEqual(["confirmed"]);
  });

  it("a belongs-to relation never makes a session searchable (relations are not an input)", () => {
    // `recordProject` accepts belongs-to relations; the search inventory does
    // not take relations at all, so an automatically written relation cannot
    // widen it.
    expect(ids(inventory([rec("related")]))).toEqual([]);
  });

  it("rolls up confirmed members of active descendants, never archived ones or another tree", () => {
    const records = [
      rec("child", { contextIds: ["ctx-storage"] }),
      rec("archived-child", { contextIds: ["ctx-old"] }),
      rec("cousin", { contextIds: ["ctx-infra-2"] }),
    ];
    const result = inventory(records);
    expect(ids(result)).toEqual(["child"]);
    expect(result.kind === "ok" && result.descendants).toBe(1);
    expect(ids(inventory(records, "ctx-work"))).toEqual(["child"]);
  });

  it("an archived or missing project is not searched, and nothing similar is searched instead", () => {
    const records = [rec("a", { contextIds: ["ctx-archived"] }), rec("b", { contextIds: ["ctx-infra"] })];
    expect(inventory(records, "ctx-archived")).toEqual({ kind: "unavailable" });
    expect(inventory(records, "ctx-gone")).toEqual({ kind: "unavailable" });
    expect(inventory(records, "ctx-topic")).toEqual({ kind: "unavailable" });
  });

  it("a project with no confirmed member searches nothing", () => {
    const result = inventory([rec("candidate", { title: "infra work" })]);
    expect(result).toMatchObject({ kind: "ok", entries: [] });
    if (result.kind !== "ok") throw new Error();
    expect(projectSearchStatusLine(startedProjectSearch(result, "x"))).toBe("이 프로젝트에 확정된 세션이 없습니다");
  });

  it("keeps same-titled sessions apart and reads one shared source once", () => {
    const records = [
      rec("stub", { title: "Observability 수렴", contextIds: ["ctx-infra"], occurredStart: "2026-09-09T04:01:00Z" }),
      rec("long", { title: "Observability 수렴", contextIds: ["ctx-infra"], occurredStart: "2026-10-09T03:00:00Z" }),
      rec("twin", { contextIds: ["ctx-infra"], occurredStart: "2026-10-01T00:00:00Z" }),
    ];
    const result = inventory(records, "ctx-infra", {
      stub: claude("/c/stub.jsonl"),
      long: claude("/c/long.jsonl"),
      twin: claude("/c/long.jsonl"),
    });
    if (result.kind !== "ok") throw new Error();
    expect(result.entries.map((entry) => [entry.sessionId, entry.sameSourceAs ?? null])).toEqual([
      ["long", null],
      ["twin", "long"],
      ["stub", null],
    ]);
    const state = startedProjectSearch(result, "q");
    expect(state.order).toEqual(["long", "stub"]);
  });

  it("names how each confirmed session can be read, and never widens a missing descriptor", () => {
    const records = ["a", "b", "c"].map((id) => rec(id, { contextIds: ["ctx-infra"] }));
    const result = inventory(records, "ctx-infra", {
      a: claude("/c/a.jsonl"),
      b: { agentName: "Codex", importKind: "codex-session", sourcePath: "/x/b.jsonl" },
      c: null,
    });
    if (result.kind !== "ok") throw new Error();
    expect(Object.fromEntries(result.entries.map((entry) => [entry.sessionId, entry.kind]))).toEqual({
      a: "searchable",
      b: "unsupported",
      c: "no-source",
    });
    expect(startedProjectSearch(result, "q").order).toEqual(["a"]);
  });

  it("keeps the project by id when it is renamed", () => {
    const renamed = contexts.map((context) => (context.id === "ctx-infra" ? { ...context, name: "인프라" } : context));
    const result = buildProjectSearchInventory({
      projectId: "ctx-infra",
      contexts: renamed,
      records: [rec("a", { contextIds: ["ctx-infra"] })],
      descriptorOf: (id) => claude(`/c/${id}.jsonl`),
    });
    expect(result).toMatchObject({ kind: "ok", projectId: "ctx-infra", label: "인프라" });
  });
});

const hit = (id: string, start: number): ClaudeCodeSearchHit => ({
  messageId: id,
  role: "assistant",
  subkind: "",
  createdAt: "",
  recordStart: start,
  recordEnd: start + 10,
  recordAnchor: `a${start}`,
  snippetBefore: "",
  snippetMatch: "needle",
  snippetAfter: "",
  matchesInMessage: 1,
});

const batch = (scanEnd: number, scanStart: number, hits: ClaudeCodeSearchHit[] = [], sourceId = "s"): ClaudeCodeSearchBatch => ({
  sourceId,
  fileBytes: 1000,
  scanEnd,
  scanStart,
  scanStartAnchor: `a${scanStart}`,
  reachedStart: scanStart === 0,
  hits,
  hitLimit: false,
  searchedRecords: 1,
  unsearchableRecords: 0,
  unsearchableBytes: 0,
});

function state(n = 3) {
  const records = Array.from({ length: n }, (_, index) =>
    rec(`s${index}`, { contextIds: ["ctx-infra"], occurredStart: `2026-10-0${9 - index}T00:00:00Z` }),
  );
  const result = inventory(records);
  if (result.kind !== "ok") throw new Error();
  return startedProjectSearch(result, "needle");
}

describe("project search bookkeeping", () => {
  it("steps every unfinished source before any gets a second step", () => {
    let s = state(3);
    const first = pickSources(s, new Set(), 2);
    expect(first.picked).toEqual(["s0", "s1"]);
    s = markSearching(s, first.picked, first.next);
    s = applySourceBatch(s, "s0", batch(1000, 500));
    const second = pickSources(s, new Set(["s1"]), 2);
    // s2 has had no step yet; it comes before s0's second step.
    expect(second.picked).toEqual(["s2", "s0"]);
  });

  it("ignores a stale or foreign step and marks a source done only at its start", () => {
    let s = markSearching(state(1), ["s0"], 0);
    s = applySourceBatch(s, "s0", batch(1000, 600, [hit("m9", 900)]));
    s = markSearching(s, ["s0"], 0);
    expect(applySourceBatch(s, "s0", batch(1000, 600))).toBe(s);
    expect(applySourceBatch(s, "s0", batch(600, 0, [], "other-file"))).toBe(s);
    s = applySourceBatch(s, "s0", batch(600, 0, [hit("m1", 100)]));
    expect(s.sources.s0!.status).toBe("done");
    expect(s.sources.s0!.hits.map((entry) => entry.messageId)).toEqual(["m9", "m1"]);
    expect(canContinue(s)).toBe(false);
  });

  it("bounds the results held across all sources", () => {
    let s = markSearching(state(2), ["s0", "s1"], 0);
    const many = (prefix: string) => Array.from({ length: 150 }, (_, index) => hit(`${prefix}${index}`, index * 20));
    s = applySourceBatch(s, "s0", batch(1000, 500, many("a")));
    s = applySourceBatch(s, "s1", batch(1000, 500, many("b")));
    expect(projectSearchCoverage(s).hits).toBe(PROJECT_SEARCH_MAX_HITS);
    expect(canContinue(s)).toBe(false);
  });

  it("never calls an incomplete search empty for the project", () => {
    const records = ["a", "b"].map((id) => rec(id, { contextIds: ["ctx-infra"] }));
    const mixed = inventory(records, "ctx-infra", { a: claude("/c/a.jsonl"), b: { agentName: "Codex", importKind: "codex-session", sourcePath: "/x" } });
    if (mixed.kind !== "ok") throw new Error();
    let s = markSearching(startedProjectSearch(mixed, "q"), ["a"], 0);
    s = { ...applySourceBatch(s, "a", batch(1000, 0)), status: "idle" };
    // Every searchable source is done, but one confirmed session is another agent's.
    expect(projectSearchStatusLine(s)).toContain("찾은 대화에서는 없었습니다");
    expect(projectSearchStatusLine(s)).not.toContain("전체에서 찾지 못했습니다");
    let partial = markSearching(state(2), ["s0"], 1);
    partial = { ...applySourceBatch(partial, "s0", batch(1000, 400)), status: "stopped" };
    expect(projectSearchStatusLine(partial)).toContain("아직 찾지 않은 부분이 있습니다");
    let whole = markSearching(state(1), ["s0"], 0);
    whole = { ...applySourceBatch(whole, "s0", batch(1000, 0)), status: "idle" };
    expect(projectSearchStatusLine(whole)).toContain("확정된 대화 전체에서 찾지 못했습니다");
  });

  it("counts a missing source and a session that left the project, and offers neither's results", () => {
    let s = markSearching(state(3), ["s0", "s1"], 2);
    s = applySourceBatch(s, "s0", batch(1000, 0, [hit("m1", 10)]));
    s = applySourceError(s, "s1", { kind: "missing", message: "SOURCE_MISSING" });
    s = restrictToMembers(s, new Set(["s1", "s2"]));
    const coverage = projectSearchCoverage(s);
    expect(coverage).toMatchObject({ unavailable: 1, excluded: 1, hits: 0, complete: false });
    expect(pickSources(s, new Set(), 2).picked).toEqual(["s2"]);
  });
});
