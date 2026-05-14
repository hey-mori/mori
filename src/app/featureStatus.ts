/**
 * Mori feature status registry — the single source of truth for which
 * product capabilities are real today, partial, planned, or unavailable in
 * the current runtime.
 *
 * The Timeline / Inspector already had a typed registry
 * (`src/lib/timeline/timelineControls.ts`). This module generalises the same
 * shape across every feature surface (Evidence Hub, Settings, Reports,
 * Memory, Start Session, Review) so:
 *
 *   1. UI components stop hand-rolling planned tooltips and disabled flags.
 *   2. Docs and tests can assert the catalogue in one place.
 *   3. New features have an obvious home for their status row.
 *
 * Honesty contract (mirrors the Timeline-controls one):
 *   - `implemented` capabilities always render active.
 *   - `partial` capabilities render active with a status badge that
 *     surfaces what is missing.
 *   - `planned` capabilities render disabled with the registry's
 *     `disabledReason` as their tooltip. They are never hidden — Mori
 *     keeps the surface legible.
 *   - `unavailable` capabilities are runtime-blocked (e.g. desktop-only
 *     features in the browser build). They render disabled with the
 *     runtime explanation.
 */

export type FeatureStatus = "implemented" | "partial" | "planned" | "unavailable";

/**
 * Every capability id is namespaced `surface.capability` so search /
 * grep stays predictable and we avoid identifier collisions across
 * feature folders.
 */
export type FeatureId =
  // Timeline
  | "timeline.density"
  | "timeline.filter"
  | "timeline.search"
  | "timeline.range.session"
  | "timeline.range.day"
  | "timeline.range.week"
  | "timeline.zoom.in"
  | "timeline.zoom.out"
  | "timeline.activeLanesOnly"
  | "timeline.inspector.flowTrace"
  | "timeline.inspector.copySummary"
  | "timeline.inspector.editEvent"
  | "timeline.inspector.split"
  | "timeline.inspector.merge"
  | "timeline.inspector.createIssue"
  | "timeline.inspector.addNote"
  | "timeline.inspector.memoSave"
  // App shell
  | "appShell.endSession"
  | "appShell.sidebarCollapse"
  // Evidence Hub
  | "evidence.addSource.manualNote"
  | "evidence.addSource.urlImport"
  | "evidence.addSource.aiTranscriptPaste"
  | "evidence.addSource.gitDiffPaste"
  | "evidence.addSource.tauriGitDiff"
  | "evidence.addSource.connectorJsonl"
  | "evidence.removeImport"
  | "evidence.runQuickPass"
  // Review
  | "review.statusChange"
  | "review.editIssue"
  | "review.confirmDecision"
  | "review.promoteToNextAction"
  // Reports
  | "reports.export.markdown"
  | "reports.export.pdf"
  | "reports.export.html"
  | "reports.export.moriPackage"
  | "reports.copyResumePrompt"
  | "reports.rerunQuickPass"
  // Memory
  | "memory.crossSessionAggregation"
  | "memory.savedSessions"
  | "memory.recurringIssues"
  | "memory.followUpPrompt"
  // Start Session
  | "startSession.savePersistedDraft"
  | "startSession.sourceTileSelection"
  // Settings
  | "settings.localAi.deterministic"
  | "settings.localAi.ollama"
  | "settings.localAi.lmStudio"
  | "settings.localAi.openAiCompatible"
  | "settings.localAi.cloudApi"
  | "settings.storage.browserDraft"
  | "settings.storage.desktopSqlite"
  | "settings.storage.moriPackageJson"
  | "settings.storage.moriPackageZip"
  | "settings.repositories.crud"
  | "settings.themeSwitcher";

/**
 * One capability row.
 *
 * `actionEnabled` is the boolean components should bind to. `disabledReason`
 * is the tooltip components should render when `actionEnabled === false`.
 */
export type FeatureCapability = {
  id: FeatureId;
  label: string;
  status: FeatureStatus;
  description: string;
  /** Short user-facing status copy. Defaults to status-derived label. */
  userFacingStatus?: string;
  /** True only when status === implemented and runtime allows it. */
  actionEnabled: boolean;
  /** Tooltip used when actionEnabled is false. */
  disabledReason?: string;
  /** Optional concrete next step (e.g. "Run Quick Pass on Reports"). */
  nextStep?: string;
  /** Optional doc path that explains the capability in depth. */
  docsPath?: string;
};

