import { describe, expect, it } from "vitest";
import {
  buildProjectContinuationPack,
  CONTINUATION_SECTION_CAP,
  type ContinuationInput,
} from "./projectContinuation";
import type { MoriRecord, RecordStatus } from "../record-kernel/kernelTypes";

const NOW = new Date("2026-10-07T12:00:00.000Z");

function record(
  id: string,
  schemaId: string,
  overrides: Partial<MoriRecord> = {},
): MoriRecord {
  return {
    id,
    schemaId,
    title: `${schemaId} ${id}`,
    body: "",
    capturedAt: "2026-10-01T12:00:00.000Z",
    timeBasis: "capture-fallback",
    status: "active",
    origin: "user",
    ownership: "db",
    contextIds: ["ctx-mori"],
    properties: {},
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

function session(id: string, status: RecordStatus | null, overrides: Partial<MoriRecord> = {}) {
  const kernel =
    status === null
      ? null
      : record(id, "agent-session", {
          status,
          origin: "automation",
          occurredStart: "2026-10-05T12:00:00.000Z",
          timeBasis: "source-observed",
          properties: { agentId: "claude" },
          ...overrides,
        });
  return { kernel, summary: { id, title: kernel?.title ?? `세션 ${id}`, startedAt: "2026-10-05T12:00:00.000Z" } };
}

function input(parts: {
  sessions?: ReturnType<typeof session>[];
  records?: MoriRecord[];
}): ContinuationInput {
  const sessions = parts.sessions ?? [];
  const kernel = [
    ...(parts.records ?? []),
    ...sessions.flatMap((entry) => (entry.kernel ? [entry.kernel] : [])),
  ];
  return {
    project: { name: "mori", parentPath: "회사" },
    sessions: sessions.map((entry) => entry.summary),
    records: parts.records ?? [],
    kernelRecordsById: new Map(kernel.map((entry) => [entry.id, entry])),
    now: NOW,
  };
}

describe("buildProjectContinuationPack · inclusion", () => {
  it("includes only active records and counts the rest by reason", () => {
    const pack = buildProjectContinuationPack(
      input({
        records: [
          record("d1", "decision", { title: "SQLite를 기준 저장소로", body: "브라우저는 fallback" }),
          record("d2", "decision", { status: "provisional" }),
          record("d3", "decision", { status: "candidate" }),
          record("d4", "decision", { status: "discarded" }),
          record("d5", "decision", { status: "archived" }),
        ],
      }),
    );
    expect(pack.decisions.map((item) => item.ref)).toEqual(["mori:record/d1"]);
    expect(pack.decisions[0]?.line).toBe("브라우저는 fallback");
    expect(pack.excluded).toEqual({ unconfirmed: 2, removed: 2, secretLike: 0 });
  });

  it("needs an active kernel record for an auto-imported session but not for a hand-imported one", () => {
    const pack = buildProjectContinuationPack(
      input({
        sessions: [
          session("auto-claude-aaa", "active", { title: "인증 마이그레이션" }),
          session("auto-claude-bbb", "provisional"),
          session("auto-claude-ccc", null),
          session("auto-claude-ddd", "discarded"),
          session("manual-1", null),
        ],
      }),
    );
    expect(pack.sessions.map((item) => item.ref)).toEqual([
      "mori:session/auto-claude-aaa",
      "mori:session/manual-1",
    ]);
    expect(pack.sessions[0]).toMatchObject({ title: "인증 마이그레이션", agent: "Claude" });
    expect(pack.excluded).toEqual({ unconfirmed: 2, removed: 1, secretLike: 0 });
  });

  it("never hands off a demo session, even though the page shows demo sessions on an empty install", () => {
    const pack = buildProjectContinuationPack(input({ sessions: [session("demo-auth-migration", null)] }));
    expect(pack.sessions).toEqual([]);
    expect(pack.excluded).toEqual({ unconfirmed: 0, removed: 0, secretLike: 0 });
    expect(pack.markdown).not.toContain("demo-");
  });

  it("drops a secret-looking item whole and never masks part of it", () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const pack = buildProjectContinuationPack(
      input({
        records: [
          record("n1", "note", { title: "배포 메모", body: `키는 ${secret}` }),
          record("t1", "task", { title: `토큰 ${secret} 교체` }),
          record("n2", "note", { title: "평범한 메모" }),
        ],
      }),
    );
    expect(pack.notes.map((item) => item.ref)).toEqual(["mori:record/n2"]);
    expect(pack.openTasks).toEqual([]);
    expect(pack.excluded.secretLike).toBe(2);
    expect(pack.markdown).not.toContain(secret);
    expect(pack.markdown).not.toContain("배포 메모");
  });

  it("keeps note bodies out of the output and lists titles only", () => {
    const pack = buildProjectContinuationPack(
      input({ records: [record("n1", "note", { title: "회의 정리", body: "본문 문장은 나가지 않는다" })] }),
    );
    expect(pack.markdown).toContain("회의 정리");
    expect(pack.markdown).not.toContain("본문 문장은 나가지 않는다");
  });
});

describe("buildProjectContinuationPack · selection", () => {
  it("lists only tasks not marked done, with the due day", () => {
    const pack = buildProjectContinuationPack(
      input({
        records: [
          record("t1", "task", { title: "릴리스 노트", properties: { due: "2026-10-10" } }),
          record("t2", "task", { title: "끝난 일", properties: { done: true } }),
        ],
      }),
    );
    expect(pack.openTasks).toEqual([{ ref: "mori:record/t1", title: "릴리스 노트", day: "2026-10-10" }]);
  });

  it("windows sessions and notes to the last 30 days but keeps older decisions", () => {
    const old = "2026-07-01T12:00:00.000Z";
    const stale = session("auto-claude-old", "active", { occurredStart: old });
    stale.summary.startedAt = old;
    const pack = buildProjectContinuationPack(
      input({
        sessions: [stale],
        records: [
          record("n-old", "note", { updatedAt: old, createdAt: old }),
          record("d-old", "decision", { occurredStart: old, timeBasis: "user-provided" }),
        ],
      }),
    );
    expect(pack.sessions).toEqual([]);
    expect(pack.notes).toEqual([]);
    expect(pack.decisions.map((item) => item.ref)).toEqual(["mori:record/d-old"]);
    expect(pack.excluded).toEqual({ unconfirmed: 0, removed: 0, secretLike: 0 });
  });

  it("orders newest first and caps each section, counting the overflow", () => {
    const records = Array.from({ length: CONTINUATION_SECTION_CAP + 3 }, (_, index) =>
      record(`d${index}`, "decision", {
        occurredStart: `2026-09-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`,
        timeBasis: "user-provided",
      }),
    );
    const pack = buildProjectContinuationPack(input({ records }));
    expect(pack.decisions).toHaveLength(CONTINUATION_SECTION_CAP);
    expect(pack.decisions[0]?.ref).toBe(`mori:record/d${CONTINUATION_SECTION_CAP + 2}`);
    expect(pack.overflow).toBe(3);
  });

  it("adds a project-bound agent-session record the session list no longer carries, once", () => {
    const bound = record("auto-claude-zzz", "agent-session", {
      title: "목록에서 빠진 세션",
      occurredStart: "2026-10-06T12:00:00.000Z",
      timeBasis: "source-observed",
      origin: "automation",
    });
    const listed = session("auto-claude-aaa", "active");
    const pack = buildProjectContinuationPack({
      ...input({ sessions: [listed], records: [bound] }),
      records: [bound, listed.kernel as MoriRecord],
    });
    expect(pack.sessions.map((item) => item.ref)).toEqual([
      "mori:session/auto-claude-zzz",
      "mori:session/auto-claude-aaa",
    ]);
  });
});

describe("buildProjectContinuationPack · markdown", () => {
  it("renders sections, references, and exclusion counts without excluded content", () => {
    const pack = buildProjectContinuationPack(
      input({
        sessions: [session("auto-claude-aaa", "active", { title: "인증 마이그레이션" })],
        records: [
          record("d1", "decision", { title: "SQLite를 기준 저장소로", body: "## 브라우저는 **fallback**" }),
          record("d2", "decision", { title: "숨겨질 결정", status: "provisional" }),
          record("t1", "task", { title: "릴리스 노트" }),
        ],
      }),
    );
    expect(pack.markdown).toBe(
      [
        "# 프로젝트 이어가기 · 회사/mori",
        "",
        "2026-10-07 기준 · 세션과 노트는 최근 30일 · Mori 로컬 기록에서 생성",
        "",
        "## 최근 세션",
        "- 2026-10-05 · Claude · 인증 마이그레이션 (mori:session/auto-claude-aaa)",
        "",
        "## 결정",
        "- 2026-10-01 · SQLite를 기준 저장소로: 브라우저는 fallback (mori:record/d1)",
        "",
        "## 열린 할 일",
        "- 릴리스 노트 (mori:record/t1)",
        "",
        "제외됨: 확정되지 않은 항목 1개",
        "",
      ].join("\n"),
    );
    expect(pack.markdown).not.toContain("숨겨질 결정");
  });

  it("says so plainly when nothing confirmed remains", () => {
    const pack = buildProjectContinuationPack(
      input({ sessions: [session("auto-claude-bbb", "provisional")] }),
    );
    expect(pack.markdown).toContain("이 프로젝트에는 아직 이어갈 확정된 기록이 없습니다.");
    expect(pack.markdown).toContain("제외됨: 확정되지 않은 항목 1개");
  });
});
