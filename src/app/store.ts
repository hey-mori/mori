import { create } from "zustand";
import type { ViewKey } from "../domain/types";
import type { ActivityLaneId } from "../lib/timeline/activityModel";
import type { ReviewSelection } from "../lib/review-workspace/reviewWorkspace";
import type { AgentWorkAgentId } from "../lib/agents/agentRegistry";

/** Active tab on the Review surface. Persisted so the user returns to the same tab. */
export type ReviewTab = "issues" | "decisions" | "nextActions" | "unresolved" | "suggestions";

/**
 * Active tab inside the unified Session Detail workspace. Opening a session
 * lands on "flow" (what happened); "evidence" is the per-session sources; and
 * "insights" reframes the old Review surface around the value of confirming
 * issues / decisions / next actions. Stored so the user returns to the same
 * tab, and so other surfaces can deep-link a session straight to a tab.
 */
export type SessionTab =
  | "overview"
  | "flow"
  | "reconstruct"
  | "evidence"
  | "insights"
  | "analysis"
  | "report";

/**
 * Active page inside the settings sheet. "profile" is the local identity
 * page; the remaining values are the settings sections. Stored so the sheet
 * reopens on the last page the user visited.
 */
export type SettingsTab =
  | "profile"
  | "localAi"
  | "connections"
  | "privacy"
  | "storage"
  | "repositories"
  | "appearance"
  | "notifications"
  | "about";

/**
 * Active segment inside the Memory surface. Memory is cross-session, so it
 * hosts the project-memory overview and the Consolidation review — both
 * operate across sessions. (A report is per-session, so it lives in the
 * Session workspace as its own tab, not here.)
 */
export type MemoryTab = "overview" | "consolidation";

/**
 * A one-shot request to open the Evidence import drawer on a specific tab.
 * Set when another surface (the Source Control Center on the 연동 page)
 * deep-links into an import flow. The Evidence Hub consumes and clears it once
 * the drawer opens. The platform hint is honoured only by the AI transcript
 * tab; other kinds ignore it.
 */
export type EvidenceImportRequest = {
  kind: "note" | "url" | "ai" | "git" | "connector";
  platform?: "claude" | "chatgpt" | "codex" | "other";
};

