import { Archive, Calendar, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriFeatureStatusBadge } from "../../components/ui/MoriFeatureStatusBadge";
import { MoriSection } from "../../components/ui/MoriSection";
import { MoriStatCard } from "../../components/ui/MoriStatCard";
import {
  countFeaturesByStatus,
  type FeatureId,
} from "../../app/featureStatus";
import { isTauriRuntime, tauriCommands } from "../../lib/desktop";
import {
  buildClientSafeMoriPackage,
  createMoriPackageFromSession,
  getPackageConsolidatedMemories,
  MORI_PACKAGE_ZIP_MIME,
  serializeMoriPackage,
  zipMoriPackage,
} from "../../lib/mori-package";
import type { MoriPackageV0 } from "../../lib/mori-package";
import { buildResumePrompt } from "../../lib/report/resume-prompt";
import { CompanionCard } from "../companion/CompanionCard";
import { useCompanionSignals } from "../companion/useCompanionSignals";
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
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { deriveSessionStatus } from "../../lib/session/sessionStatus";
import { getReportEvidenceSummary } from "../../lib/sources/traceability";
import { ResumePromptCard, type ResumePromptOrigin } from "./ResumePromptCard";
import { SessionSummaryStrip } from "./SessionSummaryStrip";
import { WorkContinuationCards } from "./WorkContinuationCards";
import { ReportBuilderPanel } from "./ReportBuilderPanel";

