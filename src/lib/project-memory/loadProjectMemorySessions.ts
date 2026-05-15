/**
 * Project Memory saved-session body loader.
 *
 * The Memory page used to aggregate from active-session payload +
 * saved-session METADATA. That left key decisions / recurring issues /
 * key evidence active-session-only — saved-session decisions sat in
 * SQLite and were never read.
 *
 * This module is the boundary the Memory page calls to safely fetch
 * saved-session bodies. It NEVER:
 *
 *   - swaps the active session,
 *   - mutates saved-session data,
 *   - loads raw connector JSONL,
 *   - reads arbitrary files,
 *   - reaches a network endpoint.
 *
 * It DOES:
 *
 *   - call `BrowserDraftRepository` (sync, fast) for browser-saved
 *     sessions and reconstruct a partial MoriMockSession from
 *     `StoredSessionDraft` + persisted imports + analysis,
 *   - call `SessionPersistenceService.loadSessionFromDesktop` (async,
 *     IPC) for SQLite sessions, returning the full reconstructed
 *     session including issues + decisions + next-actions,
 *   - cap the number of saved sessions read so a 1000-session user
 *     doesn't spin up 1000 IPC calls — `DEFAULT_SAVED_SESSION_CAP = 20`,
 *   - parallelize SQLite reads via `Promise.allSettled` so one slow
 *     session can't block the page,
 *   - return a stable `ProjectMemoryLoadedSession[]` where each entry
 *     carries `loadStatus` (`loaded` | `metadataOnly` | `failed`) so the
 *     view-model can render an honest "partial load" state instead of
 *     pretending the rollup is complete.
 */
import type { MoriMockSession } from "../../domain/types";
import type { SqliteSessionListEntry } from "../sqlite/repositoryContracts";
import type {
  MoriDraftRepository,
  StoredSessionImport,
  StoredSessionSummary,
} from "../storage/storageTypes";
import type { ProjectMemoryLoadedSession } from "./projectMemoryModel";

/** Maximum saved sessions the loader will pull bodies for. */
export const DEFAULT_SAVED_SESSION_CAP = 20;

/**
 * Subset of `SessionPersistenceService` the loader actually depends on.
 * Stays narrow so tests can hand in a stub without spinning up the
 * Tauri service singleton.
 */
export type ProjectMemoryDesktopLoader = {
  isDesktop: () => boolean;
  loadSessionFromDesktop: (sessionId: string) => Promise<{ session: MoriMockSession }>;
};

export type LoadProjectMemorySessionsInput = {
  /** Live session (always loaded). */
  activeSession: MoriMockSession;
  /** Set to `false` when the active session is a demo mock. */
  activeIsLive: boolean;
  /** Browser repository — required when `savedBrowserSessions` is non-empty. */
  repository?: MoriDraftRepository | null;
  /** Browser-saved session metadata. */
  savedBrowserSessions?: StoredSessionSummary[];
  /** Desktop SQLite-saved session metadata. */
  savedSqliteSessions?: SqliteSessionListEntry[];
  /**
   * Desktop loader. Pass `null` when running in browser mode — SQLite
   * sessions then collapse to `metadataOnly` instead of failing.
   */
  desktopLoader?: ProjectMemoryDesktopLoader | null;
  /** Override the saved-session cap (testing). */
  cap?: number;
};

/**
 * Load saved-session bodies for Project Memory aggregation. Always
 * returns; failed individual sessions surface as `failed` entries with
 * a `failureReason` field rather than throwing.
 */
export async function loadProjectMemorySessions(
  input: LoadProjectMemorySessionsInput,
): Promise<ProjectMemoryLoadedSession[]> {
  const cap = input.cap ?? DEFAULT_SAVED_SESSION_CAP;
  const out: ProjectMemoryLoadedSession[] = [];

  // ─── active session ────────────────────────────────────────────────
  if (input.activeIsLive) {
    out.push(activeSessionToLoaded(input.activeSession));
  } else {
    // Demo mode: still list the mock view but mark it metadata-only —
    // we never aggregate from demo data.
    out.push(activeDemoToMetadataOnly(input.activeSession));
  }

  // Active session takes one slot so the cap counts saved sessions.
  const seen = new Set<string>([input.activeSession.session.id]);

  // ─── saved sessions: SQLite first (richer payloads) ────────────────
  const sqliteCandidates = (input.savedSqliteSessions ?? [])
    .filter((entry) => !seen.has(entry.sessionId))
    .slice()
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
    .slice(0, cap);

  const sqliteResults = await Promise.allSettled(
    sqliteCandidates.map((entry) => loadSqliteSessionBody(entry, input.desktopLoader)),
  );
  for (let i = 0; i < sqliteCandidates.length; i += 1) {
    const entry = sqliteCandidates[i];
    const result = sqliteResults[i];
    seen.add(entry.sessionId);
    if (result.status === "fulfilled") {
      out.push(result.value);
    } else {
      out.push(sqliteToFailed(entry, errorMessage(result.reason)));
    }
  }

  // ─── saved sessions: browser localStorage (cheap, sync) ────────────
  const remaining = cap - sqliteCandidates.length;
  if (remaining > 0 && input.repository) {
    const browserCandidates = (input.savedBrowserSessions ?? [])
      .filter((entry) => !seen.has(entry.sessionId))
      .slice()
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      .slice(0, remaining);

    for (const summary of browserCandidates) {
      seen.add(summary.sessionId);
      try {
        out.push(loadBrowserSessionBody(summary, input.repository));
      } catch (error) {
        out.push(browserSummaryToFailed(summary, errorMessage(error)));
      }
    }
  } else if (input.savedBrowserSessions && input.savedBrowserSessions.length > 0 && !input.repository) {
    // Browser summaries provided but no repository — collapse to metadata-only.
    for (const summary of input.savedBrowserSessions) {
      if (seen.has(summary.sessionId)) continue;
      seen.add(summary.sessionId);
      out.push(browserSummaryToMetadataOnly(summary));
    }
  }

  return out;
}

