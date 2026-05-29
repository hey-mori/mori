import { FileText, RotateCcw, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseSection } from "../../components/ui/BaseSection";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { useReviewStore } from "../../app/reviewStore";
import {
  describeAnalysisStatus,
  getAnalysisStatusTone,
} from "../../lib/analysis";
import {
  buildImportApplyCompletion,
  type ImportApplyCompletionActionId,
} from "../../lib/review/importApplyCompletion";
import type {
  AnalysisRunStatus,
  QuickPassAnalysisSettings,
  QuickPassProviderKind,
} from "../../lib/analysis";
import { SOURCE_REGISTRY } from "../../lib/sources/sourceRegistry";
import { ImportReviewView } from "../review-import/ImportReviewView";
import { ImportedSourceRow } from "./ImportedSourceRow";
import {
  SourceDetailPanel,
  type EvidenceDetailSelection,
} from "./SourceDetailPanel";

/**
 * Evidence Hub — the **증거** tab inside the unified Session Detail workspace.
 *
 * A Mori session is one AI-agent work session: the conversation is the spine,
 * and the Git diffs / terminal runs / files / notes produced during that work
 * hang off it as evidence. So this surface does NOT offer a "add a source"
 * catalog — you cannot bolt arbitrary sources onto an agent session after the
 * fact. It is a calm, read-only ledger of what the session is built from: each
 * source with its icon, capture method, and related events, plus the
 * Quick Pass extraction control for a live draft. The review-before-apply
 * import gate (`ImportReviewView`) still renders here while a draft is pending.
 */
