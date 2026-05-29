/**
 * Project Memory view-model builder.
 *
 * Pure derivation. Inputs:
 *   - active session view (always present),
 *   - saved-session metadata from browser localStorage,
 *   - saved-session metadata from desktop SQLite,
 *   - stored connector imports per session (browser localStorage only),
 *   - stored .mori packages (browser localStorage today).
 *
 * Output:
 *   - `ProjectMemoryViewModel` keyed by what's actually aggregated, so
 *     the UI never claims reach it doesn't have.
 *
 * Honesty rules:
 *   - Old imports without `connectorEventId`/`importSummary` never feed
 *     the re-import rollup.
 *   - Saved-session bodies are never assumed to be loaded — `keyDecisions`
 *     / `recurringIssues` / `keyEvidence` stay scoped to the active
 *     session and a warning surfaces the planned-state for cross-session
 *     decision/issue aggregation.
 *   - SQLite-only sessions are listed as metadata; their import summaries
 *     are not accessible today, so they contribute nothing to the
 *     re-import rollup.
 *   - Demo mode collapses to a single banner and the active-session view.
 */
import type { MockSession } from "../../domain/types";
import type {
  ConnectorEventKind,
  ConnectorId,
  ConnectorSourceImportSummary,
} from "../connectors";
import { getReportEvidenceSummary } from "../sources/traceability";
import type { SqliteSessionListEntry } from "../sqlite/repositoryContracts";
import type {
  StoredMoriPackageDraft,
  StoredSessionImport,
  StoredSessionSummary,
} from "../storage/storageTypes";
import {
  describeProjectMemoryDataBasis,
  emptyProjectMemoryViewModel,
  mapStoredImportToReimportItem,
  type ProjectMemoryDataBasis,
  type ProjectMemoryKeyDecision,
  type ProjectMemoryKeyEvidence,
  type ProjectMemoryLoadedSession,
  type ProjectMemoryMatchedSession,
  type ProjectMemoryMoriPackage,
  type ProjectMemoryRecurringIssue,
  type ProjectMemoryReimportItem,
  type ProjectMemoryReimportSummary,
  type ProjectMemorySavedReport,
  type ProjectMemorySessionSource,
  type ProjectMemorySessionSummary,
  type ProjectMemorySummaryStats,
  type ProjectMemoryUnresolvedRisk,
  type ProjectMemoryViewModel,
  type ProjectMemoryWarning,
} from "./projectMemoryModel";
import {
  aggregateCounters,
  aggregateKeyDecisions,
  aggregateKeyEvidence,
  aggregateRecurringIssues,
  aggregateUnresolvedRisks,
  pickRecommendedNextSession,
} from "./crossSessionAggregation";

export type BuildProjectMemoryViewModelInput = {
  /** Always present — the live session. */
  view: MockSession;
  /** `"demo"` collapses to active-only state regardless of saved data. */
  mode: "demo" | "draft";
  /** Whether Quick Pass has produced an analysis result for the active session. */
  hasAnalysis: boolean;
  /** Saved sessions from browser localStorage (metadata only). */
  savedBrowserSessions?: StoredSessionSummary[];
  /** Saved sessions from desktop SQLite (metadata only — payloads not loaded). */
  savedSqliteSessions?: SqliteSessionListEntry[];
  /**
   * Stored connector imports keyed by `sessionId`. Today this is only
   * available via the browser localStorage adapter; SQLite-only sessions
   * appear without imports.
   */
  importsBySessionId?: Record<string, StoredSessionImport[]>;
  /** Stored `.mori v0` packages the user has exported / saved. */
  moriPackages?: StoredMoriPackageDraft[];
  /** Set to `false` when no storage backend is reachable in this runtime. */
  storageAvailable?: boolean;
  /**
   * Saved-session bodies the caller has already loaded (via
   * `loadProjectMemorySessions`). When non-empty, the builder
   * aggregates `keyDecisions`/`recurringIssues`/`keyEvidence`/
   * `unresolvedRisks` from across these sessions instead of falling
   * back to active-session-only derivation. Sessions with
   * `loadStatus !== "loaded"` are counted for warnings but contribute
   * nothing to aggregation.
   */
  loadedSessions?: ProjectMemoryLoadedSession[];
};

