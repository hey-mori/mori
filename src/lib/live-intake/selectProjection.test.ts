import { describe, expect, it } from "vitest";
import { selectProjectionForLabel } from "./buildProjectProjection";
import type { ProjectProjection } from "./buildProjectProjection";

function projection(projectPath: string, label: string): ProjectProjection {
  return {
    projectPath,
    label,
    observedAt: "2026-08-07T12:00:00.000Z",
    freshness: "live",
    runningCount: 0,
    waitingCount: 0,
    blockedCount: 0,
    blocked: [],
    running: [],
    recentRequests: [],
    waiting: [],
    topFiles: [],
    lastActivityAt: "2026-08-07T12:00:00.000Z",
    rowCount: 1,
  };
}

describe("selectProjectionForLabel", () => {
  it("finds the projection whose leaf the surface is showing", () => {
    const found = selectProjectionForLabel(
      [projection("C:\\dev\\mori", "mori"), projection("C:\\dev\\other", "other")],
      "mori",
    );

    expect(found?.projectPath).toBe("C:\\dev\\mori");
  });

  it("matches case-insensitively, since the leaf is a display string", () => {
    expect(selectProjectionForLabel([projection("C:\\dev\\Mori", "Mori")], "mori")).not.toBeNull();
  });

  it("refuses when two observed projects share a trailing name", () => {
    // Attaching one project's live state to another's page is worse than
    // showing no section, so ambiguity resolves to nothing.
    const found = selectProjectionForLabel(
      [projection("C:\\work\\api", "api"), projection("C:\\play\\api", "api")],
      "api",
    );

    expect(found).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(selectProjectionForLabel([projection("C:\\dev\\mori", "mori")], "nope")).toBeNull();
  });

  it("returns null for an empty label rather than matching an unnamed project", () => {
    expect(selectProjectionForLabel([projection("", "")], "")).toBeNull();
  });
});
