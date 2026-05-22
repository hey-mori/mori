import { describe, expect, it } from "vitest";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  DEMO_SESSION_SUMMARIES,
  isDemoSessionId,
  mergeDemoSessionSummaries,
} from "./demoSessionFixtures";

function real(sessionId: string, savedAt: string): StoredSessionSummary {
  return {
    sessionId,
    projectId: "p-real",
    title: "실제 세션",
    projectName: "Real",
    savedAt,
    status: "complete",
  };
}

describe("DEMO_SESSION_SUMMARIES", () => {
  it("ships a varied multi-session bundle", () => {
    expect(DEMO_SESSION_SUMMARIES.length).toBeGreaterThanOrEqual(4);
    const titles = new Set(DEMO_SESSION_SUMMARIES.map((s) => s.title));
    expect(titles.size).toBe(DEMO_SESSION_SUMMARIES.length);
    const projects = new Set(DEMO_SESSION_SUMMARIES.map((s) => s.projectName));
    expect(projects.size).toBeGreaterThan(1);
  });

  it("every fixture id is recognisable as a demo via isDemoSessionId", () => {
    for (const summary of DEMO_SESSION_SUMMARIES) {
      expect(isDemoSessionId(summary.sessionId)).toBe(true);
    }
  });

  it("isDemoSessionId returns false for an imported session id", () => {
    expect(isDemoSessionId("sess-mori-앱-기획-20260517091438")).toBe(false);
  });
});

describe("mergeDemoSessionSummaries", () => {
  it("returns demos when there are no real sessions", () => {
    const merged = mergeDemoSessionSummaries([]);
    expect(merged.length).toBe(DEMO_SESSION_SUMMARIES.length);
    expect(merged.every((s) => isDemoSessionId(s.sessionId))).toBe(true);
  });

  it("hides demos once any real session is captured", () => {
    const merged = mergeDemoSessionSummaries([real("a", "2026-05-22T10:00:00.000Z")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sessionId).toBe("a");
  });

  it("merges and sorts most-recent-first when mode is 'always'", () => {
    const merged = mergeDemoSessionSummaries(
      [real("a", "2026-05-22T10:00:00.000Z")],
      "always",
    );
    expect(merged.length).toBe(1 + DEMO_SESSION_SUMMARIES.length);
    const stamps = merged.map((s) => new Date(s.savedAt).getTime());
    const sorted = [...stamps].sort((x, y) => y - x);
    expect(stamps).toEqual(sorted);
  });
});
