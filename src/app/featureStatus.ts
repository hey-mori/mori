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
  | "settings.themeSwitcher"
  | "settings.privacy.policy"
  // ─────────────────────── Surface-level rollups ─────────────────────
  // These ids exist so dashboards / docs / status strips can report
  // "is this whole surface live?" without enumerating every
  // sub-capability. They mirror the brief's rollup catalogue.
  | "rollup.aiTranscriptImport"
  | "rollup.gitDiffImport"
  | "rollup.manualNoteImport"
  | "rollup.urlImport"
  | "rollup.repositoryMetadata"
  | "rollup.importReview"
  | "rollup.timeline"
  | "rollup.flowFocus"
  | "rollup.reviewWorkspace"
  | "rollup.reportsMarkdown"
  | "rollup.reportsPdf"
  | "rollup.reportsHtml"
  | "rollup.projectMemoryCurrentSession"
  | "rollup.projectMemoryCrossSession"
  | "rollup.sqlitePersistence"
  | "rollup.moriPackageExport"
  | "rollup.moriPackageImport"
  | "rollup.themeSystem"
  // ─────────────────────── Connector capabilities ────────────────────
  // Mirrors `src/lib/connectors/captureSurfaces.ts`. These rows are how
  // the UI honestly states "Claude Code hook is docs-template-only" etc.
  | "connector.claudeCodeHook"
  | "connector.codexCliWrapper"
  | "connector.claudeDesktopImport"
  | "connector.codexDesktopImport"
  | "connector.vscodeExtension"
  | "connector.cursorExtension"
  | "connector.terminalShellIntegration"
  | "connector.browserExtension"
  | "connector.githubPrImport"
  | "connector.fileDocumentImport";

/**
 * One capability row.
 *
 * `actionEnabled` is the boolean components should bind to. `disabledReason`
 * is the tooltip components should render when `actionEnabled === false`.
 */
