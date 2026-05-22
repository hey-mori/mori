import { beforeEach, describe, expect, it } from "vitest";
import { useMoriAppStore } from "./store";

/**
 * Routing contract for the unified Session Detail workspace (P3).
 *
 * The legacy timeline / flow / evidence / review surfaces are now tabs inside
 * one session workspace, so navigation must normalise into `currentView:
 * "session"` + the matching `sessionTab` rather than landing on a standalone
 * page. These assertions lock that mapping so it can't silently regress.
 */
describe("app store — session-centric routing", () => {
  beforeEach(() => {
    useMoriAppStore.setState({
      currentView: "home",
      sessionTab: "flow",
      reviewFocus: null,
    });
  });

  it("openSession() opens the session workspace, keeping the current tab", () => {
    useMoriAppStore.setState({ sessionTab: "insights" });
    useMoriAppStore.getState().openSession();
    const state = useMoriAppStore.getState();
    expect(state.currentView).toBe("session");
    expect(state.sessionTab).toBe("insights");
  });

  it("openSession(tab) opens the session workspace on the requested tab", () => {
    useMoriAppStore.getState().openSession("evidence");
    expect(useMoriAppStore.getState().currentView).toBe("session");
    expect(useMoriAppStore.getState().sessionTab).toBe("evidence");
  });

  it("navigate() folds the legacy session surfaces into the matching tab", () => {
    const expectations: Array<["timeline" | "flow" | "evidence" | "review", "flow" | "evidence" | "insights"]> = [
      ["timeline", "flow"],
      ["flow", "flow"],
      ["evidence", "evidence"],
      ["review", "insights"],
    ];
    for (const [view, tab] of expectations) {
      useMoriAppStore.getState().navigate(view);
      const state = useMoriAppStore.getState();
      expect(state.currentView).toBe("session");
      expect(state.sessionTab).toBe(tab);
    }
  });

  it("navigate() passes non-session destinations through unchanged", () => {
    for (const view of ["home", "memory", "reports", "settings", "connections", "start"] as const) {
      useMoriAppStore.getState().navigate(view);
      expect(useMoriAppStore.getState().currentView).toBe(view);
    }
  });

  it("openReviewItem() deep-links into the session insights tab", () => {
    useMoriAppStore.getState().openReviewItem({ kind: "issue", issueId: "issue-1" });
    const state = useMoriAppStore.getState();
    expect(state.currentView).toBe("session");
    expect(state.sessionTab).toBe("insights");
    expect(state.reviewFocus).toEqual({ kind: "issue", issueId: "issue-1" });
  });

  it("setSessionTab() switches tabs without leaving the session workspace", () => {
    useMoriAppStore.setState({ currentView: "session", sessionTab: "flow" });
    useMoriAppStore.getState().setSessionTab("evidence");
    expect(useMoriAppStore.getState().currentView).toBe("session");
    expect(useMoriAppStore.getState().sessionTab).toBe("evidence");
  });
});
