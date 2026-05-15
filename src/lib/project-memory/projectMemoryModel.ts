/**
 * Project Memory aggregation model.
 *
 * The Memory page used to derive everything from the active session view +
 * a flat list of saved-session summaries. That worked when Mori only knew
 * about one session at a time, but it stopped being honest once we landed
 * connector persistence and started accumulating `StoredSessionImport`
 * records across saved sessions.
 *
 * This module defines the *typed shape* of the cross-session aggregation
 * the Memory page now consumes. The view-model is a pure derivation — no
 * IO, no new sources of truth. `projectMemoryViewModel.ts` builds an
 * instance from whatever the caller can supply (active session view,
 * saved-session metadata, stored imports, .mori packages). The UI
 * branches on `dataBasis` so it never claims aggregation that didn't
 * actually happen.
 *
 * Honesty rules baked into the type:
 *   - `dataBasis` describes the *real* reach of the aggregation. The UI
 *     surfaces it as a top-of-page badge so the user sees what's
 *     accumulated vs. what's only metadata.
 *   - Saved sessions without loaded payloads can never contribute to
 *     `keyDecisions` / `recurringIssues` / `keyEvidence` — those fields
 *     stay scoped to the active session and the warnings array carries a
 *     planned-state note for the missing data.
 *   - Old imports without a connector identity (pre-`connectorEventId`)
 *     never produce a re-import rollup row.
 */
import type {
  ConnectorEventKind,
  ConnectorId,
  ConnectorSourceImportStatus,
  ConnectorSourceImportSummary,
} from "../connectors";
import type { Decision, Issue, SourceRef } from "../../domain/types";

/**
 * What the aggregation actually reaches. The Memory page renders an
 * honest top-of-page badge using this value — there is no "auto-promote"
 * to higher reach without real data.
 */
export type ProjectMemoryDataBasis =
  | "activeSessionOnly"
  | "activePlusSavedSessions"
  | "savedSessionMetadataOnly"
  | "unavailable";

/** Origin of a session row in the recent-sessions list. */
export type ProjectMemorySessionSource =
  | "current"
  | "browser-draft"
  | "sqlite-saved"
  | "demo";

/**
 * Per-session card data for the Memory page. Loaded payload sessions
 * carry real `eventCount`/`sourceCount`/etc.; metadata-only sessions
 * carry `null` where the data isn't accessible.
 */
export type ProjectMemorySessionSummary = {
  sessionId: string;
  title: string;
  projectName: string | null;
  projectId: string | null;
  startedAt: string | null;
  savedAt: string | null;
  durationLabel: string | null;
  /** Null when the saved-session payload was not loaded. */
  eventCount: number | null;
  /** Null when the saved-session payload was not loaded. */
  evidenceCount: number | null;
  /** Null when issues are not aggregated for this session. */
  issueCount: number | null;
  /** Null when decisions are not aggregated for this session. */
  decisionCount: number | null;
  /** Null when next-actions are not aggregated for this session. */
  nextActionCount: number | null;
  /** Null when sources are not aggregated for this session. */
  sourceCount: number | null;
  /** Connector import summaries this session contributed, if known. */
  reimportCount: number;
  status: string;
  source: ProjectMemorySessionSource;
  /** Human label: "Current · live" / "Desktop SQLite · metadata only" / etc. */
  dataSourceLabel: string;
  isCurrent: boolean;
};

/**
 * Cross-session top-line counters. Each field counts only what's actually
 * been aggregated under the current `dataBasis`. Counters never inflate
 * by combining metadata-only counts with active-session counts when the
 * brief data isn't comparable — e.g. `decisionCount` always comes from
 * the active session today because saved-session payloads aren't loaded.
 */
export type ProjectMemorySummaryStats = {
  /** Total session rows in the recent-sessions list (active + saved, de-duped). */
  sessionCount: number;
  /**
   * Subset of `sessionCount` whose payload was genuinely aggregated.
   * Today this is always 1 (the active session) unless the caller passed
   * loaded saved-session bodies; we leave the field on the type so the
   * UI can render "N/M aggregated" without re-deriving the bool.
   */
  activeSessionCount: number;
  timelineEventCount: number;
  evidenceSourceCount: number;
  issueCount: number;
  openIssueCount: number;
  decisionCount: number;
  nextActionCount: number;
  reportCount: number;
  packageCount: number;
  /** Total re-import records observed across all sessions in the rollup. */
  reimportCount: number;
};

/** Active-session decision lifted to project memory. */
export type ProjectMemoryKeyDecision = {
  decisionId: string;
  sessionId: string;
  title: string;
  detail: string;
  importance: "high" | "medium" | "low";
  confirmed: boolean;
  createdAt: string;
};

