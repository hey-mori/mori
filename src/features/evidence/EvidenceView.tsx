import { FileText, Plus, RotateCcw, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriDrawer } from "../../components/ui/MoriDrawer";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { HelpDisclosure } from "../../components/layout/HelpDisclosure";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { useMoriReviewStore } from "../../app/reviewStore";
import {
  describeAnalysisStatus,
  getAnalysisStatusTone,
} from "../../lib/analysis";
import {
  buildImportApplyCompletion,
  type ImportApplyCompletionActionId,
} from "../../lib/review/importApplyCompletion";
import type {
  MoriAnalysisStatus,
  QuickPassAnalysisSettings,
  QuickPassProviderKind,
} from "../../lib/analysis";
import {
  getHubAvailableIntegrations,
  getHubImportKind,
  resolveImportLaunch,
  type HubImportKind,
} from "../../lib/sources/integrationGroups";
import { SOURCE_REGISTRY } from "../../lib/sources/sourceRegistry";
import type { AiTranscriptPlatform } from "../../lib/import";
import { ImportPanel } from "../import/ImportPanel";
import { ImportReviewView } from "../review-import/ImportReviewView";
import { IntegrationCard } from "./IntegrationCard";
import { ImportedSourceRow } from "./ImportedSourceRow";
import {
  SourceDetailPanel,
  type EvidenceDetailSelection,
} from "./SourceDetailPanel";

/**
 * Evidence Hub — the **증거** tab inside the unified Session Detail workspace.
 *
 * The Session Detail owns the single shell + header, so this view renders only
 * its action-bar row + body + inspector inside the session scroll area (no
 * double shell). Every capability — import, Quick Pass, source inspector,
 * removal — lives here.
 */
