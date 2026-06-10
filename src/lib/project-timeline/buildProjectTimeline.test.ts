import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import { buildProjectTimeline, type LoadedProjectSession } from "./buildProjectTimeline";

const at = (day: number) => `2026-06-${String(day).padStart(2, "0")}T10:00:00Z`;

function loaded(id: string, startDay: number, endDay: number): LoadedProjectSession {
  return {
    meta: { id, title: `세션 ${id}`, startedAt: at(startDay), endedAt: at(endDay) },
    view: mockSession,
  };
}

function metaOnly(
  id: string,
  startDay: number,
  endDay: number,
  counts: { eventCount?: number; decisionCount?: number; openIssueCount?: number } = {},
): LoadedProjectSession {
  return {
    meta: { id, title: `세션 ${id}`, startedAt: at(startDay), endedAt: at(endDay), ...counts },
    view: null,
  };
}

const sessionKinds = (model: ReturnType<typeof buildProjectTimeline>) =>
  model.segments.map((segment) =>
    segment.kind === "session" ? `session:${segment.id}` : `gap:${segment.label}`,
  );

describe("buildProjectTimeline", () => {
  it("orders sessions chronologically and elides only gaps over a day", () => {
    // Given out of order; A end day1, B start day5 (4-day gap), B end day5, C start day6 (1 day, no gap).
    const model = buildProjectTimeline({
      sessions: [metaOnly("B", 5, 5), metaOnly("A", 1, 1), metaOnly("C", 6, 6)],
    });
    expect(sessionKinds(model)).toEqual([
      "session:A",
      "gap:4일 후",
      "session:B",
      "session:C",
    ]);
    const gap = model.segments[1];
    expect(gap.kind === "gap" && gap.afterIso).toBe(at(1));
    expect(gap.kind === "gap" && gap.beforeIso).toBe(at(5));
  });

  it("yields a partial band with metadata counts for a meta-only session", () => {
    const model = buildProjectTimeline({
      sessions: [metaOnly("m", 1, 1, { eventCount: 7, decisionCount: 2, openIssueCount: 3 })],
    });
    const band = model.segments[0];
    expect(band.kind).toBe("session");
    if (band.kind !== "session") return;
    expect(band.partial).toBe(true);
    expect(band.eventCount).toBe(7);
    expect(band.decisionCount).toBe(2);
    expect(band.openIssueCount).toBe(3);
    expect(band.lanes).toEqual([]);
  });

  it("aggregates a loaded session band from its body, with populated lanes", () => {
    const model = buildProjectTimeline({ sessions: [loaded("s", 1, 1)] });
    const band = model.segments[0];
    expect(band.kind).toBe("session");
    if (band.kind !== "session") return;
    expect(band.partial).toBe(false);
    expect(band.eventCount).toBe(mockSession.events.length);
    expect(band.decisionCount).toBe(mockSession.decisions.length);
    expect(band.openIssueCount).toBe(
      mockSession.issues.filter((issue) => issue.status !== "resolved").length,
    );
    expect(band.lanes.length).toBeGreaterThan(0);
    expect(band.lanes.every((lane) => lane.count > 0)).toBe(true);
  });

  it("resolves dataBasis across all-loaded, metadata-only, partial, and empty", () => {
    expect(buildProjectTimeline({ sessions: [loaded("a", 1, 1)] }).dataBasis).toBe(
      "activePlusSavedSessions",
    );
    expect(buildProjectTimeline({ sessions: [metaOnly("a", 1, 1)] }).dataBasis).toBe(
      "savedSessionMetadataOnly",
    );
    expect(
      buildProjectTimeline({ sessions: [loaded("a", 1, 1), metaOnly("b", 2, 2)] }).dataBasis,
    ).toBe("partialSavedSessionLoad");
    expect(buildProjectTimeline({ sessions: [] }).dataBasis).toBe("unavailable");
  });

  it("keeps the most recent sessions and reports the dropped count beyond the cap", () => {
    const model = buildProjectTimeline({
      sessions: [metaOnly("d1", 1, 1), metaOnly("d2", 2, 2), metaOnly("d3", 3, 3)],
      cap: 2,
    });
    expect(model.droppedSessionCount).toBe(1);
    expect(sessionKinds(model).filter((k) => k.startsWith("session"))).toEqual([
      "session:d2",
      "session:d3",
    ]);
  });

  it("aggregates the pulse and labels the span from first start to last end", () => {
    const model = buildProjectTimeline({
      sessions: [metaOnly("a", 1, 1, { decisionCount: 2, openIssueCount: 1 }), metaOnly("b", 9, 9, { decisionCount: 3 })],
    });
    expect(model.pulse.sessions).toBe(2);
    expect(model.pulse.decisions).toBe(5);
    expect(model.pulse.issuesOpen).toBe(1);
    expect(model.pulse.spanLabel).toBe("6월 1일 – 6월 9일");
  });

  it("keeps the span label honest (null) when a timestamp is missing", () => {
    const model = buildProjectTimeline({
      sessions: [{ meta: { id: "x", title: "x", startedAt: "", endedAt: "" }, view: null }],
    });
    expect(model.pulse.spanLabel).toBeNull();
  });
});