type AppState = {
  currentView: ViewKey;
  selectedEventId: string;
  hoveredEventId: string | null;
  /** Active category filter — the timeline lane taxonomy (one set of
   *  categories shared by the swimlanes and the filter popover). */
  activeFilters: ActivityLaneId[];
  searchQuery: string;
  /** When true, the inspector is collapsed (used at narrow widths). */
  inspectorCollapsed: boolean;
  /**
   * A one-shot request to open the Review surface focused on a specific
   * item — set when another surface (e.g. the Timeline event inspector)
   * deep-links into Review. ReviewView consumes and clears it.
   */
  reviewFocus: ReviewSelection | null;
  /**
   * A one-shot request to open the Project Memory surface with a specific
   * accepted memory's provenance drawer open. Set when another surface
   * (e.g. Companion Inbox memory-health chips) deep-links into Memory.
   * `MemoryView` consumes and clears it once the drawer opens.
   */
  memoryFocus: { memoryId: string } | null;
  /**
   * A one-shot request to open the Evidence import drawer on a given tab.
   * Set by `requestEvidenceImport`; the Evidence Hub consumes and clears it.
   */
  evidenceImportRequest: EvidenceImportRequest | null;
  /**
   * A one-shot request to focus a specific event in the 활동 timeline. Set when
   * another surface (the overview reopen anchor, a review item's related
   * event) deep-links to an event: the 활동 tab defaults to the AI 흐름 summary,
   * which does not surface an individual event, so the focus signal tells the
   * timeline to open the 원본 stream, where the selected event is highlighted
   * and scrolled into view. `TimelineView` consumes and clears it.
   */
  timelineFocus: { eventId: string } | null;
  /**
   * A one-shot request to open a specific source in the 자료 evidence hub. Set
   * when a review item's grounds list deep-links to the source its analysis was
   * drawn from, completing the 검토 → 자료 direction of the evidence link.
   * `EvidenceView` consumes and clears it.
   */
  evidenceFocus: { sourceId: string } | null;
  /**
   * Active tab on the Review surface. Stored here so the user returns to
   * the same tab when navigating away and back. Deep-link overrides via
   * `openReviewItem` still win and update this value.
   */
  reviewTab: ReviewTab;
  /**
   * Active tab inside the unified Session Detail workspace (흐름 / 증거 /
   * 검토). Stored so navigating away and back returns to the same tab;
   * `openSession` overrides it when another surface deep-links a tab.
   */
  sessionTab: SessionTab;
  /**
   * Active tab on the Settings surface. Stored here so the user returns
   * to the same tab when navigating away and back.
   */
  settingsTab: SettingsTab;
  /**
   * Active segment inside the Memory surface (개요 / 통합 / 리포트). Stored so
   * navigating away and back returns to the same segment; Memory-internal
   * links (e.g. the hero "리포트" action) set it to switch segment in place.
   */
  memoryTab: MemoryTab;
  /**
   * Whether the settings sheet (profile + settings, opened from the top-bar
   * user button) is open. Lives in the store so any surface can open it —
   * e.g. an empty-state CTA that wants to drop the user into the storage tab.
   */
  settingsSheetOpen: boolean;
  /**
   * Whether the command palette (Cmd+K / Ctrl+K) is open. Lives in the store
   * so any surface can trigger it — e.g. a "Find anything" CTA in an empty
   * state — without having to thread a ref through the component tree.
   */
  commandPaletteOpen: boolean;
  /** The language tool dialog · a surface opened in place, not a route. */
  languageToolOpen: boolean;
  /**
   * The project key (sourceLabel) currently open in the project view. Lives
   * here so the sidebar folder click + a future Cmd+K project command both
   * route into the same surface without each having to thread state down.
   */
  currentProjectKey: string | null;
  /**
   * One-shot: open the new-session 기록에서 불러오기 browser when the start view
   * mounts. Set by the 소스 hub's "기록에서 불러오기" entry; StartSessionView
   * consumes and clears it so it fires once per request.
   */
  startRecordsRequest: boolean;
  /**
   * Which anchor agent the 기록에서 불러오기 request was made for. The 소스 hub
   * lets the user pick a specific agent before importing its records, so the
   * start view pre-selects it instead of always defaulting to Claude. `null`
   * means "no preference" and falls back to the first detection-capable agent.
   */
  startRecordsAgentId: AgentWorkAgentId | null;
  /** A record the global calendar asked 기록 to open; the workspace reads it
   *  once on mount and clears it. */
  openRecordId: string | null;
  /** Set when a global create action asked 기록 to start a new capture. */
  newRecordRequest: boolean;
  /** The project a requested new note should be filed under, when the request
   *  came from a project page. Null means the note is born unfiled. */
  newRecordProjectId: string | null;
  setCurrentView: (view: ViewKey) => void;
  setSelectedEventId: (eventId: string) => void;
  setHoveredEventId: (eventId: string | null) => void;
  toggleFilter: (lane: ActivityLaneId) => void;
  clearFilters: () => void;
  setSearchQuery: (query: string) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  /** Deep-link into Review focused on a specific issue / decision / next action. */
  openReviewItem: (selection: ReviewSelection) => void;
  clearReviewFocus: () => void;
  /**
   * Deep-link to a specific event in the 활동 timeline. Selects the event,
   * routes to the session workspace's 활동 tab, and arms a one-shot so the
   * timeline opens the 원본 stream with that event highlighted instead of the
   * AI 흐름 summary, which would not show the event at all.
   */
  focusTimelineEvent: (eventId: string) => void;
  clearTimelineFocus: () => void;
  /**
   * Deep-link to a source in the 자료 evidence hub, routing to the session
   * workspace's 자료 tab and arming a one-shot the Evidence Hub reads to open
   * that source's inspector. The 검토 → 자료 counterpart of `openReviewItem`.
   */
  openEvidenceSource: (sourceId: string) => void;
  clearEvidenceFocus: () => void;
  /** Deep-link into Project Memory with one accepted memory's drawer open. */
  openAcceptedMemory: (memoryId: string) => void;
  clearMemoryFocus: () => void;
  /**
   * Deep-link into the Evidence import drawer on a given tab. Routes to the
   * session workspace's 증거 tab and arms a one-shot the Evidence Hub reads.
   */
  requestEvidenceImport: (
    kind: EvidenceImportRequest["kind"],
    platform?: EvidenceImportRequest["platform"],
  ) => void;
  clearEvidenceImportRequest: () => void;
  setReviewTab: (tab: ReviewTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setMemoryTab: (tab: MemoryTab) => void;
  /**
   * Open the unified Session Detail workspace, optionally on a specific tab.
   * The single front door other surfaces use to route into a session — the
   * old `setCurrentView("timeline" | "evidence" | "review")` calls now flow
   * through here so a session always opens as one workspace, never a
   * standalone page.
   */
  openSession: (tab?: SessionTab) => void;
  setSessionTab: (tab: SessionTab) => void;
  /**
   * Navigate to a `ViewKey`, normalising the legacy session-surface keys
   * (`timeline` / `flow` / `evidence` / `review`) into the unified Session
   * Detail workspace on the matching tab. Surfaces that route by a dynamic
   * `ViewKey` (the Companion layer, deep links) should call this instead of
   * `setCurrentView` so they never land on a standalone page.
   */
  navigate: (view: ViewKey) => void;
  /** Open the settings sheet, optionally jumping to a specific page. */
  openSettingsSheet: (tab?: SettingsTab) => void;
  closeSettingsSheet: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openLanguageTool: () => void;
  closeLanguageTool: () => void;
  toggleCommandPalette: () => void;
  /**
   * Open the project workspace for a given project key (sourceLabel). The
   * sidebar folder header calls this; future producers (Cmd+K, deep links)
   * route through the same action so the surface only has one front door.
   */
  openProject: (projectKey: string) => void;
  /**
   * From the 소스 hub: route to the new-session flow with the 기록에서 불러오기
   * browser armed, optionally pre-selecting the agent the user picked.
   */
  requestStartRecords: (agentId?: AgentWorkAgentId) => void;
  clearStartRecordsRequest: () => void;
  /** Opens 기록 with a specific record selected (from the global calendar). */
  openRecordInLedger: (recordId: string) => void;
  clearOpenRecord: () => void;
  /** Opens 기록 and starts a new capture (the global create action). */
  requestNewRecord: (projectId?: string) => void;
  clearNewRecordRequest: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  currentView: "home",
  selectedEventId: "evt-positioning",
  hoveredEventId: null,
  activeFilters: [],
  searchQuery: "",
  // Default the timeline inspector to collapsed — keeps the workspace
  // single-column on first paint so a session opens calm. The user expands
  // it on demand from the toolbar toggle; selecting an event also opens it.
  inspectorCollapsed: true,
  reviewFocus: null,
  memoryFocus: null,
  evidenceImportRequest: null,
  timelineFocus: null,
  evidenceFocus: null,
  reviewTab: "issues",
  sessionTab: "overview",
  settingsTab: "profile",
  memoryTab: "overview",
  settingsSheetOpen: false,
  commandPaletteOpen: false,
  languageToolOpen: false,
  currentProjectKey: null,
  startRecordsRequest: false,
  startRecordsAgentId: null,
  openRecordId: null,
  newRecordRequest: false,
  newRecordProjectId: null,
  setCurrentView: (currentView) => set({ currentView }),
  // Selecting an event auto-expands the timeline inspector — picking an event
  // is the exact intent the inspector serves, so the user never has to also
  // hit the toolbar toggle to actually see what they clicked.
  setSelectedEventId: (selectedEventId) =>
    set({ selectedEventId, inspectorCollapsed: false }),
  setHoveredEventId: (hoveredEventId) => set({ hoveredEventId }),
  toggleFilter: (lane) =>
    set((state) => ({
      activeFilters: state.activeFilters.includes(lane)
        ? state.activeFilters.filter((value) => value !== lane)
        : [...state.activeFilters, lane],
    })),
  clearFilters: () => set({ activeFilters: [] }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
  openReviewItem: (selection) =>
    set({ reviewFocus: selection, currentView: "session", sessionTab: "analysis" }),
  clearReviewFocus: () => set({ reviewFocus: null }),
  focusTimelineEvent: (eventId) =>
    set({
      selectedEventId: eventId,
      inspectorCollapsed: false,
      timelineFocus: { eventId },
      currentView: "session",
      sessionTab: "flow",
    }),
  clearTimelineFocus: () => set({ timelineFocus: null }),
  openEvidenceSource: (sourceId) =>
    set({
      evidenceFocus: { sourceId },
      currentView: "session",
      sessionTab: "analysis",
    }),
  clearEvidenceFocus: () => set({ evidenceFocus: null }),
  openAcceptedMemory: (memoryId) =>
    set({ memoryFocus: { memoryId }, currentView: "memory" }),
  clearMemoryFocus: () => set({ memoryFocus: null }),
  requestEvidenceImport: (kind, platform) =>
    set({
      evidenceImportRequest: { kind, platform },
      currentView: "session",
      sessionTab: "analysis",
    }),
  clearEvidenceImportRequest: () => set({ evidenceImportRequest: null }),
  setReviewTab: (reviewTab) => set({ reviewTab }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setMemoryTab: (memoryTab) => set({ memoryTab }),
  openSession: (tab) =>
    set(tab ? { currentView: "session", sessionTab: tab } : { currentView: "session" }),
  setSessionTab: (sessionTab) => set({ sessionTab }),
  navigate: (view) =>
    set(() => {
      switch (view) {
        case "today":
        case "trackers":
        case "captureInbox":
          // The ledger lenses unified into one 기록 workspace; legacy keys
          // resolve there so existing deep links keep working.
          return { currentView: "ledger" };
        case "timeline":
        case "flow":
          return { currentView: "session", sessionTab: "flow" };
        case "evidence":
          return { currentView: "session", sessionTab: "analysis" };
        case "review":
          return { currentView: "session", sessionTab: "analysis" };
        case "reports":
          // The per-session report / handoff outputs live in their own 리포트 tab.
          return { currentView: "session", sessionTab: "report" };
        case "consolidation":
          // Consolidation is cross-session — it lives in Memory's 통합 segment.
          return { currentView: "memory", memoryTab: "consolidation" };
        case "settings":
        case "profile":
          // Settings + profile now live behind the user button as a sheet;
          // a legacy `navigate("settings")` opens the sheet instead of routing
          // to a standalone page so existing deep links keep working.
          return {
            settingsSheetOpen: true,
            settingsTab: view === "profile" ? "profile" : "localAi",
          };
        case "connections":
          // 연동 is no longer a standalone screen: connection management lives
          // in the settings sheet. Every "연동 열기" entry point opens it there.
          return { settingsSheetOpen: true, settingsTab: "connections" };
        default:
          return { currentView: view };
      }
    }),
  openSettingsSheet: (tab) =>
    set(tab ? { settingsSheetOpen: true, settingsTab: tab } : { settingsSheetOpen: true }),
  closeSettingsSheet: () => set({ settingsSheetOpen: false }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  // Opening the tool always closes the palette, so the two never stack.
  openLanguageTool: () => set({ languageToolOpen: true, commandPaletteOpen: false }),
  closeLanguageTool: () => set({ languageToolOpen: false }),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  openProject: (projectKey) =>
    set({ currentView: "project", currentProjectKey: projectKey }),
  requestStartRecords: (agentId) =>
    set({
      currentView: "start",
      startRecordsRequest: true,
      startRecordsAgentId: agentId ?? null,
    }),
  clearStartRecordsRequest: () =>
    set({ startRecordsRequest: false, startRecordsAgentId: null }),
  openRecordInLedger: (recordId) => set({ currentView: "ledger", openRecordId: recordId }),
  clearOpenRecord: () => set({ openRecordId: null }),
  requestNewRecord: (projectId) =>
    set({ currentView: "ledger", newRecordRequest: true, newRecordProjectId: projectId ?? null }),
  clearNewRecordRequest: () => set({ newRecordRequest: false }),
}));
