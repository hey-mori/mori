import { describe, expect, it } from "vitest";

import { isImportFlowView } from "./importFlowView";

describe("isImportFlowView", () => {
  it("treats the new-session and session-detail views as in-flow", () => {
    for (const view of ["start", "session", "timeline", "flow", "evidence", "review", "reports"] as const) {
      expect(isImportFlowView(view)).toBe(true);
    }
  });

  it("treats surfaces outside the flow as out-of-flow", () => {
    for (const view of ["home", "project", "workspace", "memory", "consolidation", "connections", "ask"] as const) {
      expect(isImportFlowView(view)).toBe(false);
    }
  });
});