export function buildProjectMemoryViewModel(
  input: BuildProjectMemoryViewModelInput,
): ProjectMemoryViewModel {
  const {
    view,
    mode,
    hasAnalysis,
    savedBrowserSessions = [],
    savedSqliteSessions = [],
    importsBySessionId = {},
    moriPackages = [],
    storageAvailable = true,
    loadedSessions = [],
  } = input;

  if (!storageAvailable) {
    const empty = emptyProjectMemoryViewModel({
      projectId: view.project.id,
      projectName: view.project.name,
      projectDescription: view.project.description,
    });
    return {
      ...empty,
      latestImportantDecision: pickLatestImportantDecision(view),
      recommendedNextSession: pickRecommendedNextSession({
        recurring: [],
        risks: [],
        loaded: [activeSessionToImpliedLoadedRow(view, "draft")],
      }),
    };
  }

  const recentSessions = buildRecentSessions({
    view,
    mode,
    savedBrowserSessions,
    savedSqliteSessions,
    importsBySessionId,
    loadedSessions,
  });

  const reimportSummary = buildReimportSummary({
    activeSessionId: view.session.id,
    importsBySessionId,
    savedBrowserSessions,
    mode,
  });

  const savedReports = buildSavedReports(moriPackages);
  const moriPackageRows = buildMoriPackageRows(moriPackages);

  // Cross-session aggregation. The helpers operate on
  // `loadedSessions` directly; when the caller hands in no loaded
  // bodies (or the only loaded body is the active session), aggregation
  // collapses to the active session naturally.
  const aggregationInput = loadedSessions.length > 0
    ? loadedSessions
    : [activeSessionToImpliedLoadedRow(view, mode)];

  const keyDecisions = aggregateKeyDecisions(aggregationInput);
  const recurringIssues = aggregateRecurringIssues(aggregationInput);
  const keyEvidence = aggregateKeyEvidence(aggregationInput);
  const unresolvedRisks = aggregateUnresolvedRisks(aggregationInput);
  const latestImportantDecision = pickLatestImportantDecision(view);
  const recommendedNextSession = pickRecommendedNextSession({
    recurring: recurringIssues,
    risks: unresolvedRisks,
    loaded: aggregationInput,
  });

  const loadStatusBreakdown = summarizeLoadStatus(loadedSessions);
  const crossSessionCounters = aggregateCounters(aggregationInput);

  const summaryStats = buildSummaryStats({
    view,
    recentSessions,
    moriPackageCount: moriPackages.length,
    reimportSummary,
    hasAnalysis,
    crossSessionCounters,
    crossSessionActive: loadStatusBreakdown.loadedSavedCount > 0,
  });

  const dataBasis = resolveDataBasis({
    mode,
    savedBrowserCount: savedBrowserSessions.length,
    savedSqliteCount: savedSqliteSessions.length,
    importSummariesAvailable: reimportSummary.importSummariesAvailable,
    loadedSavedCount: loadStatusBreakdown.loadedSavedCount,
    metadataOnlySavedCount: loadStatusBreakdown.metadataOnlySavedCount,
    failedSavedCount: loadStatusBreakdown.failedSavedCount,
  });

  const warnings = buildWarnings({
    mode,
    savedBrowserCount: savedBrowserSessions.length,
    savedSqliteCount: savedSqliteSessions.length,
    importSummariesAvailable: reimportSummary.importSummariesAvailable,
    importsWithoutSummary: countImportsWithoutSummary(importsBySessionId),
    loadStatusBreakdown,
  });

  return {
    projectId: view.project.id,
    projectName: view.project.name,
    projectDescription: view.project.description,
    dataBasis,
    dataBasisLabel: describeProjectMemoryDataBasis(dataBasis),
    summaryStats,
    recentSessions,
    keyDecisions,
    recurringIssues,
    keyEvidence,
    reimportSummary,
    savedReports,
    moriPackages: moriPackageRows,
    unresolvedRisks,
    recommendedNextSession,
    latestImportantDecision,
    warnings,
    privacyNotice:
      "Project Memory는 로컬에 저장된 Mori 세션만 참고합니다. 백그라운드 폴더 감시도, 클라우드 동기화도 없습니다.",
  };
}

// ─── recent sessions ───────────────────────────────────────────────────