/**
 * Default label per status. UI components can override via `userFacingStatus`.
 */
export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  implemented: "Available",
  partial: "Partial",
  planned: "Planned",
  unavailable: "Unavailable",
};

export const FEATURE_STATUS_TONE: Record<FeatureStatus, "green" | "blue" | "orange" | "gray"> = {
  implemented: "green",
  partial: "blue",
  planned: "orange",
  unavailable: "gray",
};

const PLANNED = "planned" as const;

/**
 * The registry. Keep these rows alphabetised within each surface block so
 * diffs stay tidy when new capabilities land.
 */
const REGISTRY_DATA: Array<Omit<FeatureCapability, "actionEnabled">> = [
  // ────────────────────────── Timeline ───────────────────────────
  { id: "timeline.density", label: "Comfortable / Compact density", status: "implemented", description: "Toggle between roomy and dense Timeline cards." },
  { id: "timeline.filter", label: "Category filter", status: "implemented", description: "Filter lanes by event type via the toolbar popover." },
  { id: "timeline.search", label: "Event search", status: "implemented", description: "Substring search on event titles + summaries." },
  { id: "timeline.range.session", label: "Session range", status: "implemented", description: "Show only the current session's timeline." },
  { id: "timeline.range.day", label: "Day range", status: PLANNED, description: "Day-aggregated timeline across sessions.", disabledReason: "Day view spans multiple sessions and is a planned milestone." },
  { id: "timeline.range.week", label: "Week range", status: PLANNED, description: "Week-aggregated timeline.", disabledReason: "Week view depends on cross-session aggregation (Planned)." },
  { id: "timeline.zoom.in", label: "Zoom in", status: PLANNED, description: "Zoom the time axis in.", disabledReason: "Time-scale zoom is planned. Switch density for a denser scan view." },
  { id: "timeline.zoom.out", label: "Zoom out", status: PLANNED, description: "Zoom the time axis out.", disabledReason: "Time-scale zoom is planned. Switch density for a denser scan view." },
  { id: "timeline.activeLanesOnly", label: "Active lanes only", status: "implemented", description: "Hide lanes with zero events for a tighter rhythm." },
  { id: "timeline.inspector.flowTrace", label: "Flow trace", status: "implemented", description: "Open the selected event in Flow Focus." },
  { id: "timeline.inspector.copySummary", label: "Copy summary", status: "implemented", description: "Copy the event summary to clipboard." },
  { id: "timeline.inspector.editEvent", label: "Edit event", status: PLANNED, description: "Inline edit of event title / summary / type.", disabledReason: "Direct event editing depends on the correction milestone." },
  { id: "timeline.inspector.split", label: "Split event", status: PLANNED, description: "Split a long event into two.", disabledReason: "Splitting events depends on the event-correction milestone." },
  { id: "timeline.inspector.merge", label: "Merge event", status: PLANNED, description: "Merge two related events.", disabledReason: "Merging events depends on the event-correction milestone." },
  { id: "timeline.inspector.createIssue", label: "Create issue", status: PLANNED, description: "Promote an event to a new issue.", disabledReason: "Manual issue creation is part of the Review write surface." },
  { id: "timeline.inspector.addNote", label: "Add note", status: PLANNED, description: "Attach a note to the event.", disabledReason: "Inspector notes depend on the correction milestone." },
  { id: "timeline.inspector.memoSave", label: "Save event memo", status: PLANNED, description: "Persist memo corrections.", disabledReason: "Saving corrections is a planned persistence milestone." },
  // ─────────────────────────── App shell ─────────────────────────
  { id: "appShell.endSession", label: "End session", status: PLANNED, description: "Finalise the session, write report, mark ended.", disabledReason: "Session end + final report writeback is a planned persistence milestone." },
  { id: "appShell.sidebarCollapse", label: "Collapse sidebar", status: PLANNED, description: "Hide the sidebar to widen the workspace.", disabledReason: "Sidebar collapse is part of the responsive shell milestone." },
  // ─────────────────────────── Evidence ──────────────────────────
  { id: "evidence.addSource.manualNote", label: "Manual note import", status: "implemented", description: "Paste arbitrary text as a verified source." },
  { id: "evidence.addSource.urlImport", label: "URL import", status: "implemented", description: "Add a URL with optional excerpt." },
  { id: "evidence.addSource.aiTranscriptPaste", label: "AI transcript paste", status: "implemented", description: "Paste a Claude / Codex / ChatGPT transcript." },
  { id: "evidence.addSource.gitDiffPaste", label: "Git diff paste", status: "implemented", description: "Paste a unified git diff as a source." },
  { id: "evidence.addSource.tauriGitDiff", label: "Tauri Git diff capture", status: "implemented", description: "Capture git diff against a saved repo path.", disabledReason: "Requires the desktop runtime (Tauri)." },
  { id: "evidence.addSource.connectorJsonl", label: "Connector JSONL import", status: PLANNED, description: "Import the JSONL inbox written by the Claude Code hook + Codex CLI wrapper.", disabledReason: "Connector JSONL ingest UI is a planned milestone." },
  { id: "evidence.removeImport", label: "Remove import", status: "implemented", description: "Delete an imported source from the session." },
  { id: "evidence.runQuickPass", label: "Run Quick Pass", status: "implemented", description: "Run the Quick Pass analysis against imported sources." },
  // ─────────────────────────── Review ────────────────────────────
  { id: "review.statusChange", label: "Change issue status", status: PLANNED, description: "Move issues across Open / In-Progress / Resolved / Watching.", disabledReason: "Issue status writes are part of the Review write milestone." },
  { id: "review.editIssue", label: "Edit issue / decision", status: PLANNED, description: "Inline edit issue or decision fields.", disabledReason: "Editing in Review is part of the Review write milestone." },
  { id: "review.confirmDecision", label: "Confirm / reject decision", status: PLANNED, description: "Toggle decision confirmation state.", disabledReason: "Decision confirmation writes are part of the Review write milestone." },
  { id: "review.promoteToNextAction", label: "Promote to next action", status: PLANNED, description: "Promote an issue to a Next Action.", disabledReason: "Promoting to Next Action is part of the Review write milestone." },
  // ─────────────────────────── Reports ───────────────────────────
  { id: "reports.export.markdown", label: "Copy / download Markdown", status: "implemented", description: "Render the report as Markdown and copy or download it." },
  { id: "reports.export.pdf", label: "PDF export", status: PLANNED, description: "Render the report as a PDF document.", disabledReason: "PDF export is a planned milestone." },
  { id: "reports.export.html", label: "HTML export", status: PLANNED, description: "Render the report as a standalone HTML document.", disabledReason: "HTML export is a planned milestone." },
  { id: "reports.export.moriPackage", label: "Export .mori v0 JSON", status: "implemented", description: "Serialise the session to a .mori v0 JSON package." },
  { id: "reports.copyResumePrompt", label: "Copy resume prompt", status: "implemented", description: "Copy the generated resume prompt." },
  { id: "reports.rerunQuickPass", label: "Re-run Quick Pass", status: "implemented", description: "Trigger a new Quick Pass run from the analysis strip." },
  // ─────────────────────────── Memory ────────────────────────────
  { id: "memory.crossSessionAggregation", label: "Cross-session memory aggregation", status: PLANNED, description: "Aggregate decisions / issues / evidence across saved sessions.", disabledReason: "Cross-session aggregation depends on the persistence completion milestone." },
  { id: "memory.savedSessions", label: "Saved sessions list", status: "partial", description: "List sessions saved to browser draft or SQLite.", userFacingStatus: "Partial — list only; payloads stay per-session." },
  { id: "memory.recurringIssues", label: "Recurring issues", status: "partial", description: "Surface high-signal open issues.", userFacingStatus: "Heuristic within the current session only." },
  { id: "memory.followUpPrompt", label: "Follow-up session prompt", status: "implemented", description: "Generate a follow-up prompt from the current memory." },
  // ─────────────────────────── Start Session ─────────────────────
  { id: "startSession.savePersistedDraft", label: "Save persisted draft", status: "implemented", description: "Persist the new session draft locally." },
  { id: "startSession.sourceTileSelection", label: "Source tile selection", status: "partial", description: "Choose which sources to scope the session to.", userFacingStatus: "Partial — tile state not yet persisted." },
  // ─────────────────────────── Settings ──────────────────────────
  { id: "settings.localAi.deterministic", label: "Deterministic Quick Pass", status: "implemented", description: "Local heuristic Quick Pass — no LLM." },
  { id: "settings.localAi.ollama", label: "Ollama (Local LLM)", status: "implemented", description: "Quick Pass via a user-run Ollama instance." },
  { id: "settings.localAi.lmStudio", label: "LM Studio", status: PLANNED, description: "OpenAI-compatible endpoint via LM Studio.", disabledReason: "LM Studio provider is a planned milestone." },
  { id: "settings.localAi.openAiCompatible", label: "OpenAI-compatible endpoint", status: PLANNED, description: "Custom OpenAI-compatible local endpoint.", disabledReason: "Custom OpenAI-compatible provider is a planned milestone." },
  { id: "settings.localAi.cloudApi", label: "Cloud API (opt-in)", status: PLANNED, description: "Explicit opt-in cloud API integration.", disabledReason: "Cloud API integration is intentionally a planned milestone — requires explicit opt-in." },
  { id: "settings.storage.browserDraft", label: "Browser localStorage draft", status: "implemented", description: "Default storage for browser-mode sessions." },
  { id: "settings.storage.desktopSqlite", label: "Desktop SQLite", status: "implemented", description: "Persistent local SQLite store.", disabledReason: "Requires the desktop runtime (Tauri)." },
  { id: "settings.storage.moriPackageJson", label: ".mori v0 JSON package", status: "implemented", description: "Export the full session as JSON." },
  { id: "settings.storage.moriPackageZip", label: ".mori zip package", status: PLANNED, description: "Zip package bundling Markdown + assets.", disabledReason: ".mori zip package is a planned milestone (only JSON exists today)." },
  { id: "settings.repositories.crud", label: "Repository CRUD", status: "implemented", description: "Add, verify, label, and delete saved repository paths." },
  { id: "settings.themeSwitcher", label: "Theme switcher", status: PLANNED, description: "Visual theme switching.", disabledReason: "Theme tokens exist but the runtime switcher is a planned milestone." },
];

