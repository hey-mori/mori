import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  filterSidebarRows,
  formatSidebarRelative,
  groupSidebarRows,
  toSidebarRow,
  type SidebarSessionRow,
} from "./sessionList";

function summary(partial: Partial<StoredSessionSummary>): StoredSessionSummary {
  return {
    sessionId: partial.sessionId ?? "s-1",
    projectId: partial.projectId ?? "p-1",
    title: partial.title ?? "세션",
    projectName: partial.projectName ?? "프로젝트",
    savedAt: partial.savedAt ?? "2026-05-22T10:00:00.000Z",
    status: partial.status ?? "complete",
    startedAt: partial.startedAt,
    sourceLabel: partial.sourceLabel,
    archivedAt: partial.archivedAt,
    eventCount: partial.eventCount,
    tokenTotal: partial.tokenTotal,
    tokenInput: partial.tokenInput,
    tokenOutput: partial.tokenOutput,
  };
}

describe("toSidebarRow", () => {
  it("prefers startedAt over savedAt as the sort timestamp", () => {
    const row = toSidebarRow(
      summary({
        savedAt: "2026-05-22T18:00:00.000Z",
        startedAt: "2026-05-22T12:00:00.000Z",
      }),
    );
    expect(row.timestamp).toBe("2026-05-22T12:00:00.000Z");
  });

  it("falls back to savedAt when startedAt is missing", () => {
    const row = toSidebarRow(
      summary({ savedAt: "2026-05-22T18:00:00.000Z", startedAt: undefined }),
    );
    expect(row.timestamp).toBe("2026-05-22T18:00:00.000Z");
  });

  it("substitutes a placeholder when the title is empty", () => {
    const row = toSidebarRow(summary({ title: "  " }));
    expect(row.title).toBe("제목 없음");
  });

  it("marks archived rows so the view layer can hide them", () => {
    expect(toSidebarRow(summary({ archivedAt: undefined })).archived).toBe(false);
    expect(toSidebarRow(summary({ archivedAt: "2026-05-22T10:00:00.000Z" })).archived).toBe(true);
  });
});

describe("filterSidebarRows", () => {
  const rows: SidebarSessionRow[] = [
    {
      sessionId: "a",
      title: "Mori 앱 기획",
      timestamp: "2026-05-22T10:00:00.000Z",
      sourceLabel: "C:/dev/mori",
      archived: false,
    },
    {
      sessionId: "b",
      title: "Jinga 결제",
      timestamp: "2026-05-21T10:00:00.000Z",
      archived: false,
    },
  ];

  it("returns all rows when the query is empty / whitespace", () => {
    expect(filterSidebarRows(rows, "")).toEqual(rows);
    expect(filterSidebarRows(rows, "   ")).toEqual(rows);
  });

  it("matches title text, case-insensitively", () => {
    expect(filterSidebarRows(rows, "mori").map((r) => r.sessionId)).toEqual(["a"]);
    expect(filterSidebarRows(rows, "JINGA").map((r) => r.sessionId)).toEqual(["b"]);
  });

  it("matches the source label too — searching by project path works", () => {
    expect(filterSidebarRows(rows, "dev/mori").map((r) => r.sessionId)).toEqual(["a"]);
  });
});