function buildRecentSessions(args: {
  view: MockSession;
  mode: "demo" | "draft";
  savedBrowserSessions: StoredSessionSummary[];
  savedSqliteSessions: SqliteSessionListEntry[];
  importsBySessionId: Record<string, StoredSessionImport[]>;
  loadedSessions: ProjectMemoryLoadedSession[];
}): ProjectMemorySessionSummary[] {
  const { view, mode, savedBrowserSessions, savedSqliteSessions, importsBySessionId, loadedSessions } = args;
  const seen = new Set<string>();
  const rows: ProjectMemorySessionSummary[] = [];

  // Index loaded sessions by id so we can lift real body counts where
  // available (instead of falling back to metadata).
  const loadedById = new Map<string, ProjectMemoryLoadedSession>();
  for (const session of loadedSessions) loadedById.set(session.sessionId, session);

  const activeLoaded = loadedById.get(view.session.id);
  rows.push({
    sessionId: view.session.id,
    title: view.session.title,
    projectName: view.project.name,
    projectId: view.project.id,
    startedAt: view.session.startedAt,
    savedAt: view.session.endedAt || null,
    durationLabel: deriveDurationLabel(view.session.startedAt, view.session.endedAt),
    eventCount: view.events.length,
    evidenceCount: view.sources.length,
    issueCount: view.issues.length,
    decisionCount: view.decisions.length,
    nextActionCount: view.nextActions.length,
    sourceCount: view.sources.length,
    reimportCount: countSessionImportSummaries(importsBySessionId[view.session.id]),
    status: view.session.status,
    source: mode === "demo" ? "demo" : "current",
    dataSourceLabel: mode === "demo" ? "Demo · live" : "Current · live",
    loadStatus: activeLoaded?.loadStatus ?? "loaded",
    isCurrent: true,
  });
  seen.add(view.session.id);

  const sortedSqlite = savedSqliteSessions
    .slice()
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
  const sortedBrowser = savedBrowserSessions
    .slice()
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

  for (const entry of sortedSqlite) {
    if (seen.has(entry.sessionId)) continue;
    seen.add(entry.sessionId);
    const loaded = loadedById.get(entry.sessionId);
    const status = loaded?.loadStatus ?? "metadataOnly";
    rows.push({
      sessionId: entry.sessionId,
      title: entry.title,
      projectName: entry.projectName,
      projectId: entry.projectId,
      startedAt: entry.startedAt,
      savedAt: entry.endedAt,
      durationLabel: deriveDurationLabel(entry.startedAt, entry.endedAt),
      eventCount: status === "loaded" && loaded ? loaded.events.length : entry.eventCount,
      evidenceCount: status === "loaded" && loaded ? loaded.sources.length : entry.sourceCount,
      issueCount: status === "loaded" && loaded ? loaded.issues.length : null,
      decisionCount: status === "loaded" && loaded ? loaded.decisions.length : null,
      nextActionCount: status === "loaded" && loaded ? loaded.nextActions.length : null,
      sourceCount: status === "loaded" && loaded ? loaded.sources.length : entry.sourceCount,
      reimportCount: 0,
      status: entry.status,
      source: "sqlite-saved",
      dataSourceLabel:
        status === "loaded"
          ? "Desktop SQLite · 본문 로드됨"
          : status === "failed"
            ? `Desktop SQLite · 로드 실패 (${loaded?.failureReason ?? "unknown"})`
            : "Desktop SQLite · metadata only",
      loadStatus: status,
      isCurrent: false,
    });
  }

  for (const summary of sortedBrowser) {
    if (seen.has(summary.sessionId)) continue;
    seen.add(summary.sessionId);
    const imports = importsBySessionId[summary.sessionId];
    const loaded = loadedById.get(summary.sessionId);
    const status = loaded?.loadStatus ?? "metadataOnly";
    rows.push({
      sessionId: summary.sessionId,
      title: summary.title,
      projectName: summary.projectName,
      projectId: summary.projectId,
      startedAt: null,
      savedAt: summary.savedAt,
      durationLabel: null,
      eventCount:
        status === "loaded" && loaded
          ? loaded.events.length
          : countImportedEvents(imports),
      evidenceCount:
        status === "loaded" && loaded
          ? loaded.sources.length
          : imports
            ? imports.length
            : null,
      issueCount: status === "loaded" && loaded ? loaded.issues.length : null,
      decisionCount: status === "loaded" && loaded ? loaded.decisions.length : null,
      nextActionCount: status === "loaded" && loaded ? loaded.nextActions.length : null,
      sourceCount:
        status === "loaded" && loaded
          ? loaded.sources.length
          : imports
            ? imports.length
            : null,
      reimportCount: countSessionImportSummaries(imports),
      status: summary.status,
      source: "browser-draft",
      dataSourceLabel:
        status === "loaded"
          ? "Browser draft · 본문 로드됨"
          : "Browser draft · metadata + imports",
      loadStatus: status,
      isCurrent: false,
    });
  }

  return rows;
}

