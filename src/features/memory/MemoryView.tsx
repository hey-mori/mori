import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { Badge } from "../../components/ui/Badge";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriSqliteStore } from "../../app/sqliteStore";
import { useMoriAppStore } from "../../app/store";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import type { StoredMoriPackageDraft } from "../../lib/storage/storageTypes";
import {
  buildFollowUpPrompt,
  deriveProjectMemoryStats,
  getDecisionTimeline,
  getKeyEvidence,
  getProjectMemorySummary,
  getRecurringIssues,
  scopeLabelFor,
  type DerivedSession,
  type ProjectMemoryDataScope,
} from "../../lib/project-memory/projectMemory";
import { deriveSavedReportAvailability } from "../../lib/memory/projectMemoryContext";
import { ProjectMemoryHero } from "./ProjectMemoryHero";
import { RecentSessionsList } from "./RecentSessionsList";
import { DecisionTimelineCard } from "./DecisionTimelineCard";
import { RecurringIssuesCard } from "./RecurringIssuesCard";
import { KeyEvidenceCard } from "./KeyEvidenceCard";
import { SavedReportsCard } from "./SavedReportsCard";
import { ProjectMemorySummaryPanel } from "./ProjectMemorySummaryPanel";

export function MemoryView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
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
  const [packageDrafts, setPackageDrafts] = useState<StoredMoriPackageDraft[]>([]);

  // Browser draft does not expose `listMoriPackageDrafts` today; we
  // opportunistically reload the package linked to the current session id so
  // the user sees at least their last export. Cross-package listing requires
  // a small extension to BrowserDraftRepository and is documented as planned.
  useEffect(() => {
    const draft = repository.loadMoriPackageDraft(view.session.id);
    setPackageDrafts(draft ? [draft] : []);
  }, [repository, view.session.id]);

  const browserSessionSummaries = useMemo(() => repository.listStoredSessions(), [repository]);

  const primaryScope: ProjectMemoryDataScope = useMemo(() => {
    if (mode === "demo") return "demo";
    if (sqliteAvailable && sqliteKind === "ok") return "sqlite-saved";
    return "browser-draft";
  }, [mode, sqliteAvailable, sqliteKind]);

  const savedSessions = useMemo<DerivedSession[]>(() => {
    const entries: DerivedSession[] = [];
    const seen = new Set<string>();

    // Current session always shown first.
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
        // Stats counter consumes saved-only entries (the current session is
        // already in `view`), so we drop it from the input.
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
  const recurringIssues = useMemo(() => getRecurringIssues(view, primaryScope), [view, primaryScope]);
  const keyEvidence = useMemo(() => getKeyEvidence(view, 6), [view]);
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
  const followUpPrompt = useMemo(
    () =>
      buildFollowUpPrompt({
        view,
        savedSessionCount: savedSessions.filter((entry) => !entry.isCurrent).length,
        reportCount: packageDrafts.length,
        hasAnalysis,
      }),
    [view, savedSessions, packageDrafts.length, hasAnalysis],
  );

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
    // Browser-draft entries: the storage layer does not expose load-by-id today,
    // so we route the user to Start Session as a fallback rather than fake-open.
    if (entry.scope === "browser-draft") {
      setCurrentView("start");
    }
  }

  const scopeLabel = scopeLabelFor(primaryScope);

  return (
    <div className="page memory-workspace">
      <PageHeader
        title="Project Memory"
        subtitle="Mori가 누적한 결정 / 이슈 / 근거 / 리포트를 한곳에 모아 다음 세션 컨텍스트로 이어줍니다."
        right={
          <div className="memory-page-actions">
            <Badge tone={mode === "demo" ? "gray" : "green"}>{mode === "demo" ? "데모 세션" : "실제 세션"}</Badge>
            <Badge tone="purple">{scopeLabel}</Badge>
          </div>
        }
      />
      <SessionModeBanner />

      <div className="memory-layout">
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

          <DataScopeNote
            mode={mode}
            sqliteAvailable={sqliteAvailable}
            sqliteKind={sqliteKind}
            savedSessionCount={savedSessions.filter((entry) => !entry.isCurrent).length}
          />

          <DecisionTimelineCard timeline={decisionTimeline} />

          <div className="memory-grid-two">
            <KeyEvidenceCard rows={keyEvidence} />
            <RecurringIssuesCard
              rows={recurringIssues}
              scopeNote={
                primaryScope === "demo"
                  ? "데모 세션 기준 신호 점수입니다."
                  : "현재 세션의 이슈 신호를 표시합니다. 다중 세션 빈도 집계는 다음 마일스톤입니다."
              }
            />
          </div>

          <RecentSessionsList
            sessions={savedSessions}
            onOpenSession={handleOpenSession}
            onStartNewSession={() => setCurrentView("start")}
          />

          <SavedReportsCard
            packages={packageDrafts}
            hasCurrentReportSurface
            onOpenReports={() => setCurrentView("reports")}
          />
        </div>

        <ProjectMemorySummaryPanel
          summary={projectMemorySummary}
          followUpPrompt={followUpPrompt}
          onStartFollowUp={() => setCurrentView("start")}
        />
      </div>
    </div>
  );
}

function DataScopeNote({
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
    <div className="memory-scope-note" role="status">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}