/**
 * "Recurring issue" cross-session aggregation is still scoped to the
 * active session — saved-session payloads are not loaded today. The
 * `crossSession` flag stays `false` until the caller supplies loaded
 * saved sessions, so the UI can render a planned-state hint.
 */
export type ProjectMemoryRecurringIssue = {
  issueId: string;
  sessionId: string;
  title: string;
  signalScore: number;
  status: Issue["status"];
  priority: Issue["priority"];
  crossSession: boolean;
};

/** A `SourceRef` lifted to project memory with relationship counters. */
export type ProjectMemoryKeyEvidence = {
  source: SourceRef;
  relatedEventCount: number;
  relatedIssueCount: number;
  relatedDecisionCount: number;
};

/** Lightweight reference to a saved session matched by re-import history. */
export type ProjectMemoryMatchedSession = {
  sessionId: string;
  title?: string;
  savedAt?: string;
  /** Number of re-import records this session contributed. */
  reimportCount: number;
};

/** Per-record entry in the re-import history card. */
export type ProjectMemoryReimportItem = {
  importId: string;
  sessionId: string;
  sessionTitle?: string;
  sourceTitle: string;
  status: ConnectorSourceImportStatus;
  newEventCount: number;
  duplicateEventCount: number;
  invalidLineCount: number;
  connectorIds: ConnectorId[];
  matchedSavedSessionCount: number;
  savedSessionHistoryAvailable: boolean;
  savedAt: string;
};

/**
 * Re-import rollup across the whole project. The counters all come from
 * stored `ConnectorSourceImportSummary` records — never derived in this
 * module. Sessions without any stored summary contribute `0` rows.
 */
export type ProjectMemoryReimportSummary = {
  totalReimports: number;
  partialReimportCount: number;
  duplicateOnlyCount: number;
  historyUnavailableCount: number;
  invalidOnlyCount: number;
  newImportCount: number;
  topMatchedSavedSessions: ProjectMemoryMatchedSession[];
  connectorIds: ConnectorId[];
  eventKinds: ConnectorEventKind[];
  latestReimportAt: string | null;
  recentItems: ProjectMemoryReimportItem[];
  /**
   * True when the rollup actually saw `StoredSessionImport.importSummary`
   * data. False in SQLite-only and demo modes — the UI then renders an
   * "import summaries unavailable" honesty note instead of a green
   * checkmark.
   */
  importSummariesAvailable: boolean;
};

/** Saved-report card row. */
export type ProjectMemorySavedReport = {
  reportId: string;
  title: string;
  /** Number of sessions the report bundles. */
  sessionCount: number;
  savedAt: string;
  source: "mori-package";
};

/** .mori package row. Currently aliased to the saved-report row shape. */
export type ProjectMemoryMoriPackage = {
  packageId: string;
  primarySessionTitle: string | null;
  sessionCount: number;
  savedAt: string;
};

/** Open risk lifted to the right summary panel. */
export type ProjectMemoryUnresolvedRisk = {
  issueId: string;
  title: string;
  priority: Issue["priority"];
  status: Issue["status"];
  trustLevel: Issue["trustLevel"];
  confidence: number;
  reason: string;
};

/**
 * Honest UI warning. The Memory page renders a non-blocking note for
 * each entry so the user knows what's currently *not* aggregated and
 * why.
 */
export type ProjectMemoryWarning =
  | { kind: "saved-session-bodies-not-loaded"; sessionCount: number }
  | { kind: "import-summaries-unavailable"; reason: "sqlite-only" | "demo" | "no-storage" }
  | { kind: "old-imports-without-identity"; importCount: number }
  | { kind: "demo-mode" }
  | { kind: "storage-unavailable" };

/**
 * Top-level Project Memory aggregation. Consumed by `MemoryView.tsx`,
 * the right-side `ProjectMemorySummaryPanel`, and any future cross-
 * session summarizer (e.g. follow-up prompt builders).
 *
 * Old `ProjectMemorySnapshot` / `ProjectMemoryStats` / `DerivedSession`
 * types from `projectMemoryContext.ts` and `projectMemory.ts` remain in
 * place for backward compatibility — this view-model is additive.
 */