export function ReportsView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);
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
  useEffect(() => {
    let cancelled = false;
    void getAcceptedMemoryRepository()
      .listAcceptedProjectMemories(reportProjectId)
      .then((result) => {
        if (!cancelled) setAcceptedMemories(result.data);
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

  const { signals: companionSignals } = useCompanionSignals();

  return (
    <div className="page reports-page">
      <PageHeader
        title="Reports"
        subtitle="Mori의 작업 메모리를 Resume 프롬프트와 공유 가능한 리포트로 만듭니다."
        right={
          <div className="reports-page-actions">
            <Badge tone={isDemo ? "gray" : "green"}>{isDemo ? "데모 세션" : "실제 세션"}</Badge>
            <Button icon={Calendar} disabled title="세션 날짜 범위 변경은 다음 마일스톤입니다.">
              {new Date(view.session.startedAt).toLocaleDateString()}
            </Button>
          </div>
        }
      />
      <SessionModeBanner />

      <AnalysisStrip
        mode={mode}
        hasAnalysis={hasAnalysis}
        status={analysisStatus}
        providerLabel={analysisProviderLabel}
        providerName={analysis?.providerName ?? null}
        generatedAt={analysis?.generatedAt ?? null}
        error={analysisError}
        canRun={canRunQuickPass}
        importsCount={imports.length}
        evidenceCounts={{
          sources: view.sources.length,
          events: view.events.length,
          issues: view.issues.length,
          decisions: view.decisions.length,
          nextActions: view.nextActions.length,
        }}
        dataBasis={evidenceSummary.dataBasis}
        onRun={() => runQuickPass()}
        onGoToEvidence={() => setCurrentView("evidence")}
      />

      <div className="reports-layout">
        <section className="reports-main">
          <CompanionCard
            signals={companionSignals}
            isDemo={mode === "demo"}
            onNavigate={setCurrentView}
          />

          <SessionSummaryStrip
            dataBasis={evidenceSummary.dataBasis}
            dataBasisTone={status.dataBasisTone}
            duration={duration}
            sourceCount={view.sources.length}
            eventCount={view.events.length}
            issueCount={view.issues.length}
            decisionCount={view.decisions.length}
            nextActionCount={view.nextActions.length}
          />

          <ResumePromptCard
            prompt={resumePromptText}
            origin={promptOrigin}
            emptyHint={
              imports.length === 0
                ? "아직 가져온 소스가 없습니다. Evidence Hub에서 자료를 추가한 뒤 Quick Pass를 실행하면 분석 기반 프롬프트가 표시됩니다."
                : "Quick Pass를 실행하면 분석 기반 프롬프트가 표시됩니다."
            }
          />

          <WorkContinuationCards view={view} onOpenTimeline={() => setCurrentView("timeline")} />

          <MoriPackageStrip view={view} />

          <ReportsCapabilityStrip />
        </section>

        <ReportBuilderPanel
          view={view}
          resumePromptOverride={resumePromptText}
          acceptedMemories={acceptedMemories}
        />
      </div>
    </div>
  );
}

function AnalysisStrip({
  mode,
  hasAnalysis,
  status,
  providerLabel,
  providerName,
  generatedAt,
  error,
  canRun,
  importsCount,
  evidenceCounts,
  dataBasis,
  onRun,
  onGoToEvidence,
}: {
  mode: "demo" | "draft";
  hasAnalysis: boolean;
  status: string;
  providerLabel: string | null;
  providerName: string | null;
  generatedAt: string | null;
  error: string | null;
  canRun: boolean;
  importsCount: number;
  evidenceCounts: {
    sources: number;
    events: number;
    issues: number;
    decisions: number;
    nextActions: number;
  };
  dataBasis: string;
  onRun: () => void;
  onGoToEvidence: () => void;
}) {
  const isDemo = mode === "demo";
  const providerCopy = providerLabel ?? "deterministic";
  const providerKind = providerName === "ollama-quick-pass-v1" ? "local LLM" : "heuristic";
  return (
    <div className={`reports-analysis-strip status-${status}`} role="region" aria-label="Analysis state">
      <div className="reports-analysis-info">
        <div>
          <strong>분석 상태</strong>
          <span>
            {isDemo
              ? "데모 세션의 mock 분석 결과를 사용합니다."
              : status === "running"
                ? "Quick Pass 실행 중..."
                : status === "failed"
                  ? `Quick Pass 실패: ${error ?? "알 수 없는 오류"}`
                  : hasAnalysis
                    ? `${providerCopy} · ${providerKind}${
                        generatedAt ? ` · ${new Date(generatedAt).toLocaleString()}` : ""
                      }`
                    : importsCount === 0
                      ? "아직 가져온 소스가 없습니다. Evidence Hub에서 자료를 추가하세요."
                      : "가져온 소스가 있습니다. Quick Pass를 실행하면 Resume 프롬프트와 리포트가 풍부해집니다."}
          </span>
        </div>
        <div className="reports-analysis-counts">
          <Badge tone="purple">출처 {evidenceCounts.sources}</Badge>
          <Badge tone="blue">이벤트 {evidenceCounts.events}</Badge>
          <Badge tone="red">이슈 {evidenceCounts.issues}</Badge>
          <Badge tone="green">결정 {evidenceCounts.decisions}</Badge>
          <Badge tone="orange">다음 액션 {evidenceCounts.nextActions}</Badge>
          <Badge tone="gray">{dataBasis}</Badge>
        </div>
      </div>
      <div className="reports-analysis-actions">
        {!isDemo && importsCount === 0 ? (
          <Button onClick={onGoToEvidence}>Evidence Hub로 이동</Button>
        ) : null}
        {!isDemo ? (
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={onRun}
            disabled={!canRun}
            title={canRun ? "Quick Pass 실행" : importsCount === 0 ? "먼저 소스를 가져오세요." : "이미 실행 중입니다."}
          >
            {status === "running" ? "분석 중..." : hasAnalysis ? "Re-run Quick Pass" : "Run Quick Pass"}
          </Button>
        ) : null}
      </div>
    </div>
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

function MoriPackageStrip({ view }: { view: ReturnType<typeof selectSessionView> }) {
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
      const projectId = view.project.id || "default";
      const consolidatedMemories = repository.listAcceptedProjectMemories(projectId);
      const auditTrail = repository.listMemoryReviewActions(projectId);
      const fullPkg = createMoriPackageFromSession(view, {
        consolidatedMemories,
        auditTrail,
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
        const total = getPackageConsolidatedMemories(fullPkg).length;
        const kept = getPackageConsolidatedMemories(pkg).length;
        setMessage(
          `${written.message} · 클라이언트 공유용: memory ${kept}건 포함 / ${total - kept}건 제외.`,
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
  return (
    <section className="mori-package-strip" aria-label=".mori package export">
      <div className="mori-package-strip-intro">
        <h3>
          <Archive size={14} aria-hidden="true" /> .mori v0 패키지
        </h3>
        <p>
          리포트 외에도 세션 전체를 직렬화한 .mori 파일을 내보낼 수 있습니다. 클라이언트
          공유용은 client-safe memory만 포함합니다.
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

/**
 * Honesty strip rendered at the bottom of the Reports surface. Surfaces the
 * implemented / planned export formats so the user never has to guess what
 * the page can actually produce. Counts are sourced from the feature
 * registry — drift is impossible.
 */
function ReportsCapabilityStrip() {
  const counts = countFeaturesByStatus();
  const exportFeatures: FeatureId[] = [
    "reports.export.markdown",
    "reports.export.pdf",
    "reports.export.html",
    "reports.export.moriPackage",
    "rollup.moriPackageImport",
  ];
  return (
    <MoriSection
      subtle
      className="reports-capability-strip"
      title={
        <>
          <ShieldCheck size={14} aria-hidden="true" /> Report 기능 honesty
        </>
      }
      hint="현재 Reports 화면이 실제로 할 수 있는 것 / Planned로 남아 있는 것."
      ariaLabel="Report 기능 honesty"
    >
      <div className="reports-capability-grid">
        <MoriStatCard
          label="Implemented"
          value={counts.implemented}
          hint="앱 전체 기준"
          tone="success"
        />
        <MoriStatCard
          label="Partial"
          value={counts.partial}
          hint="앱 전체 기준"
          tone="info"
        />
        <MoriStatCard
          label="Planned"
          value={counts.planned}
          hint="앱 전체 기준"
          tone="warning"
        />
      </div>
      <ul className="reports-capability-feature-list">
        {exportFeatures.map((feature) => (
          <li key={feature}>
            <MoriFeatureStatusBadge feature={feature} />
          </li>
        ))}
      </ul>
    </MoriSection>
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
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes - hours * 60;
  if (hours < 24) return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}
