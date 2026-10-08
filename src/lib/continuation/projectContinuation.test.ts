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
        "## 근거 범위",
        "- 세션 1개: PR 근거 미기록 1개",
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

// Session outcome evidence v1. Shapes follow the NUC's real sessions, with
// invented names: a long session that linked PRs in two repositories, slash
// command sessions, scripted runs, and segments joined by `continued-in`.
function evidence(
  segment: string,
  parts: {
    prs?: Array<[string, number]>;
    branches?: string[];
    coverage?: "complete" | "partial";
    continuesIn?: string;
  } = {},
) {
  return {
    coverage: parts.coverage ?? "complete",
    segment,
    prs: (parts.prs ?? []).map(([repository, number], index) => ({
      repository,
      number,
      url: `https://github.com/${repository}/pull/${number}`,
      firstObservedAt: "2026-10-05T12:00:00.000Z",
      line: 10 + index,
    })),
    branches: (parts.branches ?? []).map((name, index) => ({
      name,
      basis: "record",
      firstObservedAt: "2026-10-05T12:00:00.000Z",
      lastObservedAt: "2026-10-06T12:00:00.000Z",
      line: 1 + index,
    })),
    repositories: [...new Set((parts.prs ?? []).map(([repository]) => repository))],
    ...(parts.continuesIn ? { continuesIn: parts.continuesIn } : {}),
  };
}

function evidenced(
  id: string,
  title: string,
  properties: Record<string, unknown>,
  overrides: Partial<MoriRecord> = {},
) {
  return session(id, "active", {
    title,
    properties: { agentId: "claude", activityClass: "conversation", interaction: "interactive", ...properties },
    ...overrides,
  });
}

describe("buildProjectContinuationPack · session outcome evidence", () => {
  it("lists the PRs a session's source linked, labelled as observations, and no branches", () => {
    const pack = buildProjectContinuationPack(
      input({
        sessions: [
          evidenced("auto-claude-long", "재개 점검", {
            sessionEvidence: evidence("seg-long", {
              prs: [["acme/app", 137], ["acme/app", 139], ["acme/home", 139]],
              branches: ["main", "fix/storage"],
            }),
          }, { occurredEnd: "2026-10-06T12:00:00.000Z" }),
        ],
      }),
    );
    expect(pack.sessions[0].evidence).toEqual({
      // Newest first: a capped list should keep where the work ended.
      prs: [
        { repository: "acme/home", number: 139 },
        { repository: "acme/app", number: 139 },
        { repository: "acme/app", number: 137 },
      ],
      coverage: "complete",
      segments: 1,
    });
    expect(pack.markdown).toContain("- 2026-10-05~2026-10-06 · Claude · 재개 점검 (mori:session/auto-claude-long)");
    expect(pack.markdown).toContain("  - 기록에 연결된 PR: acme/home #139 · acme/app #139 #137");
    // Branches seen in a shared working tree can be another session's: they
    // stay on the record and out of the handoff.
    expect(pack.markdown).not.toContain("fix/storage");
    expect(pack.markdown).not.toContain("브랜치");
    expect(pack.markdown).toContain("  - 근거 범위: 기록 전체 확인");
    expect(pack.markdown).toContain("병합됐는지는 확인하지 않았습니다");
    expect(pack.markdown).toContain("목록에 없는 PR이 이 세션과 무관하다는 뜻도 아닙니다");
    // The pack carries no URL, path, or transcript text: references only.
    expect(pack.markdown).not.toContain("https://");
  });

  it("says when a source was only partly read instead of implying the list is complete", () => {
    const pack = buildProjectContinuationPack(
      input({
        sessions: [
          evidenced("auto-claude-big", "큰 세션", { sessionEvidence: evidence("seg-big", { coverage: "partial" }) }),
          evidenced("auto-claude-small", "작은 세션", { sessionEvidence: evidence("seg-small") }),
          evidenced("auto-claude-old", "이전 기록", {}),
        ],
      }),
    );
    expect(pack.markdown).toContain("  - 연결된 PR: 아직 찾지 못함 (기록 일부만 확인 · 목록이 전부가 아닐 수 있음)");
    expect(pack.markdown).toContain("  - 연결된 PR: 기록에 연결된 PR 없음 (기록 전체 확인)");
    expect(pack.coverage).toMatchObject({ evidenceComplete: 1, evidencePartial: 1, evidenceMissing: 1 });
    expect(pack.markdown).toContain("- 세션 3개: PR 근거 전체 확인 1개 · 일부만 확인 1개 · PR 근거 미기록 1개");
  });

  it("caps each repository to its newest PRs so a multi-repository session shows both", () => {
    // The real shape: one long session linked 162 home PRs and 63 infra PRs,
    // and a single shared cap showed only home.
    const home = Array.from({ length: 25 }, (_, index): [string, number] => ["acme/home", 100 + index]);
    const infra = Array.from({ length: 12 }, (_, index): [string, number] => ["acme/infra", 200 + index]);
    const pack = buildProjectContinuationPack(
      input({ sessions: [evidenced("auto-claude-many", "운영 작업", { sessionEvidence: evidence("seg", { prs: [...infra, ...home] }) })] }),
    );
    expect(pack.markdown).toContain("acme/home #124 #123 #122 #121 #120 #119 #118 #117 #116 #115 외 15개");
    expect(pack.markdown).toContain("acme/infra #211 #210 #209 #208 #207 #206 #205 #204 #203 #202 외 2개");
    expect(pack.sessions[0].evidence?.prs).toHaveLength(37);
  });

  it("leaves command-only, scripted, and empty sessions out of the handoff and counts each reason", () => {
    const pack = buildProjectContinuationPack({
      ...input({
        sessions: [
          evidenced("auto-claude-talk", "실제 작업", { sessionEvidence: evidence("seg-talk") }),
          evidenced("auto-claude-model", "Claude Code · /model", { activityClass: "command-only" }),
          evidenced("auto-claude-probe", "Answer from the repository only", { interaction: "automation" }),
          evidenced("auto-codex-old-stub", "Claude Code · /home/u/dev/home", { activityClass: "empty" }),
        ],
      }),
      emptySources: 2,
    });
    expect(pack.sessions.map((item) => item.ref)).toEqual(["mori:session/auto-claude-talk"]);
    expect(pack.nonConversation).toEqual({ commandOnly: 1, automation: 1, empty: 3 });
    expect(pack.markdown).toContain("- 대화가 아니어서 뺀 세션: 명령만 실행 1개 · 자동 실행 1개 · 내용 없음 3개");
    expect(pack.markdown).not.toContain("/model");
    expect(pack.markdown).not.toContain("Answer from the repository");
  });

  it("joins segments only through an explicit continued-in link", () => {
    const pack = buildProjectContinuationPack(
      input({
        sessions: [
          {
            ...evidenced("auto-claude-part1", "인증 작업", {
              sessionEvidence: evidence("seg-1", { prs: [["acme/app", 7]], continuesIn: "seg-2" }),
            }),
            summary: { id: "auto-claude-part1", title: "인증 작업", startedAt: "2026-10-04T12:00:00.000Z" },
          },
          evidenced("auto-claude-part2", "인증 작업", {
            sessionEvidence: evidence("seg-2", { prs: [["acme/app", 7], ["acme/app", 8]], coverage: "partial" }),
          }),
          // Same title and project, no link: a different session.
          evidenced("auto-claude-other", "인증 작업", { sessionEvidence: evidence("seg-3") }),
        ],
      }),
    );
    expect(pack.sessions).toHaveLength(2);
    const joined = pack.sessions.find((item) => item.ref === "mori:session/auto-claude-part2");
    expect(joined?.evidence).toEqual({
      prs: [
        { repository: "acme/app", number: 8 },
        { repository: "acme/app", number: 7 },
      ],
      coverage: "partial",
      segments: 2,
    });
    expect(joined?.day).toBe("2026-10-04");
    expect(pack.coverage.joinedSegments).toBe(1);
    expect(pack.markdown).toContain("이어진 구간 2개");
  });

  it("does not pretend a session belongs to the project when only its folder joined it", () => {
    const pack = buildProjectContinuationPack(
      input({
        sessions: [
          evidenced("auto-claude-folder", "폴더로 묶인 세션", { sessionEvidence: evidence("seg-f") }, { contextIds: [] }),
          evidenced("auto-claude-linked", "연결된 세션", { sessionEvidence: evidence("seg-l") }),
        ],
      }),
    );
    expect(pack.coverage.unlinked).toBe(1);
    expect(pack.markdown).toContain("- 검토된 프로젝트 연결 없이 폴더 경로로만 묶인 세션: 1개");
  });

  it("separates 'no decisions recorded' from 'no decisions'", () => {
    const pack = buildProjectContinuationPack(
      input({ sessions: [evidenced("auto-claude-x", "작업", { sessionEvidence: evidence("seg-x") })] }),
    );
    expect(pack.markdown).toContain("결정·할 일: Mori에 기록된 항목이 없습니다. 없다는 뜻이 아니라 확인할 기록이 없다는 뜻입니다.");
  });
});

