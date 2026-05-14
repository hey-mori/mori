import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { deriveProjectMemoryContext } from "./projectMemoryContext";

describe("deriveProjectMemoryContext", () => {
  it("flags single-session scopes as not cross-session", () => {
    const snap = deriveProjectMemoryContext({
      view: moriMockSession,
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
      view: moriMockSession,
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
      view: moriMockSession,
      savedSessions: [],
      reportCount: 0,
      scope: "current-session",
      hasAnalysis: false,
    });
    expect(snap.scopeCaveat).toMatch(/Quick Pass/);
    expect(snap.scopeCaveat).toMatch(/저장된 세션/);
  });
});
