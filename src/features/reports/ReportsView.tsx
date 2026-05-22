import { Archive, Calendar, FileText, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { isTauriRuntime, tauriCommands } from "../../lib/desktop";
import {
  buildClientSafeMoriPackage,
  createMoriPackageFromSession,
  MORI_PACKAGE_ZIP_MIME,
  serializeMoriPackage,
  zipMoriPackage,
} from "../../lib/mori-package";
import type { MoriPackageV0 } from "../../lib/mori-package";
import { buildResumePrompt } from "../../lib/report/resume-prompt";
import {
  exportPhaseRole,
  exportPhaseTone,
  exportRunningLabel,
  phaseForWriteResult,
  type MoriExportKind,
  type MoriExportPhase,
  type MoriExportWriteResult,
} from "../../lib/report/exportStatus";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import {
  describeAcceptedMemoryStorageSource,
  getAcceptedMemoryRepository,
  type AcceptedMemoryStorageSource,
} from "../../lib/project-memory/acceptedMemoryRepository";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";
import { buildMoriPackageExportPlan } from "../../lib/report/moriPackageExportPlan";
import {
  buildHandoffReadiness,
  type HandoffReadinessActionId,
} from "../../lib/report/handoffReadiness";
import {
  buildSessionWrapUp,
  type SessionWrapUpActionId,
  type SessionWrapUpUnresolvedItem,
} from "../../lib/report/sessionWrapUp";
import {
  getUnresolvedItems,
  UNRESOLVED_REASON_LABEL,
  type UnresolvedItem,
} from "../../lib/review-workspace/reviewWorkspace";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { formatDate, formatDateTime } from "../../lib/formatting/time";
import { deriveSessionStatus } from "../../lib/session/sessionStatus";
import { getReportEvidenceSummary } from "../../lib/sources/traceability";
import { ResumePromptCard, type ResumePromptOrigin } from "./ResumePromptCard";
import { SessionSummaryStrip } from "./SessionSummaryStrip";
import { WorkContinuationCards } from "./WorkContinuationCards";
import { ReportBuilderPanel } from "./ReportBuilderPanel";
import { HandoffReadinessPanel } from "./HandoffReadinessPanel";

export function ReportsView({ embedded = false }: { embedded?: boolean } = {}) {
  // `navigate` routes legacy session-surface keys (timeline / evidence) into
  // the unified Session Detail workspace; other keys pass through unchanged.
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);
  const openAcceptedMemory = useMoriAppStore((state) => state.openAcceptedMemory);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const sessionState = useMoriSessionStore((state) => state);
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const analysis = useMoriSessionStore((state) => state.analysis);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const analysisProviderLabel = useMoriSessionStore((state) => state.analysisProviderLabel);
  const analysisError = useMoriSessionStore((state) => state.analysisError);
  const runQuickPass = useMoriSessionStore((state) => state.runQuickPass);
  const imports = useMoriSessionStore((state) => state.imports);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  // Accepted Project Memory records — written by the Consolidation
  // Review Surface. Reports surface eligible records as a dedicated
  // section gated by the report's audience tier. Loaded through the
  // runtime-aware repository so desktop mode reads from SQLite.
  const reportProjectId = view.project.id || "default";
  const [acceptedMemories, setAcceptedMemories] = useState<StoredAcceptedProjectMemory[]>([]);
  const [reviewActions, setReviewActions] = useState<StoredMemoryReviewAction[]>([]);
  const [memoryStorageSource, setMemoryStorageSource] =
    useState<AcceptedMemoryStorageSource>("browser-local-storage");
  const [memoryStorageFellBack, setMemoryStorageFellBack] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const memoryRepository = getAcceptedMemoryRepository();
    void Promise.all([
      memoryRepository.listAcceptedProjectMemories(reportProjectId),
      memoryRepository.listMemoryReviewActions(reportProjectId),
    ])
      .then(([memoriesResult, actionsResult]) => {
        if (cancelled) return;
        setAcceptedMemories(memoriesResult.data);
        setReviewActions(actionsResult.data);
        const fellBack = memoriesResult.fellBack || actionsResult.fellBack;
        setMemoryStorageFellBack(fellBack);
        setMemoryStorageSource(fellBack ? "browser-local-storage" : memoriesResult.source);
      });
    return () => {
      cancelled = true;
    };
  }, [reportProjectId]);

  const status = useMemo(
    () =>
      deriveSessionStatus(sessionState, {
        sourceCount: view.sources.length,
        eventCount: view.events.length,
      }),
    [sessionState, view.sources.length, view.events.length],
  );
  const evidenceSummary = useMemo(() => getReportEvidenceSummary(view), [view]);

  const isDemo = mode === "demo";
  const canRunQuickPass = !isDemo && imports.length > 0 && analysisStatus !== "running";

  const resumePromptText = useMemo(() => {
    if (hasAnalysis && analysis) return analysis.summary.resumePrompt;
    if (mode === "demo") return view.summary.resumePrompt || buildResumePrompt(view);
    if (imports.length === 0) return "";
    return buildResumePrompt(view);
  }, [analysis, hasAnalysis, mode, imports.length, view]);

  const promptOrigin = useMemo<ResumePromptOrigin>(() => {
    if (hasAnalysis) return { kind: "analysis", providerLabel: analysisProviderLabel ?? "deterministic" };
    if (isDemo) return { kind: "demo" };
    return { kind: "fallback" };
  }, [hasAnalysis, isDemo, analysisProviderLabel]);

  const duration = useMemo(() => formatDuration(view.session.startedAt, view.session.endedAt), [view.session.startedAt, view.session.endedAt]);

  const memoryHealth = useMemo(() => {
    let stale = 0;
    let contradicted = 0;
    for (const memory of acceptedMemories) {
      if (memory.status === "stale") stale += 1;
      else if (memory.status === "contradicted") contradicted += 1;
    }
    return {
      stale,
      contradicted,
    };
  }, [acceptedMemories]);
  const attentionMemoryEntries = useMemo(
    () =>
      acceptedMemories
        .filter((memory) => memory.status === "stale" || memory.status === "contradicted")
        .map((memory) => ({
          id: memory.id,
          title: memory.title,
          status: memory.status as "stale" | "contradicted",
        })),
    [acceptedMemories],
  );
  const unresolvedPreviewItems = useMemo(
    () =>
      getUnresolvedItems({
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
      }).map(toSessionWrapUpUnresolvedItem),
    [view.issues, view.decisions, view.nextActions],
  );
  const wrapUp = useMemo(
    () =>
      buildSessionWrapUp({
        sourceCount: view.sources.length,
        eventCount: view.events.length,
        issueCount: view.issues.length,
        decisionCount: view.decisions.length,
        nextActionCount: view.nextActions.length,
        importCount: imports.length,
        hasAnalysis,
        analysisRunning: analysisStatus === "running",
        canRunQuickPass,
        acceptedMemoryCount: acceptedMemories.length,
        auditActionCount: reviewActions.length,
        staleMemoryCount: memoryHealth.stale,
        contradictedMemoryCount: memoryHealth.contradicted,
        unresolvedItems: unresolvedPreviewItems,
        attentionMemories: attentionMemoryEntries,
        resumePromptReady: resumePromptText.trim().length > 0,
      }),
    [
      view.sources.length,
      view.events.length,
      view.issues.length,
      view.decisions.length,
      view.nextActions.length,
      imports.length,
      hasAnalysis,
      analysisStatus,
      canRunQuickPass,
      acceptedMemories.length,
      memoryHealth,
      reviewActions.length,
      unresolvedPreviewItems,
      attentionMemoryEntries,
      resumePromptText,
    ],
  );
  const exportPlan = useMemo(
    () =>
      buildMoriPackageExportPlan({
        view,
        consolidatedMemories: acceptedMemories,
        auditTrail: reviewActions,
      }),
    [view, acceptedMemories, reviewActions],
  );
  const handoffReadiness = useMemo(
    () =>
      buildHandoffReadiness({
        sourceCount: view.sources.length,
        eventCount: view.events.length,
        issueCount: view.issues.length,
        decisionCount: view.decisions.length,
        nextActionCount: view.nextActions.length,
        hasAnalysis,
        analysisRunning: analysisStatus === "running",
        canRunQuickPass,
        acceptedMemoryCount: acceptedMemories.length,
        staleMemoryCount: memoryHealth.stale,
        contradictedMemoryCount: memoryHealth.contradicted,
        resumePromptReady: resumePromptText.trim().length > 0,
        exportPlan,
      }),
    [
      view.sources.length,
      view.events.length,
      view.issues.length,
      view.decisions.length,
      view.nextActions.length,
      hasAnalysis,
      analysisStatus,
      canRunQuickPass,
      acceptedMemories.length,
      memoryHealth,
      resumePromptText,
      exportPlan,
    ],
  );

  function handleWrapUpAction(actionId: SessionWrapUpActionId) {
    switch (actionId) {
      case "addEvidence":
        setCurrentView("evidence");
        return;
      case "runQuickPass":
        if (canRunQuickPass) void runQuickPass();
        return;
      case "reviewMemory":
        setCurrentView("memory");
        return;
      case "reviewMemoryHealth":
        setCurrentView("consolidation");
        return;
      case "reviewHandoff":
        document.getElementById("reports-handoff")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      case "waitForAnalysis":
      default:
        return;
    }
  }

  function handleOpenUnresolvedItem(item: SessionWrapUpUnresolvedItem) {
    switch (item.kind) {
      case "issue":
        openReviewItem({ kind: "issue", issueId: item.id });
        return;
      case "decision":
        openReviewItem({ kind: "decision", decisionId: item.id });
        return;
      case "nextAction":
        openReviewItem({ kind: "nextAction", nextActionId: item.id });
        return;
      default:
        return;
    }
  }

  function handleHandoffAction(actionId: HandoffReadinessActionId) {
    switch (actionId) {
      case "addEvidence":
        setCurrentView("evidence");
        return;
      case "runQuickPass":
        if (canRunQuickPass) void runQuickPass();
        return;
      case "reviewMemory":
        setCurrentView("memory");
        return;
      case "reviewMemoryHealth":
        setCurrentView("consolidation");
        return;
      case "openReportBuilder":
        document.getElementById("reports-builder")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      case "openPackageExport":
        document.getElementById("reports-package-export")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      case "copyResume":
      default:
        return;
    }
  }

  const quickPassButton = !isDemo ? (
    <Button
      variant="primary"
      icon={Sparkles}
      onClick={() => runQuickPass()}
      disabled={!canRunQuickPass}
      title={
        canRunQuickPass
          ? "Quick Pass 실행"
          : imports.length === 0
            ? "먼저 소스를 가져오세요."
            : "이미 실행 중입니다."
      }
    >
      {analysisStatus === "running"
        ? "분석 중..."
        : hasAnalysis
          ? "Quick Pass 재실행"
          : "Quick Pass 실행"}
    </Button>
  ) : undefined;

  const statusBadges = (
    <>
      <Badge tone="gray" title="이 리포트는 활성 세션을 기준으로 합니다.">
        <Calendar size={12} aria-hidden="true" /> {formatDate(view.session.startedAt)}
      </Badge>
      <Badge tone="gray">{evidenceSummary.dataBasis}</Badge>
    </>
  );

  const actionCounts = (
    <div className="reports-action-counts">
      <Badge tone="purple">출처 {view.sources.length}</Badge>
      <Badge tone="blue">이벤트 {view.events.length}</Badge>
      <Badge tone="red">이슈 {view.issues.length}</Badge>
      <Badge tone="green">결정 {view.decisions.length}</Badge>
    </div>
  );

  const asideNode = (
    <ReportBuilderPanel
      id="reports-builder"
      view={view}
      resumePromptOverride={resumePromptText}
      acceptedMemories={acceptedMemories}
    />
  );

  const bodyNode = (
    <>
      <ReportsAnalysisNotice
        mode={mode}
        hasAnalysis={hasAnalysis}
        status={analysisStatus}
        providerLabel={analysisProviderLabel}
        providerName={analysis?.providerName ?? null}
        generatedAt={analysis?.generatedAt ?? null}
        error={analysisError}
        importsCount={imports.length}
        onGoToEvidence={() => setCurrentView("evidence")}
      />

      <div className="reports-main">
          <SessionSummaryStrip
            dataBasis={evidenceSummary.dataBasis}
            dataBasisTone={status.dataBasisTone}
            duration={duration}
            sourceCount={view.sources.length}
            eventCount={view.events.length}
            issueCount={view.issues.length}
            decisionCount={view.decisions.length}
            nextActionCount={view.nextActions.length}
            wrapUp={wrapUp}
            onWrapUpAction={handleWrapUpAction}
            onOpenUnresolvedItem={handleOpenUnresolvedItem}
            onOpenAttentionMemory={openAcceptedMemory}
          />

          <HandoffReadinessPanel
            model={handoffReadiness}
            resumePrompt={resumePromptText}
            onAction={handleHandoffAction}
          />

          <div id="reports-handoff" className="reports-handoff-group">
            <ResumePromptCard
              prompt={resumePromptText}
              origin={promptOrigin}
              emptyHint={
                imports.length === 0
                  ? "아직 가져온 소스가 없습니다. Evidence에서 소스를 추가한 뒤 Quick Pass를 실행하면 분석 기반 프롬프트가 표시됩니다."
                  : "Quick Pass를 실행하면 분석 기반 프롬프트가 표시됩니다."
              }
            />

            <WorkContinuationCards view={view} onOpenTimeline={() => setCurrentView("timeline")} />

            <MoriPackageStrip
              view={view}
              acceptedMemories={acceptedMemories}
              reviewActions={reviewActions}
              memoryStorageSource={memoryStorageSource}
              memoryStorageFellBack={memoryStorageFellBack}
              exportPlan={exportPlan}
            />
          </div>
      </div>
    </>
  );

  // Embedded inside the Memory 리포트 segment: render content-only (no PageShell
  // or page header — Memory owns the surface chrome), with the report builder as
  // a right rail in the shared session-tab split layout.
  if (embedded) {
    // The session tab strip already shows 흐름 / 증거 / 인사이트 counts as
    // badges, so the report bar drops the duplicate `actionCounts` block and
    // keeps only the status badges (capture date, source, Quick Pass state)
    // and the Quick Pass action.
    return (
      <div className="session-tab-pane reports-embedded">
        <div className="session-tab-actionbar">
          <ActionBar
            label="보고서 세션 상태"
            start={statusBadges}
            end={quickPassButton}
          />
        </div>
        <div className="session-tab-split">
          <div className="session-tab-main">{bodyNode}</div>
          {asideNode}
        </div>
      </div>
    );
  }

  return (
    <PageShell
      className="reports-page"
      header={<PageHeader compact title="리포트" right={quickPassButton} />}
      actionBar={<ActionBar label="보고서 세션 상태" start={statusBadges} end={actionCounts} />}
      aside={asideNode}
    >
      {bodyNode}
    </PageShell>
  );
}

