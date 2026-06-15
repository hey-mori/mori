import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";

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
    useAppStore.setState({
      currentView: "home",
      sessionTab: "flow",
      reviewFocus: null,
    });
  });

  it("openSession() opens the session workspace, keeping the current tab", () => {
    useAppStore.setState({ sessionTab: "insights" });
    useAppStore.getState().openSession();
    const state = useAppStore.getState();
    expect(state.currentView).toBe("session");
    expect(state.sessionTab).toBe("insights");
  });

  it("openSession(tab) opens the session workspace on the requested tab", () => {
    useAppStore.getState().openSession("evidence");
    expect(useAppStore.getState().currentView).toBe("session");
    expect(useAppStore.getState().sessionTab).toBe("evidence");
  });

  it("navigate() folds the legacy session surfaces into the matching tab", () => {
    const expectations: Array<["timeline" | "flow" | "evidence" | "review" | "reports", "flow" | "analysis" | "report"]> = [
      ["timeline", "flow"],
      ["flow", "flow"],
      // 자료 + 검토 are folded into the unified 분석 tab.
      ["evidence", "analysis"],
      ["review", "analysis"],
      // The per-session report opens the session workspace's 리포트 tab.
      ["reports", "report"],
    ];
    for (const [view, tab] of expectations) {
      useAppStore.getState().navigate(view);
      const state = useAppStore.getState();
      expect(state.currentView).toBe("session");
      expect(state.sessionTab).toBe(tab);
    }
  });

  it("navigate() folds consolidation into the Memory 통합 segment", () => {
    useAppStore.getState().navigate("consolidation");
    const state = useAppStore.getState();
    expect(state.currentView).toBe("memory");
    expect(state.memoryTab).toBe("consolidation");
  });

  it("navigate() passes non-session destinations through unchanged", () => {
    for (const view of ["home", "memory", "connections", "workspace", "dashboard", "workbench", "start"] as const) {
      useAppStore.getState().navigate(view);
      expect(useAppStore.getState().currentView).toBe(view);
    }
  });

  it("navigate('settings') opens the settings sheet instead of routing", () => {
    useAppStore.setState({ currentView: "home", settingsSheetOpen: false });
    useAppStore.getState().navigate("settings");
    const state = useAppStore.getState();
    expect(state.settingsSheetOpen).toBe(true);
    expect(state.settingsTab).toBe("localAi");
    // The underlying view does not change — the user keeps their place.
    expect(state.currentView).toBe("home");
  });

  it("navigate('profile') opens the settings sheet on the profile tab", () => {
    useAppStore.setState({ currentView: "home", settingsSheetOpen: false });
    useAppStore.getState().navigate("profile");
    const state = useAppStore.getState();
    expect(state.settingsSheetOpen).toBe(true);
    expect(state.settingsTab).toBe("profile");
    expect(state.currentView).toBe("home");
  });

  it("openReviewItem() deep-links into the session 분석 tab", () => {
    useAppStore.getState().openReviewItem({ kind: "issue", issueId: "issue-1" });
    const state = useAppStore.getState();
    expect(state.currentView).toBe("session");
    expect(state.sessionTab).toBe("analysis");
    expect(state.reviewFocus).toEqual({ kind: "issue", issueId: "issue-1" });
  });

  it("focusTimelineEvent() selects the event and routes to the 활동 tab with a one-shot", () => {
    useAppStore.setState({
      currentView: "home",
      sessionTab: "overview",
      selectedEventId: "",
      timelineFocus: null,
    });
    useAppStore.getState().focusTimelineEvent("evt-42");
    const state = useAppStore.getState();
    expect(state.currentView).toBe("session");
    expect(state.sessionTab).toBe("flow");
    expect(state.selectedEventId).toBe("evt-42");
    expect(state.timelineFocus).toEqual({ eventId: "evt-42" });
    expect(state.inspectorCollapsed).toBe(false);
  });

  it("clearTimelineFocus() consumes the focus one-shot", () => {
    useAppStore.setState({ timelineFocus: { eventId: "evt-42" } });
    useAppStore.getState().clearTimelineFocus();
    expect(useAppStore.getState().timelineFocus).toBeNull();
  });

  it("setSessionTab() switches tabs without leaving the session workspace", () => {
    useAppStore.setState({ currentView: "session", sessionTab: "flow" });
    useAppStore.getState().setSessionTab("evidence");
    expect(useAppStore.getState().currentView).toBe("session");
    expect(useAppStore.getState().sessionTab).toBe("evidence");
  });

  it("requestEvidenceImport() routes to the 분석 tab and arms a one-shot", () => {
    useAppStore.setState({
      currentView: "connections",
      sessionTab: "flow",
      evidenceImportRequest: null,
    });
    useAppStore.getState().requestEvidenceImport("ai", "claude");
    const state = useAppStore.getState();
    expect(state.currentView).toBe("session");
    expect(state.sessionTab).toBe("analysis");
    expect(state.evidenceImportRequest).toEqual({ kind: "ai", platform: "claude" });
  });

  it("clearEvidenceImportRequest() consumes the one-shot", () => {
    useAppStore.setState({ evidenceImportRequest: { kind: "git" } });
    useAppStore.getState().clearEvidenceImportRequest();
    expect(useAppStore.getState().evidenceImportRequest).toBeNull();
  });

  it("requestStartRecords(agentId) arms the records browser for the picked agent", () => {
    useAppStore.setState({
      currentView: "connections",
      startRecordsRequest: false,
      startRecordsAgentId: null,
    });
    useAppStore.getState().requestStartRecords("codex");
    const state = useAppStore.getState();
    expect(state.currentView).toBe("start");
    expect(state.startRecordsRequest).toBe(true);
    expect(state.startRecordsAgentId).toBe("codex");
  });

  it("requestStartRecords() without an agent leaves the preference empty", () => {
    useAppStore.setState({ startRecordsAgentId: "cursor" });
    useAppStore.getState().requestStartRecords();
    expect(useAppStore.getState().startRecordsAgentId).toBeNull();
  });

  it("clearStartRecordsRequest() consumes both one-shots", () => {
    useAppStore.setState({ startRecordsRequest: true, startRecordsAgentId: "opencode" });
    useAppStore.getState().clearStartRecordsRequest();
    const state = useAppStore.getState();
    expect(state.startRecordsRequest).toBe(false);
    expect(state.startRecordsAgentId).toBeNull();
  });
});