// ─── active session adapters ─────────────────────────────────────────

function activeSessionToLoaded(view: MoriMockSession): ProjectMemoryLoadedSession {
  return {
    sessionId: view.session.id,
    title: view.session.title,
    projectId: view.project.id,
    projectName: view.project.name,
    startedAt: view.session.startedAt,
    endedAt: view.session.endedAt || null,
    savedAt: null,
    source: "active",
    loadStatus: "loaded",
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

function activeDemoToMetadataOnly(view: MoriMockSession): ProjectMemoryLoadedSession {
  return {
    sessionId: view.session.id,
    title: view.session.title,
    projectId: view.project.id,
    projectName: view.project.name,
    startedAt: view.session.startedAt,
    endedAt: view.session.endedAt || null,
    savedAt: null,
    source: "active",
    loadStatus: "metadataOnly",
    isActive: true,
    events: [],
    sources: [],
    issues: [],
    decisions: [],
    nextActions: [],
    imports: [],
    analysis: null,
  };
}

// ─── SQLite session adapter ──────────────────────────────────────────

async function loadSqliteSessionBody(
  entry: SqliteSessionListEntry,
  loader: ProjectMemoryDesktopLoader | null | undefined,
): Promise<ProjectMemoryLoadedSession> {
  if (!loader || !loader.isDesktop()) {
    return sqliteToMetadataOnly(entry);
  }
  const { session } = await loader.loadSessionFromDesktop(entry.sessionId);
  // Use the caller-requested id so the row remains addressable even when
  // the reconstructed snapshot's id drifts (e.g. test stubs that return
  // a canned mock).
  return {
    sessionId: entry.sessionId,
    title: session.session.title || entry.title,
    projectId: session.project.id || entry.projectId,
    projectName: session.project.name || entry.projectName,
    startedAt: session.session.startedAt || entry.startedAt,
    endedAt: session.session.endedAt || entry.endedAt || null,
    savedAt: entry.endedAt || null,
    source: "desktopSQLite",
    loadStatus: "loaded",
    isActive: false,
    events: session.events,
    sources: session.sources,
    issues: session.issues,
    decisions: session.decisions,
    nextActions: session.nextActions,
    imports: [],
    analysis: null,
  };
}

function sqliteToMetadataOnly(entry: SqliteSessionListEntry): ProjectMemoryLoadedSession {
  return {
    sessionId: entry.sessionId,
    title: entry.title,
    projectId: entry.projectId,
    projectName: entry.projectName,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt || null,
    savedAt: entry.endedAt || null,
    source: "desktopSQLite",
    loadStatus: "metadataOnly",
    isActive: false,
    events: [],
    sources: [],
    issues: [],
    decisions: [],
    nextActions: [],
    imports: [],
    analysis: null,
  };
}

function sqliteToFailed(
  entry: SqliteSessionListEntry,
  reason: string,
): ProjectMemoryLoadedSession {
  return {
    ...sqliteToMetadataOnly(entry),
    loadStatus: "failed",
    failureReason: reason,
  };
}

// ─── browser session adapter ─────────────────────────────────────────

function loadBrowserSessionBody(
  summary: StoredSessionSummary,
  repository: MoriDraftRepository,
): ProjectMemoryLoadedSession {
  const imports = repository.listSessionImports(summary.sessionId);
  const analysis = repository.loadSessionAnalysis(summary.sessionId);
  // Browser drafts store metadata (`StoredSessionDraft.session/project`)
  // and per-session imports. They do NOT persist runtime issues /
  // decisions / next-actions today — those only live in active session
  // memory. So a loaded browser session contributes events + sources
  // (via imports) + analysis (if any), and the aggregator should not
  // pretend it has issues/decisions.
  const events = flattenImportEvents(imports);
  const sources = imports.map((entry) => entry.source);
  return {
    sessionId: summary.sessionId,
    title: summary.title,
    projectId: summary.projectId,
    projectName: summary.projectName,
    startedAt: null,
    endedAt: null,
    savedAt: summary.savedAt,
    source: "browserLocalStorage",
    loadStatus: imports.length > 0 || analysis ? "loaded" : "metadataOnly",
    isActive: false,
    events,
    sources,
    issues: [],
    decisions: [],
    nextActions: [],
    imports,
    analysis: analysis?.result ?? null,
  };
}

function browserSummaryToMetadataOnly(
  summary: StoredSessionSummary,
): ProjectMemoryLoadedSession {
  return {
    sessionId: summary.sessionId,
    title: summary.title,
    projectId: summary.projectId,
    projectName: summary.projectName,
    startedAt: null,
    endedAt: null,
    savedAt: summary.savedAt,
    source: "browserLocalStorage",
    loadStatus: "metadataOnly",
    isActive: false,
    events: [],
    sources: [],
    issues: [],
    decisions: [],
    nextActions: [],
    imports: [],
    analysis: null,
  };
}

function browserSummaryToFailed(
  summary: StoredSessionSummary,
  reason: string,
): ProjectMemoryLoadedSession {
  return {
    ...browserSummaryToMetadataOnly(summary),
    loadStatus: "failed",
    failureReason: reason,
  };
}

function flattenImportEvents(imports: StoredSessionImport[]) {
  const events = [];
  for (const entry of imports) {
    for (const event of entry.events) events.push(event);
  }
  return events;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