describe("buildProjectContinuationPack · why a session is in the project", () => {
  it("says a session came in through a Git worktree or a confirmed alias, and nothing about authorship", () => {
    const wt = evidenced("auto-claude-wt", "저장소 접근 작업", { sessionEvidence: evidence("seg-wt", { prs: [["acme/infra", 218]] }) });
    const laptop = evidenced("auto-claude-laptop", "노트북 작업", { sessionEvidence: evidence("seg-l") });
    const plain = evidenced("auto-claude-plain", "기본 작업", { sessionEvidence: evidence("seg-p") }, { contextIds: [] });
    const pack = buildProjectContinuationPack({
      ...input({ sessions: [wt, laptop, plain] }),
      sessions: [
        { ...wt.summary, inclusion: { project: "checkout", identity: "worktree-record" } },
        { ...laptop.summary, inclusion: { project: "alias", identity: "folder" } },
        { ...plain.summary, inclusion: { project: "checkout", identity: "folder" } },
      ],
      nameCandidates: 2,
    });
    const byRef = (id: string) => pack.sessions.find((item) => item.ref === `mori:session/${id}`);
    expect(byRef("auto-claude-wt")?.inclusion).toBe("worktree");
    expect(byRef("auto-claude-laptop")?.inclusion).toBe("alias");
    expect(byRef("auto-claude-plain")?.inclusion).toBeUndefined();
    expect(pack.markdown).toContain("  - 포함 근거: 이 프로젝트 checkout의 Git worktree에서 진행");
    expect(pack.markdown).toContain("  - 포함 근거: 사용자가 확인한 프로젝트 연결");
    expect(pack.coverage).toMatchObject({ viaWorktree: 1, viaAlias: 1, unlinked: 2, nameCandidates: 2 });
    expect(pack.markdown).toContain("- 이름만 같은 다른 checkout의 세션 2개는 확인 전이라 포함하지 않음");
    // The project page's own answer decides the link: a worktree in a folder
    // group is still not a reviewed project link.
    expect(pack.markdown).toContain("- 검토된 프로젝트 연결 없이 폴더 경로로만 묶인 세션: 2개");
    expect(pack.markdown).not.toMatch(/만든|작성한|authored/);
    expect(pack.markdown).not.toContain("/home/");
  });
});