export type ProjectMemoryViewModel = {
  projectId: string;
  projectName: string;
  projectDescription: string;
  dataBasis: ProjectMemoryDataBasis;
  /** Human label for the `dataBasis` badge (Korean-friendly). */
  dataBasisLabel: string;
  summaryStats: ProjectMemorySummaryStats;
  recentSessions: ProjectMemorySessionSummary[];
  keyDecisions: ProjectMemoryKeyDecision[];
  recurringIssues: ProjectMemoryRecurringIssue[];
  keyEvidence: ProjectMemoryKeyEvidence[];
  reimportSummary: ProjectMemoryReimportSummary;
  savedReports: ProjectMemorySavedReport[];
  moriPackages: ProjectMemoryMoriPackage[];
  unresolvedRisks: ProjectMemoryUnresolvedRisk[];
  /** "Open risk 해소: ..." / "다음 액션 추진: ..." style copy. */
  recommendedNextSession: string;
  /** Latest important decision lifted for the right summary panel. */
  latestImportantDecision: Decision | null;
  warnings: ProjectMemoryWarning[];
  /** One-line privacy notice for the page footer. */
  privacyNotice: string;
};

/**
 * Honest default value so callers can render unconditionally without
 * branching on `viewModel === null`. Represents the "no project memory
 * aggregated yet" state.
 */
export function emptyProjectMemoryViewModel(args: {
  projectId?: string;
  projectName?: string;
  projectDescription?: string;
} = {}): ProjectMemoryViewModel {
  return {
    projectId: args.projectId ?? "",
    projectName: args.projectName ?? "프로젝트",
    projectDescription: args.projectDescription ?? "",
    dataBasis: "unavailable",
    dataBasisLabel: "Project memory unavailable",
    summaryStats: {
      sessionCount: 0,
      activeSessionCount: 0,
      timelineEventCount: 0,
      evidenceSourceCount: 0,
      issueCount: 0,
      openIssueCount: 0,
      decisionCount: 0,
      nextActionCount: 0,
      reportCount: 0,
      packageCount: 0,
      reimportCount: 0,
    },
    recentSessions: [],
    keyDecisions: [],
    recurringIssues: [],
    keyEvidence: [],
    reimportSummary: {
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
    },
    savedReports: [],
    moriPackages: [],
    unresolvedRisks: [],
    recommendedNextSession: "현재 세션 메모리를 검토하고 다음 작업 범위를 결정",
    latestImportantDecision: null,
    warnings: [{ kind: "storage-unavailable" }],
    privacyNotice:
      "Project Memory는 로컬에 저장된 Mori 세션만 참고합니다. 백그라운드 폴더 감시도, 클라우드 동기화도 없습니다.",
  };
}

export function describeProjectMemoryDataBasis(basis: ProjectMemoryDataBasis): string {
  switch (basis) {
    case "activeSessionOnly":
      return "Active session only";
    case "activePlusSavedSessions":
      return "Active + saved sessions";
    case "savedSessionMetadataOnly":
      return "Metadata only";
    case "unavailable":
      return "Demo / unavailable";
    default:
      return "Active session only";
  }
}

/** Stable tone for the `dataBasis` badge. */
export function getProjectMemoryDataBasisTone(
  basis: ProjectMemoryDataBasis,
): "green" | "blue" | "orange" | "gray" {
  switch (basis) {
    case "activePlusSavedSessions":
      return "green";
    case "activeSessionOnly":
      return "blue";
    case "savedSessionMetadataOnly":
      return "orange";
    case "unavailable":
    default:
      return "gray";
  }
}

/**
 * Reuse the connector summary status mapping so the re-import card and
 * the .jsonl preview card stay aligned (the user shouldn't see two
 * different colours for the same status).
 */
export function getReimportStatusTone(
  status: ConnectorSourceImportStatus,
): "green" | "blue" | "orange" | "red" | "gray" {
  switch (status) {
    case "new":
      return "green";
    case "partialReimport":
      return "blue";
    case "duplicateOnly":
      return "orange";
    case "invalidOnly":
      return "red";
    case "historyUnavailable":
    case "unknown":
    default:
      return "gray";
  }
}

/** Map a stored import summary to a re-import-card item. */
export function mapStoredImportToReimportItem(args: {
  importId: string;
  sessionId: string;
  sessionTitle?: string;
  sourceTitle: string;
  savedAt: string;
  summary: ConnectorSourceImportSummary;
}): ProjectMemoryReimportItem {
  return {
    importId: args.importId,
    sessionId: args.sessionId,
    sessionTitle: args.sessionTitle,
    sourceTitle: args.sourceTitle,
    status: args.summary.status,
    newEventCount: args.summary.newEventCount,
    duplicateEventCount: args.summary.duplicateEventCount,
    invalidLineCount: args.summary.invalidLineCount,
    connectorIds: [...args.summary.connectorIds],
    matchedSavedSessionCount: args.summary.matchedSavedSessions.length,
    savedSessionHistoryAvailable: args.summary.savedSessionHistoryAvailable,
    savedAt: args.savedAt,
  };
}
