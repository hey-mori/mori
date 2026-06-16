import { describe, expect, it } from "vitest";
import { mockSession } from "../../domain/mock-data";
import {
  deriveProjectMemoryContext,
  deriveSavedReportAvailability,
} from "./projectMemoryContext";

describe("deriveProjectMemoryContext", () => {
  it("flags single-session scopes as not cross-session", () => {
    const snap = deriveProjectMemoryContext({
      view: mockSession,
      savedSessions: [],
      reportCount: 0,
      scope: "current-session",
      hasAnalysis: true,
    });
    expect(snap.isCrossSession).toBe(false);
    expect(snap.aggregatedSessionCount).toBe(1);
    expect(snap.scope).toBe("current-session");
    expect(snap.scopeCaveat.length).toBeGreaterThan(0);
  });

  it("uses the demo caveat when scope is demo", () => {
    const snap = deriveProjectMemoryContext({
      view: mockSession,
      savedSessions: [],
      reportCount: 0,
      scope: "demo",
      hasAnalysis: false,
    });
    expect(snap.scopeCaveat).toMatch(/Demo/);
    expect(snap.scope).toBe("demo");
  });

  it("includes saved-session and analysis caveats when relevant", () => {
    const snap = deriveProjectMemoryContext({
      view: mockSession,
      savedSessions: [],
      reportCount: 0,
      scope: "current-session",
      hasAnalysis: false,
    });
    expect(snap.scopeCaveat).toMatch(/분석/);
    expect(snap.scopeCaveat).toMatch(/저장된 세션/);
  });

  it("exposes savedReportAvailability on the snapshot", () => {
    const empty = deriveProjectMemoryContext({
      view: mockSession,
      savedSessions: [],
      reportCount: 0,
      scope: "current-session",
      hasAnalysis: true,
    });
    expect(empty.savedReportAvailability.hasAny).toBe(false);
    expect(empty.savedReportAvailability.label).toBe("저장된 보고서 없음");

    const populated = deriveProjectMemoryContext({
      view: mockSession,
      savedSessions: [],
      reportCount: 3,
      scope: "current-session",
      hasAnalysis: true,
    });
    expect(populated.savedReportAvailability.hasAny).toBe(true);
    expect(populated.savedReportAvailability.total).toBe(3);
    expect(populated.savedReportAvailability.label).toBe("보고서 3건");
    expect(populated.savedReportAvailability.tone).toBe("green");
  });
});

describe("deriveSavedReportAvailability", () => {
  it("treats zero reports as empty with a gray tone", () => {
    const avail = deriveSavedReportAvailability(0);
    expect(avail).toEqual(
      expect.objectContaining({
        hasAny: false,
        total: 0,
        tone: "gray",
      }),
    );
    expect(avail.emptyHint.length).toBeGreaterThan(0);
  });

  it("uses blue for 1–2 reports and green for 3+", () => {
    expect(deriveSavedReportAvailability(1).tone).toBe("blue");
    expect(deriveSavedReportAvailability(2).tone).toBe("blue");
    expect(deriveSavedReportAvailability(3).tone).toBe("green");
    expect(deriveSavedReportAvailability(50).tone).toBe("green");
  });

  it("singularises the label at count = 1", () => {
    expect(deriveSavedReportAvailability(1).label).toBe("보고서 1건");
    expect(deriveSavedReportAvailability(2).label).toBe("보고서 2건");
  });

  it("clamps negative counts to zero behaviour", () => {
    expect(deriveSavedReportAvailability(-5).hasAny).toBe(false);
  });
});
