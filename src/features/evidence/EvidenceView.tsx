import { Archive, Link, RotateCcw, Search, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { getTrustDisplay } from "../../lib/privacy/trust";
import type { QuickPassAnalysisSettings, QuickPassProviderKind } from "../../lib/analysis";
import { ImportPanel } from "../import/ImportPanel";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";

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
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  return (
    <div className="page">
      <PageHeader
        title="Evidence"
        subtitle="Sources and inputs Mori uses to reconstruct this session"
      />
      <SessionModeBanner />
      <ImportPanel />
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
      {view.sources.length === 0 ? (
        <div className="evidence-empty">
          <Archive size={28} />
          <h2>아직 가져온 소스가 없습니다</h2>
          <p>위의 가져오기 패널에서 메모, URL, AI 대화를 추가하면 여기 표시됩니다.</p>
        </div>
      ) : (
        <div className="evidence-grid">
          {view.sources.map((source) => {
            const trust = getTrustDisplay(source.trustLevel);
            return (
              <article className="evidence-card" key={source.id}>
                <Archive size={22} />
                <Badge tone={trust.tone}>{trust.label}</Badge>
                <h2>{source.title}</h2>
                <p>{source.detail}</p>
                <dl className="source-meta">
                  <div><dt>Kind</dt><dd>{source.kind}</dd></div>
                  <div><dt>Redaction</dt><dd>{source.redactionStatus}</dd></div>
                  <div><dt>Raw data</dt><dd>{source.rawRetention}</dd></div>
                  <div><dt>Events</dt><dd>{source.relatedEventIds.length}</dd></div>
                </dl>
                <div>
                  <Button icon={Search}>원본 보기</Button>
                  <Button icon={Link}>연결 이벤트</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="source-principles">
        <h2>Trust model</h2>
        <p>
          Verified는 git diff, file changed, imported transcript, user note, explicit browser add처럼 원본 근거가 명확한 항목입니다.
          Observed는 active window, terminal command summary, file watcher, browser tab title처럼 관찰되었지만 의미 해석이 필요한 항목입니다.
          Inferred는 AI가 소스와 맥락을 바탕으로 만든 이벤트, 이슈, 결정, 관계입니다.
        </p>
      </div>
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
  const providerKindLabel = settings.provider === "ollama"
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
            <Button icon={RotateCcw} onClick={onClear}>분석 초기화</Button>
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
        <Button icon={SettingsIcon} onClick={onOpenSettings}>설정으로 이동</Button>
      </div>
      <div className="analysis-panel-status">
        <Badge tone={status === "succeeded" ? "green" : status === "failed" ? "red" : status === "running" ? "purple" : "gray"}>
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
            <li><strong>{issueCount}</strong><span>이슈</span></li>
            <li><strong>{decisionCount}</strong><span>결정</span></li>
            <li><strong>{nextActionCount}</strong><span>다음 액션</span></li>
          </ul>
          {notes.length ? (
            <ul className="analysis-panel-notes">
              {notes.map((note) => <li key={note}>{note}</li>)}
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
