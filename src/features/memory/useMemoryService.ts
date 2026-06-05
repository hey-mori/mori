import { useEffect, useMemo, useState } from "react";
import { selectSessionMode, selectSessionView, useSessionStore } from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import {
  loadProjectMemorySessions,
  toProjectMemorySessionEvidence,
} from "../../lib/project-memory/loadProjectMemorySessions";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { getSessionPersistenceService } from "../../lib/storage/sessionPersistenceService";
import type { MemoryCapabilityInput } from "../../lib/memory-api/memoryApiTypes";
import type { ProjectMemorySessionEvidence } from "../../lib/project-memory/queryableMemory";
import type { QuickPassAnalysisSettings } from "../../lib/analysis/analysisSettings";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";

/**
 * The data-binding seam for the memory-api facade
 * (`docs/design/memory-as-a-service.md` §3.3). Loads the active project's
 * accepted memory + review actions, then loads every saved session's reviewed
 * evidence so search/ask span the whole project (not just the active session),
 * and returns the one `MemoryCapabilityInput` every memory consumer runs
 * against. The warehouse builds this inline; any consumer outside it (the Ask
 * Mori surface, the Home command space) calls this hook so it never
 * re-implements the loading. See
 * `docs/design/cross-session-memory-search.md` for the cross-session scope.
 */
export function useMemoryService(): {
  input: MemoryCapabilityInput;
  settings: QuickPassAnalysisSettings;
  loading: boolean;
} {
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const settings = useSessionStore((state) => state.analysisSettings);
  const sqliteSessions = useSqliteStore((state) => state.sessions);
  const projectId = view.project.id || "default";
  const activeSessionId = view.session.id;

  const repository = useMemo(() => createBrowserDraftRepository(), []);

  const [memories, setMemories] = useState<StoredAcceptedProjectMemory[]>([]);
  const [reviewActions, setReviewActions] = useState<StoredMemoryReviewAction[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setMemoriesLoading(true);
    const accepted = getAcceptedMemoryRepository();
    void Promise.all([
      accepted.listAcceptedProjectMemories(projectId),
      accepted.listMemoryReviewActions(projectId),
    ])
      .then(([memoryResult, actionResult]) => {
        if (cancelled) return;
        setMemories(memoryResult.data);
        setReviewActions(actionResult.data);
      })
      .finally(() => {
        if (!cancelled) setMemoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Saved-session bodies, loaded the same way the warehouse loads them, so a
  // question spans every session's reviewed evidence with per-session
  // attribution. Degrades to active-session-only while in flight or when no
  // saved bodies are available.
  const [sessionEvidence, setSessionEvidence] = useState<ProjectMemorySessionEvidence[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setSessionsLoading(true);
    const persistenceService = getSessionPersistenceService();
    const desktopLoader = persistenceService.isDesktop()
      ? {
          isDesktop: () => persistenceService.isDesktop(),
          loadSessionFromDesktop: (sessionId: string) =>
            persistenceService.loadSessionFromDesktop(sessionId),
        }
      : null;
    void loadProjectMemorySessions({
      activeSession: view,
      activeIsLive: mode !== "demo",
      repository,
      savedBrowserSessions: repository.listStoredSessions(),
      savedSqliteSessions: sqliteSessions,
      desktopLoader,
    })
      .then((loaded) => {
        if (!cancelled) setSessionEvidence(toProjectMemorySessionEvidence(loaded));
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `activeSessionId` re-enumerates when the active session changes so a
    // newly-applied import shows up; `view` itself is intentionally not a
    // dependency (its identity changes on every event edit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeSessionId, mode, repository, sqliteSessions]);

  const input = useMemo<MemoryCapabilityInput>(
    () => ({
      acceptedMemories: memories,
      reviewActions,
      events: view.events,
      sources: view.sources,
      sessionEvidence: sessionEvidence.length > 0 ? sessionEvidence : undefined,
    }),
    [memories, reviewActions, view.events, view.sources, sessionEvidence],
  );

  return { input, settings, loading: memoriesLoading || sessionsLoading };
}