export type FeatureRuntimeRequirement = "any" | "desktop" | "browser";

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
  /**
   * Runtime gate. `desktop` means the row is only truly active inside the
   * Tauri shell (e.g. SQLite, Tauri Git diff). Callers can downgrade the
   * status to `unavailable` when running in the browser build via
   * `getFeatureControlPropsInRuntime`.
   */
  runtime?: FeatureRuntimeRequirement;
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
  { id: "appShell.endSession", label: "End session", status: "implemented", description: "Finalise the active session and mark it ended; report export stays an explicit step on the Reports surface." },
  { id: "appShell.sidebarCollapse", label: "Collapse sidebar", status: PLANNED, description: "Hide the sidebar to widen the workspace.", disabledReason: "Sidebar collapse is part of the responsive shell milestone." },
  // ─────────────────────────── Evidence ──────────────────────────
  { id: "evidence.addSource.manualNote", label: "Manual note import", status: "implemented", description: "Paste arbitrary text as a verified source." },
  { id: "evidence.addSource.urlImport", label: "URL import", status: "implemented", description: "Add a URL with optional excerpt." },
  { id: "evidence.addSource.aiTranscriptPaste", label: "AI transcript paste", status: "implemented", description: "Paste a Claude / Codex / ChatGPT transcript." },
  { id: "evidence.addSource.gitDiffPaste", label: "Git diff paste", status: "implemented", description: "Paste a unified git diff as a source." },
  { id: "evidence.addSource.tauriGitDiff", label: "Tauri Git diff capture", status: "implemented", description: "Capture git diff against a saved repo path.", disabledReason: "Requires the desktop runtime (Tauri)." },
  { id: "evidence.addSource.connectorJsonl", label: "Connector JSONL import", status: "implemented", description: "Import the JSONL produced by the Claude Code hook, Codex CLI wrapper, terminal, or git connector tools via paste in Evidence Hub." },
  { id: "evidence.removeImport", label: "Remove import", status: "implemented", description: "Delete an imported source from the session." },
  { id: "evidence.runQuickPass", label: "Run Quick Pass", status: "implemented", description: "Run the Quick Pass analysis against imported sources." },
  // ─────────────────────────── Review ────────────────────────────
  { id: "review.statusChange", label: "Change issue status", status: "implemented", description: "Move issues across Open / In-Progress / Resolved / Watching from the Review detail panel." },
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
  { id: "settings.themeSwitcher", label: "Theme switcher", status: "implemented", description: "Local runtime theme switching between the formal and forest token sets." },
  { id: "settings.privacy.policy", label: "Privacy policy display", status: "implemented", description: "Read-only status cards for Mori's privacy guarantees." },
  // ────────────────────────── Surface-level rollups ──────────────────
  { id: "rollup.aiTranscriptImport", label: "AI transcript import", status: "implemented", description: "Paste Claude / ChatGPT / Codex / Other AI transcripts." },
  { id: "rollup.gitDiffImport", label: "Git diff import", status: "implemented", description: "Paste a git diff or capture against a saved repo via Tauri." },
  { id: "rollup.manualNoteImport", label: "Manual note import", status: "implemented", description: "Paste arbitrary text as a verified source." },
  { id: "rollup.urlImport", label: "URL import", status: "implemented", description: "Add a URL with an optional excerpt." },
  { id: "rollup.repositoryMetadata", label: "Repository metadata", status: "implemented", description: "Saved repository paths used to scope Tauri Git diff capture.", runtime: "desktop" },
  { id: "rollup.importReview", label: "Import Review", status: "implemented", description: "Accept / discard / edit imported candidates before applying." },
  { id: "rollup.timeline", label: "Timeline", status: "implemented", description: "Lane / ruler / Inspector / mini-map Timeline surface." },
  { id: "rollup.flowFocus", label: "Flow Focus", status: "partial", description: "Upstream / downstream trace view.", userFacingStatus: "Partial — manual relationship edits are still Planned." },
  { id: "rollup.reviewWorkspace", label: "Review workspace", status: "partial", description: "Issue Garden / Decision Log / Next Actions / Unresolved / Suggestions.", userFacingStatus: "Partial — issue status and Next Action completion write; edit / promote / decision confirmation are Planned." },
  { id: "rollup.reportsMarkdown", label: "Markdown reports", status: "implemented", description: "Copy or download report as Markdown." },
  { id: "rollup.reportsPdf", label: "PDF reports", status: PLANNED, description: "Render report as PDF.", disabledReason: "PDF export is a planned milestone." },
  { id: "rollup.reportsHtml", label: "HTML reports", status: PLANNED, description: "Render report as standalone HTML.", disabledReason: "HTML export is a planned milestone." },
  { id: "rollup.projectMemoryCurrentSession", label: "Project Memory — current session", status: "implemented", description: "Aggregate the active session into a project memory snapshot." },
  { id: "rollup.projectMemoryCrossSession", label: "Project Memory — cross-session", status: PLANNED, description: "Aggregate decisions / issues / evidence across multiple sessions.", disabledReason: "Cross-session aggregation depends on persistence completion (Planned)." },
  { id: "rollup.sqlitePersistence", label: "SQLite persistence", status: "implemented", description: "Persistent local SQLite store for sessions, imports, and analysis.", runtime: "desktop" },
  { id: "rollup.moriPackageExport", label: ".mori v0 package export", status: "implemented", description: "Serialise the session to a .mori v0 JSON package." },
  { id: "rollup.moriPackageImport", label: ".mori v0 package import", status: PLANNED, description: "Open a saved .mori v0 package back into a session.", disabledReason: "Reading .mori v0 packages back is a planned milestone." },
  { id: "rollup.themeSystem", label: "Theme system", status: "implemented", description: "Three-layer token system with a local runtime switcher for the formal and forest themes." },
  // ────────────────────────── Connector capabilities ─────────────────
  { id: "connector.claudeCodeHook", label: "Claude Code hook", status: "partial", description: "Local Claude Code hook script writes JSONL events; Mori imports them via Evidence Hub → Connector JSONL.", userFacingStatus: "Partial — template + JSONL import works; no live sync." },
  { id: "connector.codexCliWrapper", label: "Codex CLI wrapper", status: "partial", description: "Local Codex CLI wrapper writes JSONL events; Mori imports them via Evidence Hub → Connector JSONL.", userFacingStatus: "Partial — template + JSONL import works; no desktop/web capture." },
  { id: "connector.claudeDesktopImport", label: "Claude Desktop transcript import", status: PLANNED, description: "Manual transcript export → file import.", disabledReason: "Paste is implemented today via AI transcript import. File-based import is a planned milestone." },
  { id: "connector.codexDesktopImport", label: "Codex Desktop transcript import", status: PLANNED, description: "Manual Codex transcript export → file import.", disabledReason: "Paste is implemented today via AI transcript import. File-based import is a planned milestone." },
  { id: "connector.vscodeExtension", label: "VS Code extension", status: PLANNED, description: "Local VS Code extension emitting JSONL events.", disabledReason: "VS Code extension is a planned connector — Mori never silently reads editor state." },
  { id: "connector.cursorExtension", label: "Cursor extension", status: PLANNED, description: "Local Cursor extension emitting JSONL events.", disabledReason: "Cursor extension is a planned connector — Mori never silently reads editor state." },
  { id: "connector.terminalShellIntegration", label: "Terminal shell integration", status: "partial", description: "Local terminal hook emits JSONL command events; Mori imports them via Evidence Hub → Connector JSONL.", userFacingStatus: "Partial — JSONL import supports `terminalShell` / `terminal` events; the shell hook script is still a planned template." },
  { id: "connector.browserExtension", label: "Browser extension", status: PLANNED, description: "Per-site browser extension that adds explicit URLs to the session.", disabledReason: "Browser extension is a planned connector — Mori never silently reads tabs." },
  { id: "connector.githubPrImport", label: "GitHub PR import", status: PLANNED, description: "Manual PR description / diff / review paste.", disabledReason: "Paste is supported via the existing AI transcript + Git diff imports today; a dedicated GitHub PR connector is planned." },
  { id: "connector.fileDocumentImport", label: "File / document import", status: PLANNED, description: "Open a local file (Markdown / PDF / DOCX) as a manual source.", disabledReason: "File / document import is a planned milestone — paste is supported today." },
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

/**
 * Runtime-aware variant. When `currentRuntime` doesn't satisfy the feature's
 * `runtime` requirement, the props collapse to `unavailable` with a tooltip
 * that explains the runtime gate. Browser-mode users can therefore see SQLite
 * + Tauri Git diff rows without those rows pretending to be active.
 */
export function getFeatureControlPropsInRuntime(
  id: FeatureId,
  currentRuntime: "browser" | "desktop" | "unknown",
): FeatureControlProps {
  const feature = getFeature(id);
  const base = getFeatureControlProps(id);
  const required = feature.runtime ?? "any";
  if (required === "any" || currentRuntime === "unknown" || required === currentRuntime) {
    return base;
  }
  return {
    enabled: false,
    status: "unavailable",
    statusLabel: FEATURE_STATUS_LABEL.unavailable,
    tone: FEATURE_STATUS_TONE.unavailable,
    title: required === "desktop"
      ? "이 기능은 Tauri 데스크톱 앱에서만 활성화됩니다."
      : "이 기능은 브라우저 prototype 모드에서만 활성화됩니다.",
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
