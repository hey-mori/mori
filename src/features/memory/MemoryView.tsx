import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { HelpDisclosure } from "../../components/layout/HelpDisclosure";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { MoriDrawer } from "../../components/ui/MoriDrawer";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriSqliteStore } from "../../app/sqliteStore";
import { useMoriAppStore } from "../../app/store";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { getSessionPersistenceService } from "../../lib/storage/sessionPersistenceService";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
  StoredMoriPackageDraft,
  StoredSessionImport,
  StoredSessionSummary,
} from "../../lib/storage/storageTypes";
import {
  deriveProjectMemoryStats,
  getDecisionTimeline,
  getProjectMemorySummary,
  scopeLabelFor,
  type DerivedSession,
  type ProjectMemoryDataScope,
} from "../../lib/project-memory/projectMemory";
import {
  buildProjectMemoryResumePrompt,
  type ProjectMemoryResumePromptAudience,
  type ProjectMemoryResumePromptPrivacy,
} from "../../lib/project-memory/projectMemoryResumePrompt";
import { buildProjectMemoryConsolidationState } from "../../lib/project-memory/projectMemoryConsolidationState";
import { revertMemoryReviewAction } from "../../lib/project-memory/memoryReviewRevert";
import { ConsolidationPreviewCard } from "./ConsolidationPreviewCard";
import { AcceptedMemoriesCard } from "./AcceptedMemoriesCard";
import { AcceptedMemoryDetailDrawer } from "./AcceptedMemoryDetailDrawer";
import { MemoryAuditTrailCard } from "./MemoryAuditTrailCard";
import { QueryableMemoryCard } from "./QueryableMemoryCard";
import {
  getAcceptedMemoryRepository,
  type AcceptedMemoryStorageSource,
} from "../../lib/project-memory/acceptedMemoryRepository";
import { deriveSavedReportAvailability } from "../../lib/memory/projectMemoryContext";
import {
  buildProjectMemoryViewModel,
} from "../../lib/project-memory/projectMemoryViewModel";
import {
  getProjectMemoryDataBasisTone,
  type ProjectMemoryLoadedSession,
  type ProjectMemoryLoadedSessionStatus,
  type ProjectMemoryWarning,
} from "../../lib/project-memory/projectMemoryModel";
import { loadProjectMemorySessions } from "../../lib/project-memory/loadProjectMemorySessions";
import { ProjectMemoryHero } from "./ProjectMemoryHero";
import { RecentSessionsList } from "./RecentSessionsList";
import { DecisionTimelineCard } from "./DecisionTimelineCard";
import { RecurringIssuesCard } from "./RecurringIssuesCard";
import { KeyEvidenceCard } from "./KeyEvidenceCard";
import { SavedReportsCard } from "./SavedReportsCard";
import { ProjectMemorySummaryPanel } from "./ProjectMemorySummaryPanel";
import { ReimportHistoryCard } from "./ReimportHistoryCard";