/**
 * Compact analysis-state notice. The Quick Pass action lives in the header and
 * the evidence counts live in the action bar, so this only surfaces when there
 * is a meaningful state to report — a failure, a run, an empty real session,
 * or the provider line once results exist. Stays quiet otherwise.
 */
function ReportsAnalysisNotice({
  mode,
  hasAnalysis,
  status,
  providerLabel,
  providerName,
  generatedAt,
  error,
  importsCount,
  onGoToEvidence,
}: {
  mode: "demo" | "draft";
  hasAnalysis: boolean;
  status: string;
  providerLabel: string | null;
  providerName: string | null;
  generatedAt: string | null;
  error: string | null;
  importsCount: number;
  onGoToEvidence: () => void;
}) {
  if (mode === "demo") return null;

  if (status === "failed") {
    return (
      <NoticeBanner tone="danger" title="Quick Pass 실패">
        {error ?? "알 수 없는 오류"}
      </NoticeBanner>
    );
  }
  if (status === "running") {
    return <NoticeBanner tone="info">Quick Pass 실행 중...</NoticeBanner>;
  }
  if (!hasAnalysis && importsCount === 0) {
    return (
      <NoticeBanner
        tone="info"
        title="아직 가져온 소스가 없습니다"
        actions={<Button onClick={onGoToEvidence}>증거 탭으로 이동</Button>}
      >
        증거 탭에서 소스를 추가하고 Quick Pass를 실행하면 Resume 프롬프트와 리포트가 풍부해집니다.
      </NoticeBanner>
    );
  }
  if (!hasAnalysis) {
    return (
      <NoticeBanner tone="info">
        가져온 소스가 있습니다. 우측 상단에서 Quick Pass를 실행하면 Resume 프롬프트와 리포트가 풍부해집니다.
      </NoticeBanner>
    );
  }

  const providerCopy = providerLabel ?? "deterministic";
  const providerKind = providerName === "ollama-quick-pass-v1" ? "로컬 LLM" : "휴리스틱";
  return (
    <NoticeBanner tone="success" icon={null}>
      <span className="reports-analysis-meta">
        {providerCopy} · {providerKind}
        {generatedAt ? ` · ${formatDateTime(generatedAt)}` : ""}
      </span>
    </NoticeBanner>
  );
}