function buildRegistry(): Record<FeatureId, FeatureCapability> {
  const out = {} as Record<FeatureId, FeatureCapability>;
  for (const row of REGISTRY_DATA) {
    out[row.id] = {
      ...row,
      actionEnabled: row.status === "implemented" || row.status === "partial",
    };
  }
  return out;
}

/**
 * Frozen catalogue. Consumers should never mutate.
 */
export const FEATURE_REGISTRY: Readonly<Record<FeatureId, FeatureCapability>> =
  Object.freeze(buildRegistry());

/**
 * Lookup a capability by id. Throws in dev if the id is unknown so a typo
 * doesn't silently render a button as "enabled".
 */
export function getFeature(id: FeatureId): FeatureCapability {
  const row = FEATURE_REGISTRY[id];
  if (!row) {
    throw new Error(`Unknown feature id: ${id}`);
  }
  return row;
}

/**
 * Convenience helper for components. Returns the props your button or row
 * needs to render with consistent honest copy.
 */
export type FeatureControlProps = {
  enabled: boolean;
  status: FeatureStatus;
  statusLabel: string;
  tone: "green" | "blue" | "orange" | "gray";
  title: string | undefined;
  nextStep: string | undefined;
};

export function getFeatureControlProps(id: FeatureId): FeatureControlProps {
  const feature = getFeature(id);
  return {
    enabled: feature.actionEnabled,
    status: feature.status,
    statusLabel: feature.userFacingStatus ?? FEATURE_STATUS_LABEL[feature.status],
    tone: FEATURE_STATUS_TONE[feature.status],
    title: feature.actionEnabled ? undefined : feature.disabledReason ?? FEATURE_STATUS_LABEL[feature.status],
    nextStep: feature.nextStep,
  };
}

export function listFeaturesByStatus(status: FeatureStatus): FeatureCapability[] {
  return Object.values(FEATURE_REGISTRY).filter((row) => row.status === status);
}

export function listFeaturesBySurfacePrefix(prefix: string): FeatureCapability[] {
  return Object.values(FEATURE_REGISTRY).filter((row) => row.id.startsWith(`${prefix}.`));
}

export function countFeaturesByStatus(): Record<FeatureStatus, number> {
  const counts: Record<FeatureStatus, number> = {
    implemented: 0,
    partial: 0,
    planned: 0,
    unavailable: 0,
  };
  for (const row of Object.values(FEATURE_REGISTRY)) {
    counts[row.status] += 1;
  }
  return counts;
}