describe("groupSidebarRows", () => {
  // Fixed reference instant: 2026-05-22 14:00 local time.
  const now = new Date("2026-05-22T14:00:00").getTime();

  function row(id: string, iso: string): SidebarSessionRow {
    return { sessionId: id, title: id, timestamp: iso, archived: false };
  }

  it("buckets rows into today / yesterday / this week / earlier", () => {
    const groups = groupSidebarRows(
      [
        row("today", new Date(now - 2 * 60 * 60 * 1000).toISOString()),
        row("yesterday", new Date(now - 24 * 60 * 60 * 1000).toISOString()),
        row("week", new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString()),
        row("old", new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ],
      now,
    );
    expect(groups.map((g) => g.bucket)).toEqual([
      "today",
      "yesterday",
      "thisWeek",
      "earlier",
    ]);
    expect(groups[0]!.rows.map((r) => r.sessionId)).toEqual(["today"]);
    expect(groups[3]!.rows.map((r) => r.sessionId)).toEqual(["old"]);
  });

  it("drops empty buckets so the sidebar doesn't render hollow headers", () => {
    const groups = groupSidebarRows(
      [row("a", new Date(now - 60 * 1000).toISOString())],
      now,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["today"]);
  });

  it("places rows with an unparseable timestamp into the earlier bucket", () => {
    const groups = groupSidebarRows([row("bad", "not-a-date")], now);
    expect(groups).toEqual([
      { bucket: "earlier", label: "이전", rows: [{ sessionId: "bad", title: "bad", timestamp: "not-a-date", archived: false }] },
    ]);
  });

  it("collects archived rows into a trailing 보관됨 bucket regardless of mode", () => {
    const live = row("live", new Date(now - 60 * 1000).toISOString());
    const stashed: SidebarSessionRow = {
      ...row("old-stash", new Date(now - 30 * 86_400_000).toISOString()),
      archived: true,
    };
    const groups = groupSidebarRows([live, stashed], now);
    expect(groups.map((g) => g.bucket)).toEqual(["today", "archived"]);
    expect(groups[1]!.label).toContain("1");
    expect(groups[1]!.rows.map((r) => r.sessionId)).toEqual(["old-stash"]);
  });

  it("omits the archived bucket when no rows are archived", () => {
    const live = row("live", new Date(now - 60 * 1000).toISOString());
    const groups = groupSidebarRows([live], now);
    expect(groups.map((g) => g.bucket)).toEqual(["today"]);
  });

  it("keeps archived rows out of project-mode groups too", () => {
    const live: SidebarSessionRow = {
      ...row("a", new Date(now - 60 * 1000).toISOString()),
      sourceLabel: "alpha",
    };
    const stashed: SidebarSessionRow = {
      ...row("b", new Date(now - 60 * 1000).toISOString()),
      sourceLabel: "alpha",
      archived: true,
    };
    const groups = groupSidebarRows([live, stashed], now, "project");
    expect(groups.map((g) => g.bucket)).toEqual(["project", "archived"]);
    expect(groups[0]!.rows.map((r) => r.sessionId)).toEqual(["a"]);
    expect(groups[1]!.rows.map((r) => r.sessionId)).toEqual(["b"]);
  });
});

describe("formatSidebarRelative", () => {
  const now = new Date("2026-05-22T14:00:00").getTime();

  it("renders 방금 for the immediate past", () => {
    expect(formatSidebarRelative(new Date(now - 10_000).toISOString(), now)).toBe("방금");
  });

  it("renders minutes / hours / yesterday / days for the recent past", () => {
    expect(formatSidebarRelative(new Date(now - 12 * 60_000).toISOString(), now)).toBe("12분 전");
    expect(formatSidebarRelative(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3시간 전");
    expect(formatSidebarRelative(new Date(now - 26 * 3_600_000).toISOString(), now)).toBe("어제");
    expect(formatSidebarRelative(new Date(now - 4 * 86_400_000).toISOString(), now)).toBe("4일 전");
  });

  it("falls back to a short Korean calendar date for rows older than a week", () => {
    const stamp = new Date(now - 14 * 86_400_000).toISOString();
    // 14 days before 2026-05-22 = 2026-05-08
    expect(formatSidebarRelative(stamp, now)).toBe("5월 8일");
  });

  it("renders future timestamps as a short calendar label, not a locale string", () => {
    const future = new Date(now + 3 * 86_400_000).toISOString();
    // 3 days after 2026-05-22 = 2026-05-25
    expect(formatSidebarRelative(future, now)).toBe("5월 25일");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatSidebarRelative("not-a-date")).toBe("");
  });
});
