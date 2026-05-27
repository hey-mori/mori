import { Archive, FileText, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
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
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";
import { buildMoriPackageExportPlan } from "../../lib/report/moriPackageExportPlan";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { formatDateTime } from "../../lib/formatting/time";
import { ResumePromptCard, type ResumePromptOrigin } from "./ResumePromptCard";
import { ReportBuilderPanel } from "./ReportBuilderPanel";

export function ReportsView() {
  // `navigate` routes legacy session-surface keys (timeline / evidence) into
  // the unified Session Detail workspace; other keys pass through unchanged.
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
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
        setMemoryStorageFellBack(memoriesResult.fellBack || actionsResult.fellBack);
      });
    return () => {
      cancelled = true;
    };
  }, [reportProjectId]);

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

  const exportPlan = useMemo(
    () =>
      buildMoriPackageExportPlan({
        view,
        consolidatedMemories: acceptedMemories,
        auditTrail: reviewActions,
      }),
    [view, acceptedMemories, reviewActions],
  );

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

  // The 리포트 tab is the session's handoff / output surface — three stacked
  // sections: the continue-context, the report builder, and the .mori export.
  // Session identity, scale metrics, and the wrap-up checklist live in the
  // 개요 tab, not here.
  return (
    <div className="session-tab-pane reports-embedded">
      <div className="session-tab-actionbar">
        <ActionBar label="리포트" end={quickPassButton} />
      </div>
      <div className="session-tab-split is-collapsed">
        <div className="session-tab-main">
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
            <ResumePromptCard
              prompt={resumePromptText}
              origin={promptOrigin}
              emptyHint={
                imports.length === 0
                  ? "아직 가져온 소스가 없습니다. 증거 탭에서 소스를 추가한 뒤 Quick Pass를 실행하면 분석 기반 컨텍스트가 표시됩니다."
                  : "Quick Pass를 실행하면 분석 기반 컨텍스트가 표시됩니다."
              }
            />

            <ReportBuilderPanel
              id="reports-builder"
              view={view}
              resumePromptOverride={resumePromptText}
              acceptedMemories={acceptedMemories}
            />

            <MoriPackageStrip
              view={view}
              acceptedMemories={acceptedMemories}
              reviewActions={reviewActions}
              memoryStorageFellBack={memoryStorageFellBack}
              exportPlan={exportPlan}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Session-at-a-glance hero. Carries the work-unit identity that used to live in
 * the cramped session-detail origin strip (boundary type · source mix ·
 * project context) plus a one-line "what this session was" summary, so the 개요
 * tab opens by telling the user what they are looking at before the metrics.
 */
/**
 * Compact analysis-state notice. The Quick Pass action lives in the action bar,
 * so this only surfaces when there is a meaningful state to report — a failure,
 * a run, an empty real session, or the provider line once results exist. Stays
 * quiet otherwise.
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
  memoryStorageFellBack,
  exportPlan,
}: {
  view: ReturnType<typeof selectSessionView>;
  acceptedMemories: StoredAcceptedProjectMemory[];
  reviewActions: StoredMemoryReviewAction[];
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
  return (
    <section id="reports-package-export" className="mori-package-strip" aria-label=".mori package export">
      <div className="mori-package-strip-intro">
        <h3>
          <Archive size={14} aria-hidden="true" /> .mori v0 패키지
        </h3>
        <p>
          세션·근거·리뷰·승인 메모리를 하나의 로컬 .mori 파일로 묶습니다. 가져오기는 자동 병합이 아니라 검토를 다시 거칩니다.
        </p>
        <p className="mori-package-content-line">
          출처 {exportPlan.full.sources} · 이벤트 {exportPlan.full.events} · 메모리 {exportPlan.full.memories} · 감사 {exportPlan.full.auditRows}
          {exportPlan.clientSafe.droppedMemories > 0 || exportPlan.clientSafe.droppedAuditRows > 0
            ? ` · 클라이언트 공유 시 메모리 ${exportPlan.clientSafe.droppedMemories}·감사 ${exportPlan.clientSafe.droppedAuditRows} 제외`
            : ""}
          {memoryStorageFellBack ? " · SQLite 읽기 실패, browser fallback" : ""}
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
