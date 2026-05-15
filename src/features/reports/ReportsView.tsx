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
import { createMoriPackageFromSession, serializeMoriPackage } from "../../lib/mori-package";
import { buildResumePrompt } from "../../lib/report/resume-prompt";
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
          <Badge tone="purple">{evidenceCounts.sources} sources</Badge>
          <Badge tone="blue">{evidenceCounts.events} events</Badge>
          <Badge tone="red">{evidenceCounts.issues} issues</Badge>
          <Badge tone="green">{evidenceCounts.decisions} decisions</Badge>
          <Badge tone="orange">{evidenceCounts.nextActions} next actions</Badge>
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

function MoriPackageStrip({ view }: { view: ReturnType<typeof selectSessionView> }) {
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const [status, setStatus] = useState<string>(".mori v0 JSON 미리보기 / 내보내기 준비됨");
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const consolidatedMemories = repository.listAcceptedProjectMemories(
        view.project.id || "default",
      );
      const pkg = createMoriPackageFromSession(view, { consolidatedMemories });
      const serialized = serializeMoriPackage(pkg);
      repository.saveMoriPackageDraft(pkg);
      const filename = `${pkg.manifest.packageId}.mori.json`;
      if (isTauriRuntime()) {
        try {
          const saved = await tauriCommands.saveMoriPackageJson({
            serializedPackage: serialized,
            suggestedFilename: filename,
          });
          setStatus(`Saved desktop package: ${saved.path}`);
          return;
        } catch (error) {
          setStatus(`Desktop save failed: ${error instanceof Error ? error.message : "unknown error"}`);
          return;
        }
      }
      if (typeof window !== "undefined") {
        const blob = new Blob([serialized], { type: "application/vnd.mori.package+json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setStatus(`Downloaded ${filename}. Browser draft 저장됨. Desktop save는 Tauri 앱에서만 가능합니다.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mori-package-strip" aria-label=".mori package export">
      <div>
        <h3>
          <Archive size={14} aria-hidden="true" /> .mori v0 패키지
        </h3>
        <p>리포트 외에도 세션 전체를 직렬화한 .mori 파일을 내보낼 수 있습니다.</p>
      </div>
      <div>
        <Button icon={FileText} onClick={handleExport} disabled={busy}>
          {busy ? "내보내는 중..." : ".mori v0 JSON 내보내기"}
        </Button>
        <small>{status}</small>
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
