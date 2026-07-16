import { describe, expect, it } from "vitest";
import type { KernelContext, KernelRelation, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import {
  buildExplorerGroups,
  dayGroupLabel,
  matchSegments,
  RECENT_GROUP_ID,
  recordSnippet,
  recordTypeFacets,
  timeOfDayLabel,
} from "./noteExplorerModel";

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
    const groups = buildExplorerGroups(records, contexts, relations, "date", "project");
    expect(groups.map((g) => g.name)).toEqual(["tcc-ng-gw", "mori", "기타"]);
    expect(groups[2].records.map((r) => r.id)).toEqual(["loose"]);
  });

  it("orders groups by newest activity, 기타 always last", () => {
    const records = [
      record("old", "2026-07-01", "old", ["ctx-b"]),
      record("new", "2026-07-20", "new", ["ctx-a"]),
      record("mid", "2026-07-10", "mid"),
    ];
    const groups = buildExplorerGroups(records, contexts, relations(), "date", "project");
    expect(groups.map((g) => g.name)).toEqual(["tcc-ng-gw", "mori", "기타"]);
  });

  it("sorts records within a group by date or title", () => {
    const records = [
      record("z", "2026-07-10", "z", ["ctx-a"]),
      record("a", "2026-07-14", "a", ["ctx-a"]),
    ];
    const byDate = buildExplorerGroups(records, contexts, relations(), "date", "project");
    expect(byDate[0].records.map((r) => r.id)).toEqual(["a", "z"]); // newest first
    const byTitle = buildExplorerGroups(records, contexts, relations(), "title", "project");
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

describe("day group mode (v3 default)", () => {
  const now = new Date("2026-07-16T10:00:00");

  it("groups records into 오늘/어제/dated days, newest day first", () => {
    const groups = buildExplorerGroups(
      [
        record("today", "2026-07-16"),
        record("yesterday", "2026-07-15"),
        record("older", "2026-07-14"),
        record("lastYear", "2025-12-03"),
      ],
      contexts,
      relations(),
      "date",
      "day",
      now,
    );
    expect(groups.map((g) => g.name)).toEqual([
      "오늘",
      "어제",
      "7월 14일 화요일",
      "2025년 12월 3일 수요일",
    ]);
    expect(groups[0].records.map((r) => r.id)).toEqual(["today"]);
  });

  it("is the default group mode", () => {
    const groups = buildExplorerGroups(
      [record("a", "2026-07-16", "a", ["ctx-a"])],
      contexts,
      relations(),
      "date",
      undefined,
      now,
    );
    expect(groups[0].id).toBe("day:2026-07-16");
  });

  it("labels 오늘/어제 relative to now", () => {
    expect(dayGroupLabel("2026-07-16", now)).toBe("오늘");
    expect(dayGroupLabel("2026-07-15", now)).toBe("어제");
  });
});

describe("recordSnippet · row preview", () => {
  it("returns the first body line that adds something beyond the title", () => {
    const r = { ...record("a", "2026-07-16", "gRPC 라우팅 재정비") };
    r.body = "gRPC 라우팅 재정비\n헬스체크는 다음에 추가하기로 했다.";
    expect(recordSnippet(r)).toBe("헬스체크는 다음에 추가하기로 했다.");
  });

  it("returns empty when the body only repeats the title", () => {
    const r = { ...record("a", "2026-07-16", "오늘 러닝 30분 했다") };
    r.body = "오늘 러닝 30분 했다";
    expect(recordSnippet(r)).toBe("");
  });

  it("clips long lines", () => {
    const r = { ...record("a", "2026-07-16", "제목") };
    r.body = "가".repeat(140);
    expect(recordSnippet(r).length).toBeLessThanOrEqual(97);
    expect(recordSnippet(r).endsWith("…")).toBe(true);
  });

  it("strips inline markdown so the row reads as prose", () => {
    const r = { ...record("a", "2026-07-16", "주간 회고 노트") };
    r.body = "주간 회고 노트\n오늘 러닝 30분 했다. **다음 주**에 [문서](http://x)를 봤다.";
    expect(recordSnippet(r)).toBe("오늘 러닝 30분 했다. 다음 주에 문서를 봤다.");
  });

  it("surfaces the body line that holds the query when searching", () => {
    const r = { ...record("a", "2026-07-16", "회의 노트") };
    r.body = "회의 노트\n첫 줄은 무관하다\n결정: 배포는 금요일에 한다";
    expect(recordSnippet(r)).toBe("첫 줄은 무관하다");
    expect(recordSnippet(r, "배포")).toBe("결정: 배포는 금요일에 한다");
  });
});

describe("matchSegments · search highlighting", () => {
  it("returns one non-hit segment when the query is empty or absent", () => {
    expect(matchSegments("배포 일정", "")).toEqual([{ text: "배포 일정", hit: false }]);
    expect(matchSegments("배포 일정", "회의")).toEqual([{ text: "배포 일정", hit: false }]);
  });

  it("splits around every case-insensitive occurrence", () => {
    expect(matchSegments("Deploy the deploy", "deploy")).toEqual([
      { text: "Deploy", hit: true },
      { text: " the ", hit: false },
      { text: "deploy", hit: true },
    ]);
  });

  it("keeps the original casing of matched text", () => {
    expect(matchSegments("배포는 금요일", "배포")).toEqual([
      { text: "배포", hit: true },
      { text: "는 금요일", hit: false },
    ]);
  });
});

describe("timeOfDayLabel", () => {
  it("formats HH:mm and stays empty for date-only values", () => {
    expect(timeOfDayLabel("2026-07-16T14:05:00")).toBe("14:05");
    expect(timeOfDayLabel("2026-07-16")).toBe("");
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