export function EvidenceView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const analysisError = useSessionStore((state) => state.analysisError);
  const analysisProviderLabel = useSessionStore((state) => state.analysisProviderLabel);
  const analysis = useSessionStore((state) => state.analysis);
  const imports = useSessionStore((state) => state.imports);
  const analysisSettings = useSessionStore((state) => state.analysisSettings);
  const analysisFallbackUsed = useSessionStore((state) => state.analysisFallbackUsed);
  const runQuickPass = useSessionStore((state) => state.runQuickPass);
  const clearAnalysis = useSessionStore((state) => state.clearAnalysis);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);
  const removeImport = useSessionStore((state) => state.removeImport);
  // `navigate` routes legacy session-surface keys (timeline) into the unified
  // Session Detail workspace; other keys (memory / settings) pass through.
  const setCurrentView = useAppStore((state) => state.navigate);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const reviewDraft = useReviewStore((state) => state.draft);
  const lastApplied = useReviewStore((state) => state.lastApplied);
  const clearLastApplied = useReviewStore((state) => state.clearLastApplied);

  const integrationLookup = useMemo(() => {
    const map = new Map<string, (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY]>();
    for (const integration of Object.values(SOURCE_REGISTRY)) {
      map.set(integration.id, integration);
    }
    return map;
  }, []);

  const [selection, setSelection] = useState<EvidenceDetailSelection>({ kind: "empty" });

  const importedSources = view.sources;
  const isDemoSession = mode === "demo";
  const importCompletion = useMemo(
    () =>
      lastApplied
        ? buildImportApplyCompletion({
            appliedCount: lastApplied.appliedCount,
            hasAnalysis,
          })
        : null,
    [lastApplied, hasAnalysis],
  );

  function handleImportCompletionAction(actionId: ImportApplyCompletionActionId) {
    switch (actionId) {
      case "timeline":
        setCurrentView("timeline");
        return;
      case "quickPass":
        void runQuickPass();
        return;
      case "memory":
        setCurrentView("memory");
        return;
      default:
        return;
    }
  }

  // Defer to the review screen if a draft is in flight. Cancel / apply on the
  // review screen clears the draft and falls back to the Evidence Hub.
  if (reviewDraft) {
    return <ImportReviewView embedded />;
  }

  const actionBar = (
    <ActionBar
      label="세션 구성"
      start={
        <>
          <Badge tone={importedSources.length ? "purple" : "gray"}>
            출처 {importedSources.length}
          </Badge>
          <Badge tone={view.events.length ? "blue" : "gray"}>
            이벤트 {view.events.length}
          </Badge>
        </>
      }
    />
  );

  const aside = (
    <SourceDetailPanel
      selection={selection}
      view={view}
      integrationLookup={integrationLookup}
      importSummary={
        selection.kind === "source"
          ? imports.find((entry) => entry.source.id === selection.sourceId)?.importSummary
          : undefined
      }
    />
  );

  const importedSourcesSection = (
    <BaseSection
      className="evidence-section evidence-imported-sources"
      title="세션을 구성한 자료"
      actions={
        <Badge tone={importedSources.length ? "purple" : "gray"}>
          {importedSources.length}개
        </Badge>
      }
      ariaLabel="세션을 구성한 자료"
    >
      {importedSources.length === 0 ? (
        <EvidenceEmptyState isDemo={isDemoSession} />
      ) : (
        <div className="imported-source-list">
          {importedSources.map((source) => {
            const importEntry = imports.find((entry) => entry.source.id === source.id);
            const selected = selection.kind === "source" && selection.sourceId === source.id;
            return (
              <ImportedSourceRow
                key={source.id}
                source={source}
                events={view.events}
                selected={selected}
                importSummary={importEntry?.importSummary}
                onSelect={() => setSelection({ kind: "source", sourceId: source.id })}
                onRemove={
                  importEntry && !isDemoSession
                    ? () => {
                        removeImport(importEntry.id);
                        if (selected) setSelection({ kind: "empty" });
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </BaseSection>
  );

  const quickPassSection =
    mode === "draft" ? (
      <QuickPassControl
        status={analysisStatus}
        providerLabel={analysisProviderLabel}
        providerName={analysis?.providerName ?? null}
        error={analysisError}
        canRun={imports.length > 0 && analysisStatus !== "running"}
        hasAnalysis={hasAnalysis}
        fallbackUsed={analysisFallbackUsed}
        summary={analysis?.summary.sessionSummary ?? null}
        issueCount={analysis?.issues.length ?? 0}
        decisionCount={analysis?.decisions.length ?? 0}
        nextActionCount={analysis?.nextActions.length ?? 0}
        confidence={analysis?.confidence ?? null}
        notes={analysis?.notes ?? []}
        settings={analysisSettings}
        onProviderChange={(provider) => updateAnalysisSettings({ provider })}
        onFallbackChange={(value) => updateAnalysisSettings({ fallbackToDeterministic: value })}
        onOpenSettings={() => setCurrentView("settings")}
        onRun={() => runQuickPass()}
        onClear={clearAnalysis}
      />
    ) : null;

  const body = (
    <>
      {lastApplied && importCompletion ? (
        <NoticeBanner
          tone="success"
          title={importCompletion.headline}
          onDismiss={clearLastApplied}
          actions={importCompletion.actions.map((action) => (
            <Button
              key={action.id}
              variant={action.primary ? "primary" : "secondary"}
              onClick={() => handleImportCompletionAction(action.id)}
              disabled={action.id === "quickPass" && analysisStatus === "running"}
            >
              {action.id === "quickPass" && analysisStatus === "running"
                ? "분석 중..."
                : action.label}
            </Button>
          ))}
        >
          {importCompletion.detail}
        </NoticeBanner>
      ) : null}

      {importedSourcesSection}
      {quickPassSection}
    </>
  );

  // On-demand inspector: the aside only renders when the user has selected a
  // source. First paint stays single-column so the source list reads at a
  // glance; clicking a row opens the detail.
  const showAside = selection.kind !== "empty";

  return (
    <div className="session-tab-pane session-tab-evidence">
      <div className="session-tab-actionbar">{actionBar}</div>
      <div className={`session-tab-split${showAside ? "" : " is-collapsed"}`}>
        <div className="session-tab-main">{body}</div>
        {showAside ? aside : null}
      </div>
    </div>
  );
}

function EvidenceEmptyState({ isDemo }: { isDemo: boolean }) {
  return (
    <EmptyState
      compact
      icon={FileText}
      title="이 세션을 구성한 소스가 아직 없습니다"
      description={
        isDemo
          ? "데모 세션은 미리 정의된 소스만 보여줍니다."
          : "세션은 하나의 AI 작업에서 만들어집니다 — 연결 화면에서 AI 대화를 가져오면 그 대화와 함께 만들어진 Git diff·터미널·메모가 소스로 모입니다."
      }
    />
  );
}

function QuickPassControl({
  status,
  providerLabel,
  providerName,
  error,
  canRun,
  hasAnalysis,
  fallbackUsed,
  summary,
  issueCount,
  decisionCount,
  nextActionCount,
  confidence,
  notes,
  settings,
  onProviderChange,
  onFallbackChange,
  onOpenSettings,
  onRun,
  onClear,
}: {
  status: AnalysisRunStatus;
  providerLabel: string | null;
  providerName: string | null;
  error: string | null;
  canRun: boolean;
  hasAnalysis: boolean;
  fallbackUsed: boolean;
  summary: string | null;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  confidence: number | null;
  notes: string[];
  settings: QuickPassAnalysisSettings;
  onProviderChange: (provider: QuickPassProviderKind) => void;
  onFallbackChange: (value: boolean) => void;
  onOpenSettings: () => void;
  onRun: () => void;
  onClear: () => void;
}) {
  const providerKindLabel =
    settings.provider === "ollama"
      ? `Ollama · ${settings.ollamaModel} (${settings.ollamaEndpoint})`
      : settings.provider === "openAiCompatible"
        ? `OpenAI 호환 · ${settings.openAiModel} (${settings.openAiBaseUrl})`
      : "결정론적 로컬 휴리스틱 (네트워크 없음)";

  return (
    <div className={`analysis-panel status-${status}`}>
      <div className="analysis-panel-header">
        <div>
          <h2>Quick Pass 분석</h2>
          <p>
            현재 세션에 가져온 소스와 이벤트로부터 이슈, 결정, 다음 액션을 추출합니다.
            기본 제공자는 결정론적 로컬 휴리스틱이며, 설정에서 Ollama 같은 로컬 LLM 제공자로 교체할 수 있습니다.
          </p>
        </div>
        <div className="analysis-panel-actions">
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={onRun}
            disabled={!canRun}
            title={
              canRun
                ? "현재 세션의 소스로 Quick Pass 분석을 실행합니다."
                : status === "running"
                  ? "분석이 진행 중입니다."
                  : "분석하려면 먼저 Evidence에 소스를 가져오세요."
            }
          >
            {status === "running" ? "분석 중..." : "Quick Pass 실행"}
          </Button>
          {hasAnalysis ? (
            <Button icon={RotateCcw} onClick={onClear}>
              분석 초기화
            </Button>
          ) : null}
        </div>
      </div>
      <div className="analysis-panel-provider">
        <SegmentedControl<QuickPassProviderKind>
          ariaLabel="Quick Pass provider"
          role="radiogroup"
          value={settings.provider}
          onChange={onProviderChange}
          options={[
            { id: "deterministic", label: "결정론적" },
            { id: "ollama", label: "Ollama (로컬 LLM)" },
            { id: "openAiCompatible", label: "OpenAI 호환" },
          ]}
        />
        <small>{providerKindLabel}</small>
        {settings.provider !== "deterministic" ? (
          <label className="analysis-panel-fallback">
            <input
              type="checkbox"
              checked={settings.fallbackToDeterministic}
              onChange={(event) => onFallbackChange(event.target.checked)}
            />
            <span>실패 시 결정론적 제공자로 폴백</span>
          </label>
        ) : null}
        <Button icon={SettingsIcon} onClick={onOpenSettings}>
          설정으로 이동
        </Button>
      </div>
      <div className="analysis-panel-status">
        <Badge tone={getAnalysisStatusTone(status)}>
          {describeAnalysisStatus(status)}
        </Badge>
        <span>
          {status === "succeeded"
            ? `${providerLabel ?? "deterministic"} · ${describeProviderName(providerName)} · 신뢰도 ${Math.round((confidence ?? 0) * 100)}%`
            : status === "failed"
              ? error ?? "Quick Pass 실행에 실패했습니다."
              : status === "running"
                ? `${providerLabel ?? "Quick Pass"} 실행 중...`
                : hasAnalysis
                  ? `이전 결과: ${providerLabel ?? "deterministic"} · ${describeProviderName(providerName)}`
                  : canRun
                    ? "아직 실행하지 않음"
                    : "아직 실행하지 않음 · 분석하려면 먼저 Evidence에 소스를 가져오세요"}
        </span>
        {fallbackUsed ? <Badge tone="orange">폴백 사용됨</Badge> : null}
      </div>
      {hasAnalysis ? (
        <>
          {summary ? <p className="analysis-panel-summary">{summary}</p> : null}
          <ul className="analysis-panel-metrics">
            <li>
              <strong>{issueCount}</strong>
              <span>이슈</span>
            </li>
            <li>
              <strong>{decisionCount}</strong>
              <span>결정</span>
            </li>
            <li>
              <strong>{nextActionCount}</strong>
              <span>다음 액션</span>
            </li>
          </ul>
          {notes.length ? (
            <ul className="analysis-panel-notes">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function describeProviderName(name: string | null): string {
  if (name === "ollama-quick-pass-v1") return "실제 로컬 LLM";
  if (name === "openai-compatible-quick-pass-v1") return "OpenAI 호환 LLM";
  if (name === "deterministic-heuristic-v1") return "휴리스틱 (LLM 미사용)";
  return "알 수 없는 제공자";
}
