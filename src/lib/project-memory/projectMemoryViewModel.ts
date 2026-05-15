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
import type { MoriMockSession } from "../../domain/types";
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
  emptyProjectMemoryViewModel,
  mapStoredImportToReimportItem,
  type ProjectMemoryDataBasis,
  type ProjectMemoryKeyDecision,
  type ProjectMemoryKeyEvidence,
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
import { getKeyEvidence } from "./projectMemory";

export type BuildProjectMemoryViewModelInput = {
  /** Always present — the live session. */
  view: MoriMockSession;
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
      recommendedNextSession: pickRecommendedNextSessionTopic(view, []),
    };
  }

  const recentSessions = buildRecentSessions({
    view,
    mode,
    savedBrowserSessions,
    savedSqliteSessions,
    importsBySessionId,
  });

  const reimportSummary = buildReimportSummary({
    activeSessionId: view.session.id,
    importsBySessionId,
    savedBrowserSessions,
    mode,
  });

  const savedReports = buildSavedReports(moriPackages);
  const moriPackageRows = buildMoriPackageRows(moriPackages);

  const summaryStats = buildSummaryStats({
    view,
    recentSessions,
    moriPackageCount: moriPackages.length,
    reimportSummary,
    hasAnalysis,
  });

  const dataBasis = resolveDataBasis({
    mode,
    savedBrowserCount: savedBrowserSessions.length,
    savedSqliteCount: savedSqliteSessions.length,
    importSummariesAvailable: reimportSummary.importSummariesAvailable,
  });

  const keyDecisions = buildKeyDecisions(view);
  const recurringIssues = buildRecurringIssues(view);
  const keyEvidence = buildKeyEvidence(view);
  const unresolvedRisks = buildUnresolvedRisks(view);
  const latestImportantDecision = pickLatestImportantDecision(view);
  const recommendedNextSession = pickRecommendedNextSessionTopic(view, unresolvedRisks);

  const warnings = buildWarnings({
    mode,
    savedBrowserCount: savedBrowserSessions.length,
    savedSqliteCount: savedSqliteSessions.length,
    importSummariesAvailable: reimportSummary.importSummariesAvailable,
    importsWithoutSummary: countImportsWithoutSummary(importsBySessionId),
  });

  return {
    projectId: view.project.id,
    projectName: view.project.name,
    projectDescription: view.project.description,
    dataBasis,
    dataBasisLabel: describeDataBasisKorean(dataBasis),
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
  view: MoriMockSession;
  mode: "demo" | "draft";
  savedBrowserSessions: StoredSessionSummary[];
  savedSqliteSessions: SqliteSessionListEntry[];
  importsBySessionId: Record<string, StoredSessionImport[]>;
}): ProjectMemorySessionSummary[] {
  const { view, mode, savedBrowserSessions, savedSqliteSessions, importsBySessionId } = args;
  const seen = new Set<string>();
  const rows: ProjectMemorySessionSummary[] = [];

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
    rows.push({
      sessionId: entry.sessionId,
      title: entry.title,
      projectName: entry.projectName,
      projectId: entry.projectId,
      startedAt: entry.startedAt,
      savedAt: entry.endedAt,
      durationLabel: deriveDurationLabel(entry.startedAt, entry.endedAt),
      eventCount: entry.eventCount,
      evidenceCount: entry.sourceCount,
      issueCount: null,
      decisionCount: null,
      nextActionCount: null,
      sourceCount: entry.sourceCount,
      reimportCount: 0,
      status: entry.status,
      source: "sqlite-saved",
      dataSourceLabel: "Desktop SQLite · metadata only",
      isCurrent: false,
    });
  }

  for (const summary of sortedBrowser) {
    if (seen.has(summary.sessionId)) continue;
    seen.add(summary.sessionId);
    const imports = importsBySessionId[summary.sessionId];
    rows.push({
      sessionId: summary.sessionId,
      title: summary.title,
      projectName: summary.projectName,
      projectId: summary.projectId,
      startedAt: null,
      savedAt: summary.savedAt,
      durationLabel: null,
      eventCount: countImportedEvents(imports),
      evidenceCount: imports ? imports.length : null,
      issueCount: null,
      decisionCount: null,
      nextActionCount: null,
      sourceCount: imports ? imports.length : null,
      reimportCount: countSessionImportSummaries(imports),
      status: summary.status,
      source: "browser-draft",
      dataSourceLabel: "Browser draft · metadata + imports",
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
  view: MoriMockSession;
  recentSessions: ProjectMemorySessionSummary[];
  moriPackageCount: number;
  reimportSummary: ProjectMemoryReimportSummary;
  hasAnalysis: boolean;
}): ProjectMemorySummaryStats {
  const { view, recentSessions, moriPackageCount, reimportSummary } = args;
  const openIssueCount = view.issues.filter((issue) => issue.status !== "resolved").length;
  // Reports are derived from the stored `.mori` packages; Quick-Pass-derived
  // markdown is not yet persisted, so reportCount stays aligned with
  // packageCount until a future milestone splits them.
  return {
    sessionCount: recentSessions.length,
    activeSessionCount: 1,
    timelineEventCount: view.events.length,
    evidenceSourceCount: view.sources.length,
    issueCount: view.issues.length,
    openIssueCount,
    decisionCount: view.decisions.length,
    nextActionCount: view.nextActions.length,
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
}): ProjectMemoryDataBasis {
  if (args.mode === "demo") return "unavailable";
  if (args.savedBrowserCount === 0 && args.savedSqliteCount === 0) {
    return "activeSessionOnly";
  }
  // Browser sessions carry imports + import summaries. SQLite-only sessions
  // are listed but cannot contribute import rollups today.
  if (args.savedBrowserCount > 0 && args.importSummariesAvailable) {
    return "activePlusSavedSessions";
  }
  return "savedSessionMetadataOnly";
}

function describeDataBasisKorean(basis: ProjectMemoryDataBasis): string {
  switch (basis) {
    case "activeSessionOnly":
      return "현재 세션만 집계";
    case "activePlusSavedSessions":
      return "현재 + 저장 세션 집계";
    case "savedSessionMetadataOnly":
      return "저장 세션은 메타데이터만";
    case "unavailable":
      return "데모 / 메모리 없음";
    default:
      return "현재 세션만 집계";
  }
}

// ─── decisions / issues / evidence (active session only today) ─────────

function buildKeyDecisions(view: MoriMockSession): ProjectMemoryKeyDecision[] {
  return [...view.decisions]
    .sort((a, b) => priorityRank(b.importance) - priorityRank(a.importance) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((decision) => ({
      decisionId: decision.id,
      sessionId: view.session.id,
      title: decision.title,
      detail: decision.decision,
      importance: decision.importance,
      confirmed: decision.confirmed,
      createdAt: decision.createdAt,
    }));
}

function priorityRank(priority: "high" | "medium" | "low"): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function buildRecurringIssues(view: MoriMockSession): ProjectMemoryRecurringIssue[] {
  return view.issues
    .map<ProjectMemoryRecurringIssue>((issue) => {
      const signalScore =
        issue.sourceEventIds.length * 2 +
        issue.relatedDecisionIds.length * 3 +
        (issue.status === "open" ? 1 : 0);
      return {
        issueId: issue.id,
        sessionId: view.session.id,
        title: issue.title,
        signalScore,
        status: issue.status,
        priority: issue.priority,
        // Honest: cross-session aggregation is not implemented today, so this
        // is always false until the caller supplies loaded saved-session
        // bodies in a future milestone.
        crossSession: false,
      };
    })
    .filter((row) => row.signalScore > 0 || row.priority === "high")
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, 5);
}

function buildKeyEvidence(view: MoriMockSession): ProjectMemoryKeyEvidence[] {
  // Reuse the existing pure helper so we don't duplicate ranking logic.
  return getKeyEvidence(view, 6).map((row) => ({
    source: row.source,
    relatedEventCount: row.relatedEventCount,
    relatedIssueCount: row.relatedIssueCount,
    relatedDecisionCount: row.relatedDecisionCount,
  }));
}

function buildUnresolvedRisks(view: MoriMockSession): ProjectMemoryUnresolvedRisk[] {
  return view.issues
    .filter((issue) => issue.status === "open")
    .filter(
      (issue) =>
        issue.priority === "high" || (issue.trustLevel === "inferred" && issue.confidence < 0.6),
    )
    .slice(0, 4)
    .map<ProjectMemoryUnresolvedRisk>((issue) => ({
      issueId: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.status,
      trustLevel: issue.trustLevel,
      confidence: issue.confidence,
      reason:
        issue.priority === "high"
          ? "High priority"
          : `Low confidence · ${Math.round(issue.confidence * 100)}%`,
    }));
}

function pickLatestImportantDecision(view: MoriMockSession) {
  const high = view.decisions
    .filter((decision) => decision.importance === "high")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return high[0] ?? view.decisions[0] ?? null;
}

function pickRecommendedNextSessionTopic(
  view: MoriMockSession,
  risks: ProjectMemoryUnresolvedRisk[],
): string {
  if (risks.length > 0) {
    return `Open risk 해소: ${risks[0].title}`;
  }
  const inProgress = view.issues.find((issue) => issue.status === "inProgress");
  if (inProgress) return `진행 중 이슈 마무리: ${inProgress.title}`;
  const next = view.nextActions[0];
  if (next) return `다음 액션 추진: ${next.title}`;
  return "현재 세션 메모리를 검토하고 다음 작업 범위를 결정";
}

// ─── warnings ──────────────────────────────────────────────────────────

function buildWarnings(args: {
  mode: "demo" | "draft";
  savedBrowserCount: number;
  savedSqliteCount: number;
  importSummariesAvailable: boolean;
  importsWithoutSummary: number;
}): ProjectMemoryWarning[] {
  const warnings: ProjectMemoryWarning[] = [];
  if (args.mode === "demo") {
    warnings.push({ kind: "demo-mode" });
    return warnings;
  }
  if (args.savedBrowserCount + args.savedSqliteCount > 0) {
    warnings.push({
      kind: "saved-session-bodies-not-loaded",
      sessionCount: args.savedBrowserCount + args.savedSqliteCount,
    });
  }
  if (args.savedSqliteCount > 0 && args.savedBrowserCount === 0) {
    warnings.push({ kind: "import-summaries-unavailable", reason: "sqlite-only" });
  }
  if (
    !args.importSummariesAvailable &&
    args.savedBrowserCount === 0 &&
    args.savedSqliteCount === 0
  ) {
    // No saved sessions at all — neither warning above fires; nothing else
    // is needed.
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
