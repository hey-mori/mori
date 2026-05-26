import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  DEFAULT_SESSIONS_BROWSER_FILTERS,
  buildSessionsBrowserModel,
  describeSessionOrigin,
  type SessionsBrowserFilters,
  type SessionsBrowserInput,
} from "./sessionsBrowser";

function stored(over: Partial<StoredSessionSummary> = {}): StoredSessionSummary {
  return {
    sessionId: "stored-1",
    projectId: "proj-1",
    title: "저장된 세션",
    projectName: "Mori",
    savedAt: "2026-05-20T09:00:00+09:00",
    status: "complete",
    startedAt: "2026-05-20T08:00:00+09:00",
    ...over,
  };
}

function activeInput(
  over: Partial<SessionsBrowserInput["active"]> = {},
): SessionsBrowserInput["active"] {
  return {
    sessionId: "active-1",
    title: "활성 세션",
    status: "recording",
    sourceLabel: null,
    startedAt: "2026-05-22T09:00:00+09:00",
    endedAt: "2026-05-22T10:00:00+09:00",
    isDemo: false,
    isStored: false,
    ...over,
  };
}

function filters(over: Partial<SessionsBrowserFilters> = {}): SessionsBrowserFilters {
  return { ...DEFAULT_SESSIONS_BROWSER_FILTERS, ...over };
}

describe("buildSessionsBrowserModel", () => {
  it("includes the active session even when it has no saved draft", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput(),
      storedSessions: [],
      filters: filters(),
    });

    const rows = model.groups.flatMap((group) => group.sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessionId).toBe("active-1");
    expect(rows[0]!.isActive).toBe(true);
    expect(rows[0]!.savedAt).toBeNull();
  });

  it("does not duplicate the active session when it is already stored", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput({ sessionId: "stored-1", isStored: true }),
      storedSessions: [stored({ sessionId: "stored-1" })],
      filters: filters(),
    });

    const rows = model.groups.flatMap((group) => group.sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isActive).toBe(true);
    expect(rows[0]!.savedAt).toBe("2026-05-20T09:00:00+09:00");
  });

  it("groups imported sessions by sourceLabel and pins the manual bucket last", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput({ sourceLabel: null }),
      storedSessions: [
        stored({ sessionId: "a", sourceLabel: "C:/dev/mori" }),
        stored({ sessionId: "b", sourceLabel: "C:/dev/other" }),
        stored({ sessionId: "c", sourceLabel: undefined }),
      ],
      filters: filters(),
    });

    const labels = model.groups.map((group) => group.label);
    expect(labels).toContain("C:/dev/mori");
    expect(labels).toContain("C:/dev/other");
    // The unsourced bucket (manual + active) is always last.
    expect(model.groups[model.groups.length - 1]!.isUnsourced).toBe(true);
  });

  it("derives origin from sourceLabel", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput({ sessionId: "x", sourceLabel: "C:/dev/mori" }),
      storedSessions: [stored({ sessionId: "m", sourceLabel: undefined })],
      filters: filters(),
    });
    const rows = model.groups.flatMap((group) => group.sessions);
    const imported = rows.find((row) => row.sessionId === "x");
    const manual = rows.find((row) => row.sessionId === "m");
    expect(imported!.origin).toBe("imported");
    expect(manual!.origin).toBe("manual");
  });

  it("marks the demo active session origin as demo", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput({ isDemo: true }),
      storedSessions: [],
      filters: filters(),
    });
    const rows = model.groups.flatMap((group) => group.sessions);
    expect(rows[0]!.origin).toBe("demo");
    expect(model.groups[0]!.label).toBe("데모");
  });

  it("filters by origin", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput({ sessionId: "manual-active", sourceLabel: null }),
      storedSessions: [stored({ sessionId: "imp", sourceLabel: "C:/dev/mori" })],
      filters: filters({ origin: "imported" }),
    });
    const rows = model.groups.flatMap((group) => group.sessions);
    expect(rows.map((row) => row.sessionId)).toEqual(["imp"]);
  });

  it("filters by query against title and source label", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput({ sessionId: "active-1", title: "활성" }),
      storedSessions: [
        stored({ sessionId: "a", title: "스키마 설계", sourceLabel: "C:/dev/mori" }),
        stored({ sessionId: "b", title: "릴리스 준비", sourceLabel: "C:/dev/other" }),
      ],
      filters: filters({ query: "mori" }),
    });
    const rows = model.groups.flatMap((group) => group.sessions);
    expect(rows.map((row) => row.sessionId)).toEqual(["a"]);
  });

  it("sorts by recent (active first) and by title", () => {
    const input: SessionsBrowserInput = {
      active: activeInput({ sessionId: "active-1", title: "ㅎ 활성", sourceLabel: null }),
      storedSessions: [
        stored({ sessionId: "old", title: "가 오래된", savedAt: "2026-05-01T00:00:00+09:00", sourceLabel: undefined }),
        stored({ sessionId: "new", title: "나 최신", savedAt: "2026-05-21T00:00:00+09:00", sourceLabel: undefined }),
      ],
      filters: filters({ sort: "recent" }),
    };

    const recent = buildSessionsBrowserModel(input);
    const recentRows = recent.groups.flatMap((group) => group.sessions);
    expect(recentRows.map((row) => row.sessionId)).toEqual(["active-1", "new", "old"]);

    const byTitle = buildSessionsBrowserModel({ ...input, filters: filters({ sort: "title" }) });
    const titleRows = byTitle.groups.flatMap((group) => group.sessions);
    expect(titleRows[0]!.title).toBe("가 오래된");
  });

  it("reports total and visible counts", () => {
    const model = buildSessionsBrowserModel({
      active: activeInput({ sessionId: "active-1" }),
      storedSessions: [
        stored({ sessionId: "a" }),
        stored({ sessionId: "b" }),
      ],
      filters: filters(),
    });
    expect(model.totalCount).toBe(3);
    expect(model.visibleCount).toBe(3);
    expect(model.hasAnySession).toBe(true);
  });
});

describe("describeSessionOrigin", () => {
  it("maps each origin to a Korean label and tone", () => {
    expect(describeSessionOrigin("imported")).toEqual({ label: "가져온 세션", tone: "neutral" });
    expect(describeSessionOrigin("manual")).toEqual({ label: "수동", tone: "neutral" });
    expect(describeSessionOrigin("demo")).toEqual({ label: "데모", tone: "accent" });
  });
});
