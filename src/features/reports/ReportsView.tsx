import { Archive, FileText, ListPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { SessionEmptyPrompt } from "../session/SessionEmptyPrompt";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
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
import { ClientWorkLogCard } from "./ClientWorkLogCard";
import { ResumePromptCard } from "./ResumePromptCard";
import {
  phaseForWriteResult,
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
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { ReportBuilderPanel } from "./ReportBuilderPanel";

export function ReportsView() {
  // `navigate` routes legacy session-surface keys (timeline / evidence) into
  // the unified Session Detail workspace; other keys pass through unchanged.
  const setCurrentView = useAppStore((state) => state.navigate);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  // Below 원문 the prompt is not shown: it quotes request titles verbatim.
  const requestsHidden = useSessionStore((state) => state.analysisSettings.requestDisclosureLevel !== "raw");
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const analysis = useSessionStore((state) => state.analysis);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const analysisError = useSessionStore((state) => state.analysisError);
  const imports = useSessionStore((state) => state.imports);

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

  const resumePromptText = useMemo(() => {
    if (hasAnalysis && analysis) return analysis.summary.resumePrompt;
    if (mode === "demo") return view.summary.resumePrompt || buildResumePrompt(view);
    if (imports.length === 0) return "";
    return buildResumePrompt(view);
  }, [analysis, hasAnalysis, mode, imports.length, view]);

  const exportPlan = useMemo(
    () =>
      buildMoriPackageExportPlan({
        view,
        consolidatedMemories: acceptedMemories,
        auditTrail: reviewActions,
      }),
    [view, acceptedMemories, reviewActions],
  );

  // One global "공유 정책" toggle for both the report builder and the .mori
  // export. When on, the report renders as client-safe (raw transcripts +
  // source details excluded) and the .mori export uses the client-safe path.
  const [externalShare, setExternalShare] = useState(false);

  // The 보고서 tab is the session's handoff / output surface — three stacked
  // sections: the continue-context, the report builder, and the .mori export.
  // Session identity, scale metrics, and the wrap-up checklist live in the
  // 개요 tab, not here. The analysis re-run lives in the 분석 tab where the
  // produced 흐름 / 정리 / 상태 views are read; this surface is output-only.
  return (
    <div className="session-tab-pane reports-embedded">
      <div className="session-tab-split is-collapsed">
        <div className="session-tab-main">
          <ReportsAnalysisNotice
            mode={mode}
            hasAnalysis={hasAnalysis}
            status={analysisStatus}
            error={analysisError}
            importsCount={imports.length}
            onOpenSources={() => setCurrentView("connections")}
          />

          <div className="reports-main">
            <ReportBuilderPanel
              id="reports-builder"
              view={view}
              resumePromptOverride={resumePromptText}
              acceptedMemories={acceptedMemories}
              externalShare={externalShare}
              onToggleExternalShare={() => setExternalShare((current) => !current)}
            />

            {externalShare ? <ClientWorkLogCard view={view} /> : null}

            {/* 이어가기 sits with the package: both are handoff outputs you carry
                to a *new* session, so the resume prompt reads as part of the
                packaging step rather than leading the report. */}
            {/* The prompt quotes request titles verbatim: at 숨김 it is not
                shown or copied here, as in the report itself. */}
            <ResumePromptCard
              prompt={requestsHidden ? "" : resumePromptText}
              emptyHint={
                requestsHidden
                  ? "요청 표시 수준이 원문이 아니라서 요청 내용이 담긴 이어가기 프롬프트는 보여 주지 않습니다."
                  : "분석 탭에서 분석을 실행하면 이어가기 프롬프트가 만들어집니다."
              }
            />

            <MoriPackageStrip
              view={view}
              acceptedMemories={acceptedMemories}
              reviewActions={reviewActions}
              memoryStorageFellBack={memoryStorageFellBack}
              exportPlan={exportPlan}
              externalShare={externalShare}
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
 * Analysis-state notice for the 공유 tab. Surfaces only a hard failure or the
 * "import something first" empty state. The engine/timestamp provenance line was
 * removed: it repeats what 개요 already says and is noise above the report.
 */
function ReportsAnalysisNotice({
  mode,
  hasAnalysis,
  status,
  error,
  importsCount,
  onOpenSources,
}: {
  mode: "demo" | "draft";
  hasAnalysis: boolean;
  status: string;
  error: string | null;
  importsCount: number;
  onOpenSources: () => void;
}) {
  if (mode === "demo") return null;

  if (status === "failed") {
    return (
      <NoticeBanner tone="danger" title="분석 실패">
        {error ?? "알 수 없는 오류"}
      </NoticeBanner>
    );
  }
  if (!hasAnalysis && importsCount === 0) {
    return (
      <SessionEmptyPrompt
        title="세션에 가져온 소스 없음"
        hint="소스에서 대화를 가져오면 보고서를 만들 수 있습니다."
        action={
          <Button variant="primary" size="sm" icon={ListPlus} onClick={onOpenSources}>
            소스에서 가져오기
          </Button>
        }
      />
    );
  }
  return null;
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
        : { status: "saved", message: `데스크톱 .mori 패키지를 저장했습니다 · ${saved.path}` };
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
  externalShare,
}: {
  view: ReturnType<typeof selectSessionView>;
  acceptedMemories: StoredAcceptedProjectMemory[];
  reviewActions: StoredMemoryReviewAction[];
  memoryStorageFellBack: boolean;
  exportPlan: ReturnType<typeof buildMoriPackageExportPlan>;
  /** When true the export follows the client-safe path; mirrors the
   *  report builder's 외부 공유 toggle so one switch drives both. */
  externalShare: boolean;
}) {
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const [phase, setPhase] = useState<MoriExportPhase>("idle");
  const busy = phase === "running";
  async function runExport() {
    const clientSafe = externalShare;
    setPhase("running");
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
      setPhase(phaseForWriteResult(written));
    } catch {
      setPhase("error");
    }
  }
  return (
    <section id="reports-package-export" className="mori-package-strip" aria-label=".mori package export">
      <div className="mori-package-strip-intro">
        <h3>
          <Archive size={14} aria-hidden="true" /> .mori 패키지
          <InfoHint label=".mori 패키지 설명">
            세션·근거·리뷰·승인 메모리를 하나의 로컬 .mori 파일로 묶습니다. 가져오기는 자동 병합이 아니라 검토를 다시 거칩니다.
          </InfoHint>
        </h3>
        <dl className="mori-package-stats" aria-label=".mori 패키지 포함 항목">
          <div>
            <dt>출처</dt>
            <dd>{exportPlan.full.sources}</dd>
          </div>
          <div>
            <dt>이벤트</dt>
            <dd>{exportPlan.full.events}</dd>
          </div>
          <div>
            <dt>메모리</dt>
            <dd>{exportPlan.full.memories}</dd>
          </div>
          <div>
            <dt>감사</dt>
            <dd>{exportPlan.full.auditRows}</dd>
          </div>
        </dl>
        {externalShare && (exportPlan.clientSafe.droppedMemories > 0 || exportPlan.clientSafe.droppedAuditRows > 0)
          ? (
            <p className="mori-package-content-line">
              외부 공유 모드 · 메모리 {exportPlan.clientSafe.droppedMemories}·감사 {exportPlan.clientSafe.droppedAuditRows} 제외
            </p>
          )
          : memoryStorageFellBack
            ? (
              <p className="mori-package-content-line">
                SQLite 읽기 실패, browser fallback 사용
              </p>
            )
            : null}
      </div>
      <div className="mori-package-strip-actions">
        <Button
          variant="primary"
          icon={FileText}
          size="sm"
          onClick={runExport}
          disabled={busy}
        >
          {busy ? "내보내는 중..." : "내보내기"}
        </Button>
      </div>
    </section>
  );
}