function countImportedEvents(imports: StoredSessionImport[] | undefined): number | null {
  if (!imports) return null;
  let total = 0;
  for (const entry of imports) total += entry.events.length;
  return total;
}

function countSessionImportSummaries(imports: StoredSessionImport[] | undefined): number {
  if (!imports) return 0;
  let total = 0;
  for (const entry of imports) {
    if (entry.importSummary) total += 1;
  }
  return total;
}

function deriveDurationLabel(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

// ─── re-import rollup ──────────────────────────────────────────────────

function buildReimportSummary(args: {
  activeSessionId: string;
  importsBySessionId: Record<string, StoredSessionImport[]>;
  savedBrowserSessions: StoredSessionSummary[];
  mode: "demo" | "draft";
}): ProjectMemoryReimportSummary {
  if (args.mode === "demo") {
    return {
      totalReimports: 0,
      partialReimportCount: 0,
      duplicateOnlyCount: 0,
      historyUnavailableCount: 0,
      invalidOnlyCount: 0,
      newImportCount: 0,
      topMatchedSavedSessions: [],
      connectorIds: [],
      eventKinds: [],
      latestReimportAt: null,
      recentItems: [],
      importSummariesAvailable: false,
    };
  }

  const titleBySessionId = new Map<string, string>();
  for (const entry of args.savedBrowserSessions) {
    titleBySessionId.set(entry.sessionId, entry.title);
  }

  let partial = 0;
  let duplicate = 0;
  let historyUnavailable = 0;
  let invalid = 0;
  let newImport = 0;
  const matched = new Map<string, ProjectMemoryMatchedSession>();
  const connectorIds = new Set<ConnectorId>();
  const eventKinds = new Set<ConnectorEventKind>();
  let latestReimportAt: string | null = null;
  const items: ProjectMemoryReimportItem[] = [];

  for (const [sessionId, imports] of Object.entries(args.importsBySessionId)) {
    for (const entry of imports) {
      const summary: ConnectorSourceImportSummary | undefined = entry.importSummary;
      if (!summary) continue;

      switch (summary.status) {
        case "partialReimport":
          partial += 1;
          break;
        case "duplicateOnly":
          duplicate += 1;
          break;
        case "historyUnavailable":
          historyUnavailable += 1;
          break;
        case "invalidOnly":
          invalid += 1;
          break;
        case "new":
          newImport += 1;
          break;
        default:
          break;
      }

      for (const id of summary.connectorIds) connectorIds.add(id);
      for (const kind of summary.eventKinds) eventKinds.add(kind);

      for (const m of summary.matchedSavedSessions) {
        const existing = matched.get(m.sessionId);
        const reimportCount = (existing?.reimportCount ?? 0) + 1;
        matched.set(m.sessionId, {
          sessionId: m.sessionId,
          title: m.title ?? titleBySessionId.get(m.sessionId),
          savedAt: m.savedAt,
          reimportCount,
        });
      }

      if (
        latestReimportAt === null ||
        new Date(entry.savedAt).getTime() > new Date(latestReimportAt).getTime()
      ) {
        latestReimportAt = entry.savedAt;
      }

      items.push(
        mapStoredImportToReimportItem({
          importId: entry.id,
          sessionId,
          sessionTitle: titleBySessionId.get(sessionId),
          sourceTitle: entry.source.title,
          savedAt: entry.savedAt,
          summary,
        }),
      );
    }
  }

  const recentItems = items
    .slice()
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .slice(0, 6);

  const topMatched = Array.from(matched.values())
    .sort((a, b) => b.reimportCount - a.reimportCount)
    .slice(0, 4);

  const total = partial + duplicate + historyUnavailable + invalid + newImport;

  return {
    totalReimports: total,
    partialReimportCount: partial,
    duplicateOnlyCount: duplicate,
    historyUnavailableCount: historyUnavailable,
    invalidOnlyCount: invalid,
    newImportCount: newImport,
    topMatchedSavedSessions: topMatched,
    connectorIds: Array.from(connectorIds),
    eventKinds: Array.from(eventKinds),
    latestReimportAt,
    recentItems,
    importSummariesAvailable: total > 0,
  };
}

function countImportsWithoutSummary(
  importsBySessionId: Record<string, StoredSessionImport[]>,
): number {
  let total = 0;
  for (const imports of Object.values(importsBySessionId)) {
    for (const entry of imports) {
      if (!entry.importSummary) total += 1;
    }
  }
  return total;
}

// ─── saved reports / packages ──────────────────────────────────────────

function buildSavedReports(packages: StoredMoriPackageDraft[]): ProjectMemorySavedReport[] {
  return packages
    .slice()
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .map<ProjectMemorySavedReport>((entry) => {
      const primary = entry.package.sessions.find(
        (session) => session.id === entry.package.manifest.primarySessionId,
      );
      const title = primary?.title ?? entry.package.projects[0]?.name ?? entry.packageId;
      return {
        reportId: entry.packageId,
        title,
        sessionCount: entry.package.sessions.length,
        savedAt: entry.savedAt,
        source: "mori-package",
      };
    });
}

function buildMoriPackageRows(packages: StoredMoriPackageDraft[]): ProjectMemoryMoriPackage[] {
  return packages
    .slice()
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .map<ProjectMemoryMoriPackage>((entry) => {
      const primary = entry.package.sessions.find(
        (session) => session.id === entry.package.manifest.primarySessionId,
      );
      return {
        packageId: entry.packageId,
        primarySessionTitle: primary?.title ?? null,
        sessionCount: entry.package.sessions.length,
        savedAt: entry.savedAt,
      };
    });
}

// ─── stats / data basis ────────────────────────────────────────────────

function buildSummaryStats(args: {
  view: MockSession;
  recentSessions: ProjectMemorySessionSummary[];
  moriPackageCount: number;
  reimportSummary: ProjectMemoryReimportSummary;
  hasAnalysis: boolean;
  crossSessionCounters: ReturnType<typeof aggregateCounters>;
  crossSessionActive: boolean;
}): ProjectMemorySummaryStats {
  const { view, recentSessions, moriPackageCount, reimportSummary, crossSessionCounters, crossSessionActive } = args;
  const openIssueCount = view.issues.filter((issue) => issue.status !== "resolved").length;
  return {
    sessionCount: recentSessions.length,
    activeSessionCount: crossSessionActive ? Math.max(1, crossSessionCounters.decisionCount > 0 ? 1 : 1) : 1,
    timelineEventCount: crossSessionActive ? crossSessionCounters.timelineEventCount : view.events.length,
    evidenceSourceCount: crossSessionActive ? crossSessionCounters.evidenceSourceCount : view.sources.length,
    issueCount: crossSessionActive ? crossSessionCounters.issueCount : view.issues.length,
    openIssueCount: crossSessionActive ? crossSessionCounters.openIssueCount : openIssueCount,
    decisionCount: crossSessionActive ? crossSessionCounters.decisionCount : view.decisions.length,
    nextActionCount: crossSessionActive ? crossSessionCounters.nextActionCount : view.nextActions.length,
    reportCount: moriPackageCount,
    packageCount: moriPackageCount,
    reimportCount: reimportSummary.totalReimports,
  };
}

function resolveDataBasis(args: {
  mode: "demo" | "draft";
  savedBrowserCount: number;
  savedSqliteCount: number;
  importSummariesAvailable: boolean;
  loadedSavedCount: number;
  metadataOnlySavedCount: number;
  failedSavedCount: number;
}): ProjectMemoryDataBasis {
  if (args.mode === "demo") return "unavailable";
  if (args.savedBrowserCount === 0 && args.savedSqliteCount === 0) {
    return "activeSessionOnly";
  }
  // Loaded saved-session bodies trump everything — the page IS aggregating
  // across sessions for real.
  if (args.loadedSavedCount > 0) {
    if (args.metadataOnlySavedCount + args.failedSavedCount > 0) {
      return "partialSavedSessionLoad";
    }
    return "activePlusSavedSessions";
  }
  // No saved bodies, but maybe browser import summaries are available.
  if (args.savedBrowserCount > 0 && args.importSummariesAvailable) {
    return "activePlusSavedSessions";
  }
  return "savedSessionMetadataOnly";
}

/**
 * Summary of load outcomes across the input list. Used by the warning
 * builder and the data-basis resolver — kept in one place so the two
 * never disagree about how many sessions actually loaded.
 */
function summarizeLoadStatus(loaded: ProjectMemoryLoadedSession[]): {
  loadedSavedCount: number;
  metadataOnlySavedCount: number;
  failedSavedCount: number;
  failureReasons: string[];
} {
  let loadedSaved = 0;
  let metadataSaved = 0;
  let failedSaved = 0;
  const reasons: string[] = [];
  for (const session of loaded) {
    if (session.isActive) continue;
    if (session.loadStatus === "loaded") loadedSaved += 1;
    else if (session.loadStatus === "metadataOnly") metadataSaved += 1;
    else if (session.loadStatus === "failed") {
      failedSaved += 1;
      if (session.failureReason && !reasons.includes(session.failureReason)) {
        reasons.push(session.failureReason);
      }
    }
  }
  return {
    loadedSavedCount: loadedSaved,
    metadataOnlySavedCount: metadataSaved,
    failedSavedCount: failedSaved,
    failureReasons: reasons,
  };
}

/**
 * When no loadedSessions are supplied the aggregator still needs *some*
 * row to walk so active-session decisions / issues / evidence appear.
 * We synthesise a transient loaded row from the active view.
 */
function activeSessionToImpliedLoadedRow(
  view: MockSession,
  mode: "demo" | "draft",
): ProjectMemoryLoadedSession {
  return {
    sessionId: view.session.id,
    title: view.session.title,
    projectId: view.project.id,
    projectName: view.project.name,
    startedAt: view.session.startedAt,
    endedAt: view.session.endedAt || null,
    savedAt: null,
    source: "active",
    loadStatus: mode === "demo" ? "loaded" : "loaded",
    isActive: true,
    events: view.events,
    sources: view.sources,
    issues: view.issues,
    decisions: view.decisions,
    nextActions: view.nextActions,
    imports: [],
    analysis: null,
  };
}

function pickLatestImportantDecision(view: MockSession) {
  const high = view.decisions
    .filter((decision) => decision.importance === "high")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return high[0] ?? view.decisions[0] ?? null;
}

// ─── warnings ──────────────────────────────────────────────────────────

function buildWarnings(args: {
  mode: "demo" | "draft";
  savedBrowserCount: number;
  savedSqliteCount: number;
  importSummariesAvailable: boolean;
  importsWithoutSummary: number;
  loadStatusBreakdown: {
    loadedSavedCount: number;
    metadataOnlySavedCount: number;
    failedSavedCount: number;
    failureReasons: string[];
  };
}): ProjectMemoryWarning[] {
  const warnings: ProjectMemoryWarning[] = [];
  if (args.mode === "demo") {
    warnings.push({ kind: "demo-mode" });
    return warnings;
  }
  const totalSaved = args.savedBrowserCount + args.savedSqliteCount;
  const { loadedSavedCount, metadataOnlySavedCount, failedSavedCount, failureReasons } =
    args.loadStatusBreakdown;

  // Honest summary of what loaded. We branch so the user never sees
  // both "not loaded" and "partial load" at the same time.
  if (loadedSavedCount === 0 && totalSaved > 0) {
    warnings.push({ kind: "saved-session-bodies-not-loaded", sessionCount: totalSaved });
  } else if (
    loadedSavedCount > 0 &&
    metadataOnlySavedCount + failedSavedCount > 0
  ) {
    warnings.push({
      kind: "saved-session-bodies-partial-load",
      loadedCount: loadedSavedCount,
      metadataOnlyCount: metadataOnlySavedCount,
      failedCount: failedSavedCount,
    });
  }

  if (failedSavedCount > 0) {
    warnings.push({
      kind: "saved-session-load-failed",
      sessionCount: failedSavedCount,
      reasons: failureReasons,
    });
  }

  // SQLite-only world without loaded bodies needs the legacy
  // "summaries unavailable" hint; loaded SQLite bodies obviate it.
  if (
    args.savedSqliteCount > 0 &&
    args.savedBrowserCount === 0 &&
    loadedSavedCount === 0
  ) {
    warnings.push({ kind: "import-summaries-unavailable", reason: "sqlite-only" });
  }

  if (args.importsWithoutSummary > 0) {
    warnings.push({
      kind: "old-imports-without-identity",
      importCount: args.importsWithoutSummary,
    });
  }

  return warnings;
}

// ─── public helpers ────────────────────────────────────────────────────

/**
 * Sentinel re-export so callers using `getReportEvidenceSummary` directly
 * keep getting the same shape. Kept here so the builder owns the data-
 * basis string in one place.
 */
export { getReportEvidenceSummary };

/**
 * Stable, exhaustive set of session sources — useful for the UI to pick
 * the right icon/colour without re-deriving from `source`.
 */
export const PROJECT_MEMORY_SESSION_SOURCES: ReadonlyArray<ProjectMemorySessionSource> = [
  "current",
  "browser-draft",
  "sqlite-saved",
  "demo",
];
