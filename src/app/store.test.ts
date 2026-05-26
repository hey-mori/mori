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
    const expectations: Array<["timeline" | "flow" | "evidence" | "review" | "reports", "flow" | "evidence" | "insights" | "report"]> = [
      ["timeline", "flow"],
      ["flow", "flow"],
      ["evidence", "evidence"],
      ["review", "insights"],
      // A report is per-session — it opens the session workspace's 리포트 tab.
      ["reports", "report"],
    ];
    for (const [view, tab] of expectations) {
      useMoriAppStore.getState().navigate(view);
      const state = useMoriAppStore.getState();
      expect(state.currentView).toBe("session");
      expect(state.sessionTab).toBe(tab);
    }
  });

  it("navigate() folds consolidation into the Memory 통합 segment", () => {
    useMoriAppStore.getState().navigate("consolidation");
    const state = useMoriAppStore.getState();
    expect(state.currentView).toBe("memory");
    expect(state.memoryTab).toBe("consolidation");
  });

  it("navigate() passes non-session destinations through unchanged", () => {
    for (const view of ["home", "memory", "connections", "start"] as const) {
      useMoriAppStore.getState().navigate(view);
      expect(useMoriAppStore.getState().currentView).toBe(view);
    }
  });

  it("navigate('settings') opens the settings sheet instead of routing", () => {
    useMoriAppStore.setState({ currentView: "home", settingsSheetOpen: false });
    useMoriAppStore.getState().navigate("settings");
    const state = useMoriAppStore.getState();
    expect(state.settingsSheetOpen).toBe(true);
    expect(state.settingsTab).toBe("localAi");
    // The underlying view does not change — the user keeps their place.
    expect(state.currentView).toBe("home");
  });

  it("navigate('profile') opens the settings sheet on the profile tab", () => {
    useMoriAppStore.setState({ currentView: "home", settingsSheetOpen: false });
    useMoriAppStore.getState().navigate("profile");
    const state = useMoriAppStore.getState();
    expect(state.settingsSheetOpen).toBe(true);
    expect(state.settingsTab).toBe("profile");
    expect(state.currentView).toBe("home");
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

  it("requestEvidenceImport() routes to the 증거 tab and arms a one-shot", () => {
    useMoriAppStore.setState({
      currentView: "connections",
      sessionTab: "flow",
      evidenceImportRequest: null,
    });
    useMoriAppStore.getState().requestEvidenceImport("ai", "claude");
    const state = useMoriAppStore.getState();
    expect(state.currentView).toBe("session");
    expect(state.sessionTab).toBe("evidence");
    expect(state.evidenceImportRequest).toEqual({ kind: "ai", platform: "claude" });
  });

  it("clearEvidenceImportRequest() consumes the one-shot", () => {
    useMoriAppStore.setState({ evidenceImportRequest: { kind: "git" } });
    useMoriAppStore.getState().clearEvidenceImportRequest();
    expect(useMoriAppStore.getState().evidenceImportRequest).toBeNull();
  });
});
