import { Plus, RotateCcw, Settings as SettingsIcon, Shield, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { useMoriReviewStore } from "../../app/reviewStore";
import type { QuickPassAnalysisSettings, QuickPassProviderKind } from "../../lib/analysis";
import {
  getHubAiPlatform,
  getHubAvailableIntegrations,
  getHubImportKind,
  getHubPlannedIntegrations,
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
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const reviewDraft = useMoriReviewStore((state) => state.draft);
  const lastApplied = useMoriReviewStore((state) => state.lastApplied);
  const clearLastApplied = useMoriReviewStore((state) => state.clearLastApplied);

  const availableIntegrations = useMemo(() => getHubAvailableIntegrations(), []);
  const plannedIntegrations = useMemo(() => getHubPlannedIntegrations(), []);
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
    const kind = getHubImportKind(integrationId);
    if (!kind) return;
    const platform = getHubAiPlatform(integrationId) ?? undefined;
    openImport(kind, platform as AiTranscriptPlatform | undefined);
  }

  const importedSources = view.sources;
  const isDemoSession = mode === "demo";

  // After all hooks are called, defer rendering to the review screen if a
  // draft is in flight. Cancel / apply on the review screen clears the draft
  // and falls through back to the Evidence Hub on the next render.
  if (reviewDraft) {
    return <ImportReviewView />;
  }

  return (
    <div className="page evidence-page">
      <PageHeader
        title="Evidence"
        subtitle="Mori가 작업을 복원할 때 사용하는 소스를 관리하세요. 사용자가 명시적으로 가져온 자료만 분석에 사용됩니다."
        right={
          <div className="evidence-page-actions">
            <Badge tone={isDemoSession ? "gray" : "green"}>
              {isDemoSession ? "데모 세션" : "실제 세션"}
            </Badge>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => openImport(importKind ?? "note")}
              disabled={isDemoSession}
              title={isDemoSession ? "실제 세션을 시작하면 소스를 추가할 수 있습니다." : "새 소스 추가"}
            >
              소스 추가
            </Button>
          </div>
        }
      />
      <SessionModeBanner />

      {lastApplied ? (
        <div className="review-applied-banner" role="status">
          <Sparkles size={14} aria-hidden="true" />
          <span>
            방금 Apply된 가져오기: <strong>{lastApplied.appliedCount}개의 이벤트</strong>가 세션 타임라인에 추가되었습니다.
          </span>
          <Button onClick={clearLastApplied}>닫기</Button>
        </div>
      ) : null}

      <div className="evidence-hub-layout">
        <section className="evidence-hub-main">
          <section className="evidence-section">
            <header className="evidence-section-header">
              <div>
                <h2>사용 가능한 소스</h2>
                <p>지금 바로 가져올 수 있는 소스 유형입니다. 모두 사용자가 직접 입력하거나 붙여넣는 방식이며, Mori가 자동으로 수집하지 않습니다.</p>
              </div>
              <Badge tone="green">{availableIntegrations.length} integrations</Badge>
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
                    primaryDisabledReason="데모 세션에서는 소스를 추가할 수 없습니다. Start Session에서 실제 세션을 시작하세요."
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
                <h2>계획된 커넥터</h2>
                <p>아직 활성화되지 않은 통합입니다. 모두 명시적인 사용자 설정이 도착할 때만 작동합니다.</p>
              </div>
              <Badge tone="gray">{plannedIntegrations.length} planned</Badge>
            </header>
            <div className="evidence-card-grid evidence-card-grid-dense">
              {plannedIntegrations.map((integration) => {
                const selected =
                  selection.kind === "integration" && selection.integrationId === integration.id;
                return (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    selected={selected}
                    importKind={null}
                    onInspect={() =>
                      setSelection({ kind: "integration", integrationId: integration.id })
                    }
                  />
                );
              })}
            </div>
          </section>

          {importOpen ? (
            <section className="evidence-section evidence-import-section">
              <ImportPanel
                variant="embedded"
                initialKind={importKind}
                initialAiPlatform={importPlatform}
                onClose={() => setImportOpen(false)}
              />
            </section>
          ) : null}

          <section className="evidence-section">
            <header className="evidence-section-header">
              <div>
                <h2>가져온 소스</h2>
                <p>이 세션에 등록된 출처입니다. 각 항목을 클릭하면 오른쪽 패널에서 자세한 정보를 확인할 수 있습니다.</p>
              </div>
              <Badge tone={importedSources.length ? "purple" : "gray"}>
                {importedSources.length} source{importedSources.length === 1 ? "" : "s"}
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

          <aside className="evidence-privacy-footer">
            <Shield size={14} aria-hidden="true" />
            <p>
              Mori는 사용자가 직접 추가한 소스만 사용합니다. 백그라운드 캡처, 브라우저 자동 스캔,
              계정 자동 연결은 없습니다. 계획된 커넥터도 사용자가 직접 설정하기 전까지는 비활성 상태로 유지됩니다.
            </p>
          </aside>
        </section>

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
    <div className="evidence-empty">
      <h3>아직 가져온 소스가 없습니다</h3>
      <p>
        {isDemo
          ? "데모 세션은 미리 정의된 소스만 보여줍니다. 실제 세션을 시작하면 위 카드에서 소스를 추가할 수 있습니다."
          : "위의 카드에서 AI 대화, Git diff, 메모, URL을 추가하세요. Mori는 사용자가 명시적으로 가져온 자료만 사용합니다."}
      </p>
      {!isDemo ? (
        <Button variant="primary" icon={Plus} onClick={onAdd}>
          소스 추가
        </Button>
      ) : null}
    </div>
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
  status: string;
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
      : "Deterministic local heuristic (no network)";

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
          <Button variant="primary" icon={Sparkles} onClick={onRun} disabled={!canRun}>
            {status === "running" ? "분석 중..." : "Run Quick Pass"}
          </Button>
          {hasAnalysis ? (
            <Button icon={RotateCcw} onClick={onClear}>
              분석 초기화
            </Button>
          ) : null}
        </div>
      </div>
      <div className="analysis-panel-provider">
        <div className="segmented" role="radiogroup" aria-label="Quick Pass provider">
          <button
            type="button"
            aria-pressed={settings.provider === "deterministic"}
            className={settings.provider === "deterministic" ? "active" : ""}
            onClick={() => onProviderChange("deterministic")}
          >
            Deterministic
          </button>
          <button
            type="button"
            aria-pressed={settings.provider === "ollama"}
            className={settings.provider === "ollama" ? "active" : ""}
            onClick={() => onProviderChange("ollama")}
          >
            Ollama (local LLM)
          </button>
        </div>
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
        <Badge
          tone={
            status === "succeeded"
              ? "green"
              : status === "failed"
                ? "red"
                : status === "running"
                  ? "purple"
                  : "gray"
          }
        >
          {status}
        </Badge>
        <span>
          {status === "succeeded"
            ? `${providerLabel ?? "deterministic"} · ${describeProviderName(providerName)} · 신뢰도 ${Math.round((confidence ?? 0) * 100)}%`
            : status === "failed"
              ? error ?? "Quick Pass failed"
              : status === "running"
                ? `Running ${providerLabel ?? "Quick Pass"}...`
                : hasAnalysis
                  ? `이전 결과: ${providerLabel ?? "deterministic"} · ${describeProviderName(providerName)}`
                  : "아직 실행하지 않음"}
        </span>
        {fallbackUsed ? <Badge tone="orange">fallback</Badge> : null}
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
  if (name === "ollama-quick-pass-v1") return "real local LLM";
  if (name === "deterministic-heuristic-v1") return "heuristic (no LLM)";
  return "unknown provider";
}