export function MemoryView() {
  // `navigate` routes legacy session-surface keys (timeline) into the unified
  // Session Detail workspace; other keys (start) pass through unchanged.
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);
  const setSelectedEventId = useMoriAppStore((state) => state.setSelectedEventId);
  const memoryFocus = useMoriAppStore((state) => state.memoryFocus);
  const clearMemoryFocus = useMoriAppStore((state) => state.clearMemoryFocus);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const loadDesktopSession = useMoriSessionStore((state) => state.loadDesktopSession);
  const sqliteSessions = useMoriSqliteStore((state) => state.sessions);
  const sqliteKind = useMoriSqliteStore((state) => state.kind);
  const sqliteRefresh = useMoriSqliteStore((state) => state.refresh);
  const sqliteAvailable = useMoriSqliteStore((state) => state.available);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  useEffect(() => {
    if (sqliteAvailable && sqliteKind !== "ok") {
      void sqliteRefresh();
    }
  }, [sqliteAvailable, sqliteKind, sqliteRefresh]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);

  // Cross-session data the new view-model consumes. We re-enumerate every
  // time the active session id changes so that newly-applied imports show
  // up in the rollup without forcing a full page reload.
  const browserSessionSummaries = useMemo<StoredSessionSummary[]>(
    () => repository.listStoredSessions(),
    [repository, view.session.id],
  );
  const importsBySessionId = useMemo<Record<string, StoredSessionImport[]>>(() => {
    const map: Record<string, StoredSessionImport[]> = {};
    for (const summary of browserSessionSummaries) {
      map[summary.sessionId] = repository.listSessionImports(summary.sessionId);
    }
    // Active session imports (may not have been saved as a stored session
    // draft yet) — read separately so the rollup includes today's work.
    if (!map[view.session.id]) {
      map[view.session.id] = repository.listSessionImports(view.session.id);
    }
    return map;
  }, [repository, browserSessionSummaries, view.session.id]);
  const [packageDrafts, setPackageDrafts] = useState<StoredMoriPackageDraft[]>([]);
  useEffect(() => {
    setPackageDrafts(repository.listMoriPackageDrafts());
  }, [repository, view.session.id]);

  // Accepted Project Memory records — written by the Consolidation
  // Review Surface when the user clicks Apply. Re-read on view
  // mount and whenever the user navigates back from the review
  // surface (the route change re-renders this view).
  const projectId = view.project.id || "default";
  const [acceptedMemories, setAcceptedMemories] = useState<StoredAcceptedProjectMemory[]>([]);
  const [reviewActions, setReviewActions] = useState<StoredMemoryReviewAction[]>([]);
  const [memoryStorageSource, setMemoryStorageSource] =
    useState<AcceptedMemoryStorageSource>("browser-local-storage");
  const [memoryStorageFellBack, setMemoryStorageFellBack] = useState(false);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);

  // Consume a one-shot memory-focus deep-link (e.g. from Companion Inbox).
  // We wait until the requested memory id is present in the loaded
  // `acceptedMemories` list before opening the drawer so a slow load does
  // not silently drop the focus. The focus is cleared on a successful open.
  useEffect(() => {
    if (!memoryFocus) return;
    if (!acceptedMemories.some((memory) => memory.id === memoryFocus.memoryId)) return;
    setSelectedMemoryId(memoryFocus.memoryId);
    clearMemoryFocus();
  }, [memoryFocus, acceptedMemories, clearMemoryFocus]);
  const reloadMemory = useCallback(async () => {
    const memoryRepository = getAcceptedMemoryRepository();
    const [memoriesResult, actionsResult] = await Promise.all([
      memoryRepository.listAcceptedProjectMemories(projectId),
      memoryRepository.listMemoryReviewActions(projectId),
    ]);
    setAcceptedMemories(memoriesResult.data);
    setReviewActions(actionsResult.data);
    const fellBack = memoriesResult.fellBack || actionsResult.fellBack;
    setMemoryStorageFellBack(fellBack);
    setMemoryStorageSource(fellBack ? "browser-local-storage" : memoriesResult.source);
  }, [projectId]);
  useEffect(() => {
    let cancelled = false;
    void reloadMemory().catch(() => {
      // Listing failures fall back inside the repository; ignore here.
    });
    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [reloadMemory]);

  // Reviewed revert: apply a planned revert for one audit action, then
  // persist the memory write + `revert` audit row and reload. The pure
  // `revertMemoryReviewAction` throws when the action is not revertible.
  const handleRevertAction = useCallback(
    async (action: StoredMemoryReviewAction) => {
      const result = revertMemoryReviewAction(action, acceptedMemories, {
        appliedAt: new Date().toISOString(),
      });
      const memoryRepository = getAcceptedMemoryRepository();
      await memoryRepository.saveAcceptedProjectMemories(projectId, [result.memory]);
      await memoryRepository.appendMemoryReviewActions(projectId, [result.reviewAction]);
      await reloadMemory();
    },
    [acceptedMemories, projectId, reloadMemory],
  );

  // ─── saved-session body loading ──────────────────────────────────────
  const [loadedSessions, setLoadedSessions] = useState<ProjectMemoryLoadedSession[]>([]);
  useEffect(() => {
    let cancelled = false;
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
      savedBrowserSessions: browserSessionSummaries,
      savedSqliteSessions: sqliteSessions,
      desktopLoader,
    }).then((result) => {
      if (!cancelled) setLoadedSessions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [view, mode, repository, browserSessionSummaries, sqliteSessions]);

  const loadStatusBySessionId = useMemo<Record<string, ProjectMemoryLoadedSessionStatus>>(() => {
    const map: Record<string, ProjectMemoryLoadedSessionStatus> = {};
    for (const session of loadedSessions) {
      map[session.sessionId] = session.loadStatus;
    }
    return map;
  }, [loadedSessions]);

  // ─── view-model (new, multi-session aware) ───────────────────────────
  const viewModel = useMemo(
    () =>
      buildProjectMemoryViewModel({
        view,
        mode,
        hasAnalysis,
        savedBrowserSessions: browserSessionSummaries,
        savedSqliteSessions: sqliteSessions,
        importsBySessionId,
        moriPackages: packageDrafts,
        loadedSessions,
        storageAvailable: true,
      }),
    [
      view,
      mode,
      hasAnalysis,
      browserSessionSummaries,
      sqliteSessions,
      importsBySessionId,
      packageDrafts,
      loadedSessions,
    ],
  );

  // Derive the Project Memory Consolidation State alongside the
  // view-model. Pure derivation; nothing is persisted here. The
  // ConsolidationPreviewCard routes to the Consolidation Review Surface,
  // where decisions stay draft-only until the user applies them as
  // accepted memories and audit rows.
  const consolidationState = useMemo(
    () => buildProjectMemoryConsolidationState(viewModel, { acceptedMemories }),
    [viewModel, acceptedMemories],
  );

  // ─── legacy derivations (kept for the existing cards) ────────────────
  const primaryScope: ProjectMemoryDataScope = useMemo(() => {
    if (mode === "demo") return "demo";
    if (sqliteAvailable && sqliteKind === "ok") return "sqlite-saved";
    return "browser-draft";
  }, [mode, sqliteAvailable, sqliteKind]);

  const savedSessions = useMemo<DerivedSession[]>(() => {
    const entries: DerivedSession[] = [];
    const seen = new Set<string>();

    entries.push({
      sessionId: view.session.id,
      projectId: view.project.id,
      title: view.session.title,
      projectName: view.project.name,
      startedAt: view.session.startedAt,
      savedAt: view.session.endedAt,
      status: view.session.status,
      eventCount: view.events.length,
      sourceCount: view.sources.length,
      isCurrent: true,
      scope: mode === "demo" ? "demo" : "current-session",
      scopeLabel: mode === "demo" ? "Demo · live" : "Current · live",
    });
    seen.add(view.session.id);

    for (const session of sqliteSessions) {
      if (seen.has(session.sessionId)) continue;
      seen.add(session.sessionId);
      entries.push({
        sessionId: session.sessionId,
        projectId: session.projectId,
        title: session.title,
        projectName: session.projectName,
        startedAt: session.startedAt,
        savedAt: session.endedAt,
        status: session.status,
        eventCount: session.eventCount,
        sourceCount: session.sourceCount,
        isCurrent: false,
        scope: "sqlite-saved",
        scopeLabel: scopeLabelFor("sqlite-saved"),
      });
    }

    for (const summary of browserSessionSummaries) {
      if (seen.has(summary.sessionId)) continue;
      seen.add(summary.sessionId);
      entries.push({
        sessionId: summary.sessionId,
        projectId: summary.projectId,
        title: summary.title,
        projectName: summary.projectName,
        startedAt: null,
        savedAt: summary.savedAt,
        status: summary.status,
        eventCount: null,
        sourceCount: null,
        isCurrent: false,
        scope: "browser-draft",
        scopeLabel: scopeLabelFor("browser-draft"),
      });
    }
    return entries;
  }, [view, mode, sqliteSessions, browserSessionSummaries]);

  const stats = useMemo(
    () =>
      deriveProjectMemoryStats({
        view,
        savedSessions: savedSessions.filter((entry) => !entry.isCurrent),
        reportCount: packageDrafts.length,
      }),
    [view, savedSessions, packageDrafts.length],
  );

  const savedReportAvailability = useMemo(
    () => deriveSavedReportAvailability(packageDrafts.length),
    [packageDrafts.length],
  );

  const decisionTimeline = useMemo(() => getDecisionTimeline(view), [view]);
  const projectMemorySummary = useMemo(
    () =>
      getProjectMemorySummary({
        view,
        scope: primaryScope,
        savedSessionCount: savedSessions.filter((entry) => !entry.isCurrent).length,
        reportCount: packageDrafts.length,
        hasAnalysis,
      }),
    [view, primaryScope, savedSessions, packageDrafts.length, hasAnalysis],
  );
  const [resumeAudience, setResumeAudience] = useState<ProjectMemoryResumePromptAudience>("claude");
  const [resumePrivacy, setResumePrivacy] = useState<ProjectMemoryResumePromptPrivacy>("normal");
  const resumePrompt = useMemo(
    () =>
      buildProjectMemoryResumePrompt({
        memory: viewModel,
        audience: resumeAudience,
        privacyMode: resumePrivacy,
        acceptedMemories,
      }),
    [viewModel, resumeAudience, resumePrivacy, acceptedMemories],
  );
  const followUpPrompt = resumePrompt.body;

  function handleOpenSession(entry: DerivedSession) {
    if (entry.isCurrent) {
      setCurrentView("timeline");
      return;
    }
    if (entry.scope === "sqlite-saved") {
      void loadDesktopSession(entry.sessionId).then((ok) => {
        if (ok) setCurrentView("timeline");
      });
    }
    if (entry.scope === "browser-draft") {
      setCurrentView("start");
    }
  }

  const scopeLabel = scopeLabelFor(primaryScope);
  const dataBasisTone = getProjectMemoryDataBasisTone(viewModel.dataBasis);

  return (
    <PageShell
      className="memory-page"
      header={<PageHeader compact title="메모리" />}
      actionBar={
        <ActionBar
          label="메모리 데이터 범위"
          start={
            <>
              <Badge tone={mode === "demo" ? "gray" : "green"}>
                {mode === "demo" ? "데모 세션" : "실제 세션"}
              </Badge>
              <Badge tone="purple">{scopeLabel}</Badge>
              <Badge tone={dataBasisTone}>{viewModel.dataBasisLabel}</Badge>
              <HelpDisclosure label="집계 범위" ariaLabel="메모리 집계 범위 설명">
                <MemoryScopeHelp
                  mode={mode}
                  sqliteAvailable={sqliteAvailable}
                  sqliteKind={sqliteKind}
                  savedSessionCount={savedSessions.filter((entry) => !entry.isCurrent).length}
                />
              </HelpDisclosure>
            </>
          }
        />
      }
      aside={
        <ProjectMemorySummaryPanel
          summary={projectMemorySummary}
          followUpPrompt={followUpPrompt}
          audience={resumeAudience}
          privacyMode={resumePrivacy}
          onAudienceChange={setResumeAudience}
          onPrivacyModeChange={setResumePrivacy}
          onStartFollowUp={() => setCurrentView("start")}
        />
      }
    >
      <div className="memory-main">
          <ProjectMemoryHero
            projectName={view.project.name}
            projectDescription={view.project.description}
            stats={stats}
            scope={primaryScope}
            scopeLabel={scopeLabel}
            onStartFollowUp={() => setCurrentView("start")}
            onOpenLatestReport={() => setCurrentView("reports")}
            reportAvailable={packageDrafts.length > 0 || hasAnalysis}
            savedReportAvailability={savedReportAvailability}
          />

          <ProjectMemoryWarningsStrip warnings={viewModel.warnings} />

          <DecisionTimelineCard timeline={decisionTimeline} />

          <div className="memory-grid-two">
            <KeyEvidenceCard rows={viewModel.keyEvidence} />
            <RecurringIssuesCard
              rows={viewModel.recurringIssues}
              scopeNote={recurringIssuesScopeNote(viewModel.dataBasis, viewModel.recurringIssues.some((row) => row.crossSession))}
            />
          </div>

          <ReimportHistoryCard summary={viewModel.reimportSummary} />

          <ConsolidationPreviewCard
            state={consolidationState}
            onOpenReview={() => setCurrentView("consolidation")}
          />

          <AcceptedMemoriesCard
            memories={acceptedMemories}
            reviewActionCount={reviewActions.length}
            storageSource={memoryStorageSource}
            storageFellBack={memoryStorageFellBack}
            onSelectMemory={setSelectedMemoryId}
            selectedMemoryId={selectedMemoryId}
          />

          <QueryableMemoryCard
            memories={acceptedMemories}
            timelineEvents={view.events}
            evidenceSources={view.sources}
            reviewActions={reviewActions}
          />

          <MemoryAuditTrailCard
            actions={reviewActions}
            acceptedMemories={acceptedMemories}
            onRevertAction={handleRevertAction}
            storageSource={memoryStorageSource}
            storageFellBack={memoryStorageFellBack}
          />

          <RecentSessionsList
            sessions={savedSessions}
            loadStatusBySessionId={loadStatusBySessionId}
            onOpenSession={handleOpenSession}
            onStartNewSession={() => setCurrentView("start")}
          />

          <SavedReportsCard
            packages={packageDrafts}
            hasCurrentReportSurface
            onOpenReports={() => setCurrentView("reports")}
          />
      </div>

      <MoriDrawer
        open={selectedMemoryId !== null}
        onClose={() => setSelectedMemoryId(null)}
        ariaLabel="Accepted memory provenance"
      >
        {(() => {
          const memory = acceptedMemories.find((entry) => entry.id === selectedMemoryId);
          if (!memory) return null;
          return (
            <AcceptedMemoryDetailDrawer
              memory={memory}
              actions={reviewActions}
              view={{
                events: view.events,
                issues: view.issues,
                decisions: view.decisions,
              }}
              onRevertAction={handleRevertAction}
              onNavigateTimelineEvent={(eventId) => {
                setSelectedEventId(eventId);
                setCurrentView("timeline");
                setSelectedMemoryId(null);
              }}
              onNavigateReviewItem={(selection) => {
                openReviewItem(selection);
                setSelectedMemoryId(null);
              }}
              onClose={() => setSelectedMemoryId(null)}
            />
          );
        })()}
      </MoriDrawer>
    </PageShell>
  );
}

/**
 * Data-scope explanation moved behind a HelpDisclosure in the action bar —
 * the first screen no longer carries a permanent multi-line note. Same honest
 * copy, one click away.
 */
function MemoryScopeHelp({
  mode,
  sqliteAvailable,
  sqliteKind,
  savedSessionCount,
}: {
  mode: "demo" | "draft";
  sqliteAvailable: boolean;
  sqliteKind: string;
  savedSessionCount: number;
}) {
  const lines: string[] = [];
  if (mode === "demo") {
    lines.push("Demo 세션입니다. mock 메모리만 표시되며, 다른 세션은 집계되지 않습니다.");
  } else {
    lines.push("결정 / 이슈 / 출처 통계는 현재 세션 1건만 집계합니다.");
    if (sqliteAvailable) {
      if (sqliteKind === "ok") {
        lines.push(`Desktop SQLite에서 저장된 세션 ${savedSessionCount}건의 메타데이터를 목록에 포함합니다.`);
      } else {
        lines.push(`Desktop SQLite 상태: ${sqliteKind}. 세션 목록이 비어 있을 수 있습니다.`);
      }
    } else {
      lines.push("브라우저 모드: SQLite 세션 집계는 Tauri 앱에서만 가능합니다.");
    }
    if (savedSessionCount === 0) {
      lines.push("저장된 세션이 없습니다. Settings 또는 Reports에서 내보낸 .mori v0 JSON을 가져오면 목록에 추가됩니다.");
    }
  }
  return (
    <>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  );
}

function ProjectMemoryWarningsStrip({ warnings }: { warnings: ProjectMemoryWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <NoticeBanner tone="warning" title="데이터 범위 안내">
      <ul className="memory-warnings-list">
        {warnings.map((warning) => (
          <li key={describeWarningKey(warning)}>{describeWarning(warning)}</li>
        ))}
      </ul>
    </NoticeBanner>
  );
}

function describeWarningKey(warning: ProjectMemoryWarning): string {
  if (warning.kind === "saved-session-bodies-not-loaded") {
    return `saved-bodies-${warning.sessionCount}`;
  }
  if (warning.kind === "import-summaries-unavailable") {
    return `summaries-unavailable-${warning.reason}`;
  }
  if (warning.kind === "old-imports-without-identity") {
    return `legacy-imports-${warning.importCount}`;
  }
  return warning.kind;
}

function describeWarning(warning: ProjectMemoryWarning): string {
  switch (warning.kind) {
    case "saved-session-bodies-not-loaded":
      return `저장된 ${warning.sessionCount}건의 세션은 메타데이터만 표시됩니다. 결정/이슈/근거는 세션을 열어 확인하세요.`;
    case "saved-session-bodies-partial-load":
      return `저장 세션 ${warning.loadedCount}건의 본문을 로드했고, ${warning.metadataOnlyCount}건은 메타데이터만, ${warning.failedCount}건은 로드에 실패했습니다.`;
    case "saved-session-load-failed":
      return `저장 세션 ${warning.sessionCount}건의 본문 로드에 실패했습니다.${
        warning.reasons.length > 0 ? ` 원인: ${warning.reasons.slice(0, 2).join(", ")}` : ""
      }`;
    case "saved-session-body-loading-unavailable":
      if (warning.runtime === "sqlite") {
        return "Desktop SQLite 본문 로딩이 이 모드에서는 지원되지 않습니다.";
      }
      return "브라우저 저장 세션 본문을 읽을 수 없습니다.";
    case "import-summaries-unavailable":
      if (warning.reason === "sqlite-only") {
        return "Desktop SQLite 세션은 connector import 요약을 아직 제공하지 않습니다. 다음 마일스톤에서 보강됩니다.";
      }
      if (warning.reason === "demo") {
        return "Demo 세션은 import 요약을 집계하지 않습니다.";
      }
      return "Connector import 요약을 사용할 수 있는 저장소가 없습니다.";
    case "old-imports-without-identity":
      return `${warning.importCount}건의 이전 import는 connectorEventId가 없어 재import 집계에서 제외됩니다.`;
    case "old-sessions-without-analysis":
      return `${warning.sessionCount}건의 저장 세션에는 분석 결과가 저장되어 있지 않아 결정/이슈가 제한적으로 표시됩니다.`;
    case "demo-mode":
      return "Demo 모드: 실제 저장 세션은 집계되지 않습니다. 실 세션을 시작하면 누적 메모리가 표시됩니다.";
    case "storage-unavailable":
      return "로컬 저장소에 접근할 수 없습니다. 브라우저 storage 권한을 확인하세요.";
    default:
      return "";
  }
}

function recurringIssuesScopeNote(
  basis: import("../../lib/project-memory/projectMemoryModel").ProjectMemoryDataBasis,
  hasCrossSession: boolean,
): string {
  if (hasCrossSession) {
    return "여러 세션에서 반복되는 이슈를 묶어 보여줍니다. 영향받는 세션 수가 많을수록 우선순위가 높아집니다.";
  }
  if (basis === "activeSessionOnly" || basis === "unavailable") {
    return "현재 세션의 이슈 신호를 표시합니다. 다른 세션이 로드되면 반복 이슈를 자동으로 묶어 보여줍니다.";
  }
  if (basis === "savedSessionMetadataOnly") {
    return "저장 세션 본문이 로드되지 않아 반복 이슈는 현재 세션 기준으로만 표시됩니다.";
  }
  return "저장 세션 본문을 로드해 이슈를 집계했습니다. 동일 제목 기준으로 묶입니다.";
}