export function EvidenceView() {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const analysisError = useMoriSessionStore((state) => state.analysisError);
  const analysisProviderLabel = useMoriSessionStore((state) => state.analysisProviderLabel);
  const analysis = useMoriSessionStore((state) => state.analysis);
  const imports = useMoriSessionStore((state) => state.imports);
  const analysisSettings = useMoriSessionStore((state) => state.analysisSettings);
  const analysisFallbackUsed = useMoriSessionStore((state) => state.analysisFallbackUsed);
  const runQuickPass = useMoriSessionStore((state) => state.runQuickPass);
  const clearAnalysis = useMoriSessionStore((state) => state.clearAnalysis);
  const updateAnalysisSettings = useMoriSessionStore((state) => state.updateAnalysisSettings);
  const removeImport = useMoriSessionStore((state) => state.removeImport);
  // `navigate` routes legacy session-surface keys (timeline) into the unified
  // Session Detail workspace; other keys (memory / settings) pass through, so
  // "Timeline 열기" switches to the 흐름 tab rather than opening a separate page.
  const setCurrentView = useMoriAppStore((state) => state.navigate);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);


  const reviewDraft = useMoriReviewStore((state) => state.draft);
  const lastApplied = useMoriReviewStore((state) => state.lastApplied);
  const clearLastApplied = useMoriReviewStore((state) => state.clearLastApplied);

  const availableIntegrations = useMemo(() => getHubAvailableIntegrations(), []);
  const integrationLookup = useMemo(() => {
    const map = new Map<string, (typeof availableIntegrations)[number]>();
    for (const integration of Object.values(SOURCE_REGISTRY)) {
      map.set(integration.id, integration);
    }
    return map;
  }, [availableIntegrations]);

  const [selection, setSelection] = useState<EvidenceDetailSelection>({ kind: "empty" });
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<HubImportKind>("note");
  const [importPlatform, setImportPlatform] = useState<AiTranscriptPlatform | undefined>(undefined);

  function openImport(kind: HubImportKind, platform?: AiTranscriptPlatform) {
    setImportKind(kind);
    setImportPlatform(platform);
    setImportOpen(true);
  }

  function handleIntegrationPrimary(integrationId: string) {
    const target = resolveImportLaunch(integrationId);
    if (!target) return;
    openImport(target.kind, (target.platform ?? undefined) as AiTranscriptPlatform | undefined);
  }

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

  // After all hooks are called, defer rendering to the review screen if a
  // draft is in flight. Cancel / apply on the review screen clears the draft
  // and falls through back to the Evidence Hub on the next render.
  if (reviewDraft) {
    return <ImportReviewView embedded />;
  }

  const actionBar = (
    <ActionBar
      label="증거 허브 상태"
      start={
        <Badge tone={importedSources.length ? "purple" : "gray"}>
          {importedSources.length}개 출처
        </Badge>
      }
      end={
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => openImport(importKind ?? "note")}
          disabled={isDemoSession}
          title={isDemoSession ? "실제 세션을 시작하면 소스를 추가할 수 있습니다." : "새 소스 추가"}
        >
          소스 추가
        </Button>
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

      <section className="evidence-section">
        <header className="evidence-section-header">
          <div className="evidence-section-title-row">
            <h2>소스 추가</h2>
            <HelpDisclosure label="Claude 대화를 가져오려면?" ariaLabel="Claude 가져오기 안내">
              <p>
                Claude Desktop · Claude Code 대화는 <strong>연결</strong> 화면에서 로컬 세션을 골라
                한 번에 가져오는 것이 가장 빠릅니다.
              </p>
              <p>여기 "AI 대화" 카드는 다른 도구의 대화나 텍스트를 직접 붙여넣을 때 쓰세요.</p>
            </HelpDisclosure>
          </div>
          <Badge tone="green">{availableIntegrations.length}개</Badge>
        </header>
        <div className="evidence-card-grid">
          {availableIntegrations.map((integration) => {
            const importKindForCard = getHubImportKind(integration.id);
            const selected =
              selection.kind === "integration" && selection.integrationId === integration.id;
            return (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                selected={selected}
                importKind={importKindForCard}
                onPrimary={() => handleIntegrationPrimary(integration.id)}
                primaryDisabled={isDemoSession}
                primaryDisabledReason="데모 세션 — Start Session에서 실제 세션을 시작하면 사용할 수 있습니다."
                onInspect={() =>
                  setSelection({ kind: "integration", integrationId: integration.id })
                }
              />
            );
          })}
        </div>
      </section>

      <section className="evidence-section">
        <header className="evidence-section-header">
          <div>
            <h2>가져온 소스</h2>
          </div>
          <Badge tone={importedSources.length ? "purple" : "gray"}>
            {importedSources.length}개
          </Badge>
        </header>
        {importedSources.length === 0 ? (
          <EvidenceEmptyState
            isDemo={isDemoSession}
            onAdd={() => openImport("note")}
          />
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
      </section>

      {mode === "draft" ? (
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
      ) : null}

      <MoriDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        ariaLabel="소스 가져오기"
      >
        <ImportPanel
          variant="embedded"
          initialKind={importKind}
          initialAiPlatform={importPlatform}
          onClose={() => setImportOpen(false)}
        />
      </MoriDrawer>
    </>
  );

  return (
    <div className="session-tab-pane session-tab-evidence">
      <div className="session-tab-actionbar">{actionBar}</div>
      <div className="session-tab-split">
        <div className="session-tab-main">{body}</div>
        {aside}
      </div>
    </div>
  );
}

function EvidenceEmptyState({
  isDemo,
  onAdd,
}: {
  isDemo: boolean;
  onAdd: () => void;
}) {
  return (
    <EmptyState
      compact
      icon={FileText}
      title="아직 가져온 소스가 없습니다"
      description={
        isDemo
          ? "데모 세션은 미리 정의된 소스만 보여줍니다. 실제 세션을 시작하면 위에서 소스를 추가할 수 있습니다."
          : "위에서 AI 대화, Git diff, 메모, URL을 추가하세요."
      }
      actions={
        !isDemo ? (
          <Button variant="primary" icon={Plus} onClick={onAdd}>
            소스 추가
          </Button>
        ) : undefined
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
  status: MoriAnalysisStatus;
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
          ]}
        />
        <small>{providerKindLabel}</small>
        {settings.provider === "ollama" ? (
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
  if (name === "deterministic-heuristic-v1") return "휴리스틱 (LLM 미사용)";
  return "알 수 없는 제공자";
}
