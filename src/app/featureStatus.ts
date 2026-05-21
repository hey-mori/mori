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
  | "review.editDecision"
  | "review.confirmDecision"
  | "review.editNextAction"
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
  implemented: "사용 가능",
  partial: "부분 구현",
  planned: "예정",
  unavailable: "사용 불가",
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
  { id: "timeline.range.day", label: "Day range", status: PLANNED, description: "Day-aggregated timeline across sessions.", disabledReason: "일별 뷰는 여러 세션에 걸쳐 있어 예정 마일스톤입니다." },
  { id: "timeline.range.week", label: "Week range", status: PLANNED, description: "Week-aggregated timeline.", disabledReason: "주별 뷰는 세션 간 집계에 의존하며 예정 기능입니다." },
  { id: "timeline.zoom.in", label: "Zoom in", status: PLANNED, description: "Zoom the time axis in.", disabledReason: "시간 축 확대는 예정 기능입니다. 밀도 전환으로 조밀한 뷰를 사용하세요." },
  { id: "timeline.zoom.out", label: "Zoom out", status: PLANNED, description: "Zoom the time axis out.", disabledReason: "시간 축 축소는 예정 기능입니다. 밀도 전환으로 조밀한 뷰를 사용하세요." },
  { id: "timeline.activeLanesOnly", label: "Active lanes only", status: "implemented", description: "Hide lanes with zero events for a tighter rhythm." },
  { id: "timeline.inspector.flowTrace", label: "Flow trace", status: "implemented", description: "Open the selected event in Flow Focus." },
  { id: "timeline.inspector.copySummary", label: "Copy summary", status: "implemented", description: "Copy the event summary to clipboard." },
  { id: "timeline.inspector.editEvent", label: "Edit event", status: "implemented", description: "Inline edit of event title and summary in real sessions." },
  { id: "timeline.inspector.split", label: "Split event", status: "implemented", description: "Split a ranged Timeline event at its midpoint." },
  { id: "timeline.inspector.merge", label: "Merge event", status: "implemented", description: "Merge a Timeline event with its next chronological neighbour." },
  { id: "timeline.inspector.createIssue", label: "Create issue", status: "implemented", description: "Promote a Timeline event into a linked Review issue." },
  { id: "timeline.inspector.addNote", label: "Add note", status: "implemented", description: "Attach or edit a user note on a Timeline event." },
  { id: "timeline.inspector.memoSave", label: "Save event memo", status: "implemented", description: "Persist event memo corrections through the session import write path." },
  // ─────────────────────────── App shell ─────────────────────────
  { id: "appShell.endSession", label: "End session", status: "implemented", description: "Finalise the active session and mark it ended; report export stays an explicit step on the Reports surface." },
  { id: "appShell.sidebarCollapse", label: "Collapse sidebar", status: PLANNED, description: "Hide the sidebar to widen the workspace.", disabledReason: "사이드바 접기는 반응형 셸 마일스톤의 일부입니다." },
  // ─────────────────────────── Evidence ──────────────────────────
  { id: "evidence.addSource.manualNote", label: "Manual note import", status: "implemented", description: "Paste arbitrary text as a verified source." },
  { id: "evidence.addSource.urlImport", label: "URL import", status: "implemented", description: "Add a URL with optional excerpt." },
  { id: "evidence.addSource.aiTranscriptPaste", label: "AI transcript paste", status: "implemented", description: "Paste a Claude / Codex / ChatGPT transcript." },
  { id: "evidence.addSource.gitDiffPaste", label: "Git diff paste", status: "implemented", description: "Paste a unified git diff as a source." },
  { id: "evidence.addSource.tauriGitDiff", label: "Tauri Git diff capture", status: "implemented", description: "Capture git diff against a saved repo path.", disabledReason: "데스크톱 런타임(Tauri)이 필요합니다." },
  { id: "evidence.addSource.connectorJsonl", label: "Connector JSONL import", status: "implemented", description: "Import the JSONL produced by the Claude Code hook, Codex CLI wrapper, terminal, or git connector tools via paste in Evidence Hub." },
  { id: "evidence.removeImport", label: "Remove import", status: "implemented", description: "Delete an imported source from the session." },
  { id: "evidence.runQuickPass", label: "Run Quick Pass", status: "implemented", description: "Run the Quick Pass analysis against imported sources." },
  // ─────────────────────────── Review ────────────────────────────
  { id: "review.statusChange", label: "Change issue status", status: "implemented", description: "Move issues across Open / In-Progress / Resolved / Watching from the Review detail panel." },
  { id: "review.editIssue", label: "Edit issue", status: "implemented", description: "Inline edit issue title and description from the Review detail panel." },
  { id: "review.editDecision", label: "Edit decision", status: "implemented", description: "Inline edit decision title, decision text, and rationale from the Review detail panel." },
  { id: "review.confirmDecision", label: "Confirm / reject decision", status: "implemented", description: "Toggle decision confirmation state from the Review detail panel." },
  { id: "review.editNextAction", label: "Edit next action", status: "implemented", description: "Inline edit next action title from the Review detail panel." },
  { id: "review.promoteToNextAction", label: "Promote to next action", status: "implemented", description: "Promote a Review issue into a linked Next Action without duplicating an existing action." },
  // ─────────────────────────── Reports ───────────────────────────
  { id: "reports.export.markdown", label: "Copy / download Markdown", status: "implemented", description: "Render the report as Markdown and copy or download it." },
  { id: "reports.export.pdf", label: "PDF export", status: PLANNED, description: "Render the report as a PDF document.", disabledReason: "PDF 내보내기는 예정 마일스톤입니다." },
  { id: "reports.export.html", label: "HTML export", status: "implemented", description: "Render the report as a standalone, self-contained HTML document." },
  { id: "reports.export.moriPackage", label: "Export .mori v0 JSON", status: "implemented", description: "Serialise the session to a .mori v0 JSON package." },
  { id: "reports.copyResumePrompt", label: "Copy resume prompt", status: "implemented", description: "Copy the generated resume prompt." },
  { id: "reports.rerunQuickPass", label: "Re-run Quick Pass", status: "implemented", description: "Trigger a new Quick Pass run from the analysis strip." },
  // ─────────────────────────── Memory ────────────────────────────
  { id: "memory.crossSessionAggregation", label: "Cross-session memory aggregation", status: "implemented", description: "Aggregate decisions / issues / evidence across saved sessions via loadProjectMemorySessions." },
  { id: "memory.savedSessions", label: "Saved sessions list", status: "partial", description: "List sessions saved to browser draft or SQLite.", userFacingStatus: "부분 구현 — 목록만; 페이로드는 세션 단위." },
  { id: "memory.recurringIssues", label: "Recurring issues", status: "partial", description: "Surface high-signal open issues.", userFacingStatus: "현재 세션 내 휴리스틱만 적용." },
  { id: "memory.followUpPrompt", label: "Follow-up session prompt", status: "implemented", description: "Generate a follow-up prompt from the current memory." },
  // ─────────────────────────── Start Session ─────────────────────
  { id: "startSession.savePersistedDraft", label: "Save persisted draft", status: "implemented", description: "Persist the new session draft locally." },
  { id: "startSession.sourceTileSelection", label: "Source tile selection", status: "implemented", description: "Choose which sources to scope the session to. Selection is persisted in the session draft and restored on return." },
  // ─────────────────────────── Settings ──────────────────────────
  { id: "settings.localAi.deterministic", label: "Deterministic Quick Pass", status: "implemented", description: "Local heuristic Quick Pass — no LLM." },
  { id: "settings.localAi.ollama", label: "Ollama (Local LLM)", status: "implemented", description: "Quick Pass via a user-run Ollama instance." },
  { id: "settings.localAi.lmStudio", label: "LM Studio", status: PLANNED, description: "OpenAI-compatible endpoint via LM Studio.", disabledReason: "LM Studio 제공자는 예정 마일스톤입니다." },
  { id: "settings.localAi.openAiCompatible", label: "OpenAI-compatible endpoint", status: PLANNED, description: "Custom OpenAI-compatible local endpoint.", disabledReason: "커스텀 OpenAI 호환 제공자는 예정 마일스톤입니다." },
  { id: "settings.localAi.cloudApi", label: "Cloud API (opt-in)", status: PLANNED, description: "Explicit opt-in cloud API integration.", disabledReason: "Cloud API 연동은 명시적 옵트인이 필요한 예정 마일스톤입니다." },
  { id: "settings.storage.browserDraft", label: "Browser localStorage draft", status: "implemented", description: "Default storage for browser-mode sessions." },
  { id: "settings.storage.desktopSqlite", label: "Desktop SQLite", status: "implemented", description: "Persistent local SQLite store.", disabledReason: "데스크톱 런타임(Tauri)이 필요합니다." },
  { id: "settings.storage.moriPackageJson", label: ".mori v0 JSON package", status: "implemented", description: "Export the full session as JSON." },
  { id: "settings.storage.moriPackageZip", label: ".mori zip package", status: "implemented", description: "Zip package archiving all session slices via fflate. Export via Reports as .mori zip." },
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
  { id: "rollup.flowFocus", label: "Flow Focus", status: "partial", description: "Upstream / downstream trace view.", userFacingStatus: "부분 구현 — 수동 관계 편집은 예정." },
  { id: "rollup.reviewWorkspace", label: "Review workspace", status: "implemented", description: "Issue Garden / Decision Log / Next Actions / Unresolved / Suggestions. Issue / decision / next-action editing, status change, confirmation, completion toggle, and promotion all write through to session storage." },
  { id: "rollup.reportsMarkdown", label: "Markdown reports", status: "implemented", description: "Copy or download report as Markdown." },
  { id: "rollup.reportsPdf", label: "PDF reports", status: PLANNED, description: "Render report as PDF.", disabledReason: "PDF 내보내기는 예정 마일스톤입니다." },
  { id: "rollup.reportsHtml", label: "HTML reports", status: "implemented", description: "Render the report as a standalone, self-contained HTML document." },
  { id: "rollup.projectMemoryCurrentSession", label: "Project Memory — current session", status: "implemented", description: "Aggregate the active session into a project memory snapshot." },
  { id: "rollup.projectMemoryCrossSession", label: "Project Memory — cross-session", status: "implemented", description: "Aggregate decisions / issues / evidence across browser-saved and SQLite-saved sessions via buildProjectMemoryViewModel." },
  { id: "rollup.sqlitePersistence", label: "SQLite persistence", status: "implemented", description: "Persistent local SQLite store for sessions, imports, and analysis.", runtime: "desktop" },
  { id: "rollup.moriPackageExport", label: ".mori v0 package export", status: "implemented", description: "Serialise the session to a .mori v0 JSON package." },
  { id: "rollup.moriPackageImport", label: ".mori v0 package import", status: "partial", description: "Import accepted memories from a .mori v0 package via the Consolidation Review surface. Full session restoration is planned.", userFacingStatus: "부분 구현 — 통합 검토로 메모리 가져오기 지원; 전체 세션 복원은 예정." },
  { id: "rollup.themeSystem", label: "Theme system", status: "implemented", description: "Three-layer token system with a local runtime switcher for formal, forest, and Night Lake dark themes." },
  // ────────────────────────── Connector capabilities ─────────────────
  { id: "connector.claudeCodeHook", label: "Claude Code hook", status: "partial", description: "Local Claude Code hook script writes JSONL events; Mori imports them via Evidence Hub → Connector JSONL.", userFacingStatus: "Partial — template + JSONL import works; no live sync." },
  { id: "connector.codexCliWrapper", label: "Codex CLI wrapper", status: "partial", description: "Local Codex CLI wrapper writes JSONL events; Mori imports them via Evidence Hub → Connector JSONL.", userFacingStatus: "Partial — template + JSONL import works; no desktop/web capture." },
  { id: "connector.claudeDesktopImport", label: "Claude Desktop transcript import", status: PLANNED, description: "Manual transcript export → file import.", disabledReason: "현재는 AI 대화 붙여넣기로 사용 가능합니다. 파일 기반 가져오기는 예정 마일스톤입니다." },
  { id: "connector.codexDesktopImport", label: "Codex Desktop transcript import", status: PLANNED, description: "Manual Codex transcript export → file import.", disabledReason: "현재는 AI 대화 붙여넣기로 사용 가능합니다. 파일 기반 가져오기는 예정 마일스톤입니다." },
  { id: "connector.vscodeExtension", label: "VS Code extension", status: PLANNED, description: "Local VS Code extension emitting JSONL events.", disabledReason: "VS Code 확장은 예정 connector입니다 — Mori는 에디터 상태를 자동으로 읽지 않습니다." },
  { id: "connector.cursorExtension", label: "Cursor extension", status: PLANNED, description: "Local Cursor extension emitting JSONL events.", disabledReason: "Cursor 확장은 예정 connector입니다 — Mori는 에디터 상태를 자동으로 읽지 않습니다." },
  { id: "connector.terminalShellIntegration", label: "Terminal shell integration", status: "partial", description: "Local terminal hook emits JSONL command events; Mori imports them via Evidence Hub → Connector JSONL.", userFacingStatus: "부분 구현 — JSONL 가져오기 지원; 셸 훅 스크립트는 예정 템플릿." },
  { id: "connector.browserExtension", label: "Browser extension", status: PLANNED, description: "Per-site browser extension that adds explicit URLs to the session.", disabledReason: "브라우저 확장은 예정 connector입니다 — Mori는 탭을 자동으로 읽지 않습니다." },
  { id: "connector.githubPrImport", label: "GitHub PR import", status: PLANNED, description: "Manual PR description / diff / review paste.", disabledReason: "현재는 AI 대화 + Git diff 붙여넣기로 사용 가능합니다. 전용 GitHub PR connector는 예정입니다." },
  { id: "connector.fileDocumentImport", label: "File / document import", status: PLANNED, description: "Open a local file (Markdown / PDF / DOCX) as a manual source.", disabledReason: "파일 / 문서 가져오기는 예정 마일스톤입니다 — 붙여넣기는 현재 지원됩니다." },
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