async function writeMoriZipPackage(
  zipBytes: Uint8Array,
  filename: string,
): Promise<MoriExportWriteResult> {
  if (isTauriRuntime()) {
    try {
      const saved = await tauriCommands.saveMoriPackageZipAs({
        packageBytes: Array.from(zipBytes),
        suggestedFilename: filename,
      });
      return saved.cancelled
        ? { status: "cancelled", message: "내보내기를 취소했습니다. Browser draft는 저장되었습니다." }
        : { status: "saved", message: `데스크톱 .mori 패키지를 저장했습니다 — ${saved.path}` };
    } catch (error) {
      return {
        status: "error",
        message: `데스크톱 저장 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      };
    }
  }
  if (typeof window !== "undefined") {
    // Copy into a fresh ArrayBuffer-backed view for the Blob ctor.
    const blob = new Blob([new Uint8Array(zipBytes)], { type: MORI_PACKAGE_ZIP_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return {
      status: "saved",
      message: `${filename} (.mori zip)을 다운로드했습니다. Browser draft는 저장되었습니다.`,
    };
  }
  return { status: "error", message: "이 환경에서는 내보내기를 사용할 수 없습니다." };
}

function MoriPackageStrip({
  view,
  acceptedMemories,
  reviewActions,
  memoryStorageSource,
  memoryStorageFellBack,
  exportPlan,
}: {
  view: ReturnType<typeof selectSessionView>;
  acceptedMemories: StoredAcceptedProjectMemory[];
  reviewActions: StoredMemoryReviewAction[];
  memoryStorageSource: AcceptedMemoryStorageSource;
  memoryStorageFellBack: boolean;
  exportPlan: ReturnType<typeof buildMoriPackageExportPlan>;
}) {
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const [phase, setPhase] = useState<MoriExportPhase>("idle");
  const [activeKind, setActiveKind] = useState<MoriExportKind | null>(null);
  const [message, setMessage] = useState<string>(
    ".mori v0 패키지를 내보낼 준비가 되었습니다.",
  );
  const busy = phase === "running";
  async function runExport(clientSafe: boolean) {
    const kind: MoriExportKind = clientSafe ? "clientSafe" : "full";
    setPhase("running");
    setActiveKind(kind);
    setMessage(exportRunningLabel(kind));
    try {
      const fullPkg = createMoriPackageFromSession(view, {
        consolidatedMemories: acceptedMemories,
        auditTrail: reviewActions,
      });
      // The full package is the canonical draft; a client-safe export
      // is a filtered, derived artifact.
      repository.saveMoriPackageDraft(fullPkg);
      const pkg: MoriPackageV0 = clientSafe
        ? buildClientSafeMoriPackage(fullPkg)
        : fullPkg;
      // `serializeMoriPackage` validates and fails closed; the zip is
      // built from the same validated package via the canonical layout.
      serializeMoriPackage(pkg);
      const zipBytes = zipMoriPackage(pkg);
      const filename = clientSafe
        ? `${pkg.manifest.packageId}-client-safe.mori`
        : `${pkg.manifest.packageId}.mori`;
      const written = await writeMoriZipPackage(zipBytes, filename);
      const settled = phaseForWriteResult(written);
      if (settled === "success" && clientSafe) {
        setMessage(
          `${written.message} · 클라이언트 공유용: memory ${exportPlan.clientSafe.memories}건 포함 / ${exportPlan.clientSafe.droppedMemories}건 제외.`,
        );
      } else {
        setMessage(written.message);
      }
      setPhase(settled);
    } catch (error) {
      setPhase("error");
      setMessage(
        `내보내기 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    }
  }

  const tone = exportPhaseTone(phase);
  const storageLabel = describeAcceptedMemoryStorageSource(memoryStorageSource);
  return (
    <section id="reports-package-export" className="mori-package-strip" aria-label=".mori package export">
      <div className="mori-package-strip-intro">
        <h3>
          <Archive size={14} aria-hidden="true" /> .mori v0 패키지
        </h3>
        <p>
          세션, 근거, 리뷰 결과, 승인된 메모리, 감사 이력을 하나의 로컬 .mori 파일로
          묶습니다. 가져오기는 자동 병합이 아니라 Consolidation Review로 다시 들어갑니다.
        </p>
        <div className="mori-package-export-options" aria-label=".mori export contents">
          <PackageOptionSummary
            title="전체 패키지"
            counts={exportPlan.full}
            detail={
              exportPlan.full.sensitiveMemories > 0
                ? `민감 메모리 ${exportPlan.full.sensitiveMemories}건 포함`
                : "승인된 메모리와 감사 이력 전체 포함"
            }
          />
          <PackageOptionSummary
            title="클라이언트 안전"
            counts={exportPlan.clientSafe}
            detail={`메모리 ${exportPlan.clientSafe.droppedMemories}건 · 감사 ${exportPlan.clientSafe.droppedAuditRows}건 제외`}
          />
        </div>
        <p className="mori-package-storage-note">
          승인된 메모리 출처: {storageLabel}
          {memoryStorageFellBack ? " · SQLite 읽기 실패로 browser fallback 사용" : ""}
        </p>
      </div>
      <div className="mori-package-strip-actions">
        <div className="mori-package-strip-buttons">
          <Button icon={FileText} onClick={() => runExport(false)} disabled={busy}>
            {busy && activeKind === "full" ? "내보내는 중..." : ".mori 패키지 내보내기"}
          </Button>
          <Button icon={FileText} onClick={() => runExport(true)} disabled={busy}>
            {busy && activeKind === "clientSafe"
              ? "내보내는 중..."
              : "클라이언트 공유용 .mori 내보내기"}
          </Button>
        </div>
        <p
          className={`mori-package-feedback tone-${tone}`}
          role={exportPhaseRole(phase)}
          aria-live={phase === "error" ? "assertive" : "polite"}
        >
          {phase === "running" ? <span className="mori-package-feedback-spinner" aria-hidden="true" /> : null}
          <span>{message}</span>
        </p>
      </div>
    </section>
  );
}

function toSessionWrapUpUnresolvedItem(item: UnresolvedItem): SessionWrapUpUnresolvedItem {
  if (item.kind === "issue") {
    return {
      id: item.issue.id,
      kind: "issue",
      title: item.issue.title,
      detail: UNRESOLVED_REASON_LABEL[item.reason],
    };
  }
  if (item.kind === "decision") {
    return {
      id: item.decision.id,
      kind: "decision",
      title: item.decision.title,
      detail: UNRESOLVED_REASON_LABEL[item.reason],
    };
  }
  return {
    id: item.nextAction.id,
    kind: "nextAction",
    title: item.nextAction.title,
    detail: UNRESOLVED_REASON_LABEL[item.reason],
  };
}

function PackageOptionSummary({
  title,
  counts,
  detail,
}: {
  title: string;
  counts: {
    sources: number;
    events: number;
    memories: number;
    auditRows: number;
  };
  detail: string;
}) {
  return (
    <article className="mori-package-option">
      <header>
        <strong>{title}</strong>
        <span>{detail}</span>
      </header>
      <dl>
        <div>
          <dt>출처</dt>
          <dd>{counts.sources}</dd>
        </div>
        <div>
          <dt>이벤트</dt>
          <dd>{counts.events}</dd>
        </div>
        <div>
          <dt>메모리</dt>
          <dd>{counts.memories}</dd>
        </div>
        <div>
          <dt>감사</dt>
          <dd>{counts.auditRows}</dd>
        </div>
      </dl>
    </article>
  );
}

function formatDuration(start: string, end: string): string {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return "—";
  }
  const ms = endTime - startTime;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes - hours * 60;
  if (hours < 24) return remMin ? `${hours}시간 ${remMin}분` : `${hours}시간`;
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  return remHours ? `${days}일 ${remHours}시간` : `${days}일`;
}
