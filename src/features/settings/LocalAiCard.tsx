import {
  Bot,
  Cloud,
  Code2,
  Database,
  FlaskConical,
  Plug,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BaseSelect, type BaseSelectOption } from "../../components/ui/BaseSelect";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  checkQuickPassCapability,
  probeOllamaConnection,
  probeOpenAiCompatibleConnection,
} from "../../lib/analysis";
import type {
  AnalysisRunHistoryViewModel,
  OllamaModelInfo,
  QuickPassAnalysisSettings,
  QuickPassCapabilityReport,
  QuickPassProviderKind,
} from "../../lib/analysis";
import { formatRelativeKo } from "../../lib/home/homeOverview";
import {
  PreferenceToggle,
  SettingsSection,
} from "./SettingsPrimitives";

type EngineChoice = QuickPassProviderKind | "lmStudio" | "cloudApi";
type ModelOption = { id: string; label: string; description?: string };

type ProbeState =
  | { status: "idle" }
  | { status: "checking"; kind: QuickPassProviderKind }
  | {
      status: "ok";
      message: string;
      models: string[];
      modelInfo?: OllamaModelInfo[];
      kind: QuickPassProviderKind;
    }
  | { status: "error"; message: string; kind: QuickPassProviderKind };

type CapabilityState =
  | { status: "idle" }
  | { status: "running"; kind: QuickPassProviderKind }
  | { status: "done"; kind: QuickPassProviderKind; report: QuickPassCapabilityReport };

const ENGINE_OPTIONS: Array<BaseSelectOption<EngineChoice>> = [
  {
    id: "deterministic",
    label: "규칙 기반",
    description: "모델 없이 즉시 정리",
    icon: Sparkles,
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "로컬 LLM 엔드포인트",
    icon: Bot,
  },
  {
    id: "lmStudio",
    label: "LM Studio",
    description: "OpenAI 호환 로컬 서버",
    icon: Database,
  },
  {
    id: "openAiCompatible",
    label: "OpenAI 호환",
    description: "vLLM, LocalAI, 사용자 서버",
    icon: Code2,
  },
  {
    id: "cloudApi",
    label: "Cloud API",
    description: "OpenAI 호환 외부 API",
    icon: Cloud,
  },
];

export function LocalAiCard({
  settings,
  runHistory,
  onProviderChange,
  onUpdateSettings,
}: {
  settings: QuickPassAnalysisSettings;
  runHistory: AnalysisRunHistoryViewModel | null;
  onProviderChange: (kind: QuickPassProviderKind) => void;
  onUpdateSettings: (patch: Partial<QuickPassAnalysisSettings>) => void;
}) {
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const [capability, setCapability] = useState<CapabilityState>({ status: "idle" });
  const activeChoice = useMemo(() => inferEngineChoice(settings), [settings]);
  const providerKind = toProviderKind(activeChoice);

  function selectEngine(choice: EngineChoice) {
    setProbe({ status: "idle" });
    setCapability({ status: "idle" });
    if (choice === "lmStudio") {
      onUpdateSettings({
        provider: "openAiCompatible",
        openAiBaseUrl: "http://localhost:1234/v1",
        openAiModel: settings.openAiModel === "local-model" ? "lm-studio" : settings.openAiModel,
      });
      return;
    }
    if (choice === "cloudApi") {
      onUpdateSettings({
        provider: "openAiCompatible",
        openAiBaseUrl: "https://api.openai.com/v1",
        openAiModel: settings.openAiModel === "local-model" ? "gpt-4.1-mini" : settings.openAiModel,
      });
      return;
    }
    onProviderChange(choice);
  }

  const handleProbe = useCallback(
    async (kind: QuickPassProviderKind = providerKind) => {
      if (kind === "deterministic") return;
      setProbe({ status: "checking", kind });
      if (kind === "openAiCompatible") {
        const result = await probeOpenAiCompatibleConnection({
          baseUrl: settings.openAiBaseUrl,
          apiKey: settings.openAiApiKey,
          timeoutMs: Math.min(settings.openAiTimeoutMs, 5_000),
        });
        setProbe(
          result.ok
            ? { status: "ok", message: result.message, models: result.models ?? [], kind }
            : { status: "error", message: result.message, kind },
        );
        return;
      }
      const result = await probeOllamaConnection({
        endpoint: settings.ollamaEndpoint,
        timeoutMs: Math.min(settings.ollamaTimeoutMs, 5_000),
      });
      setProbe(
        result.ok
          ? {
              status: "ok",
              message: result.message,
              models: result.models ?? [],
              modelInfo: result.modelInfo,
              kind,
            }
          : { status: "error", message: result.message, kind },
      );
    },
    [
      providerKind,
      settings.openAiBaseUrl,
      settings.openAiApiKey,
      settings.openAiTimeoutMs,
      settings.ollamaEndpoint,
      settings.ollamaTimeoutMs,
    ],
  );

  useEffect(() => {
    if (providerKind === "deterministic") return;
    const handle = setTimeout(() => {
      void handleProbe(providerKind);
    }, 600);
    return () => clearTimeout(handle);
  }, [providerKind, handleProbe]);

  async function handleCapabilityTest() {
    if (providerKind === "deterministic") return;
    setCapability({ status: "running", kind: providerKind });
    const report = await checkQuickPassCapability(settings);
    setCapability({ status: "done", kind: providerKind, report });
  }

  return (
    <SettingsSection title="분석 엔진">
      <div className="settings-ai-layout">
        <div className="settings-ai-engine-row">
          <label className="settings-ai-engine-select">
            <span>엔진</span>
            <BaseSelect
              value={activeChoice}
              options={ENGINE_OPTIONS}
              onChange={selectEngine}
              label="분석 엔진 선택"
              popoverWidth="trigger"
            />
          </label>
          <EngineSummary choice={activeChoice} />
        </div>

        <EngineConfigPanel
          choice={activeChoice}
          providerKind={providerKind}
          settings={settings}
          probe={probe}
          capability={capability}
          onProbe={() => handleProbe(providerKind)}
          onCapabilityTest={handleCapabilityTest}
          onUpdateSettings={onUpdateSettings}
        />
      </div>

      <RecentRunsPanel runHistory={runHistory} />
      <EngineSourceNote />
    </SettingsSection>
  );
}

function EngineSummary({ choice }: { choice: EngineChoice }) {
  const copy = {
    deterministic: {
      tone: "gray",
      text: "기기 안에서만 동작합니다. 빠르지만 깊은 추론은 제한적입니다.",
    },
    ollama: {
      tone: "green",
      text: "사용자가 실행 중인 로컬 Ollama 서버로만 요청을 보냅니다.",
    },
    lmStudio: {
      tone: "green",
      text: "LM Studio의 로컬 OpenAI 호환 서버를 사용합니다.",
    },
    openAiCompatible: {
      tone: "blue",
      text: "입력한 base URL로만 요청합니다. 로컬 또는 사설 서버에 맞습니다.",
    },
    cloudApi: {
      tone: "orange",
      text: "외부 API로 데이터가 전송될 수 있으므로 API 키와 URL을 직접 확인하세요.",
    },
  }[choice];
  return (
    <p className="settings-ai-engine-summary">
      <Badge tone={copy.tone}>{choice === "deterministic" ? "기본" : "실행 가능"}</Badge>
      <span>{copy.text}</span>
    </p>
  );
}

function EngineConfigPanel({
  choice,
  providerKind,
  settings,
  probe,
  capability,
  onProbe,
  onCapabilityTest,
  onUpdateSettings,
}: {
  choice: EngineChoice;
  providerKind: QuickPassProviderKind;
  settings: QuickPassAnalysisSettings;
  probe: ProbeState;
  capability: CapabilityState;
  onProbe: () => void;
  onCapabilityTest: () => void;
  onUpdateSettings: (patch: Partial<QuickPassAnalysisSettings>) => void;
}) {
  const probing = probe.status === "checking" && probe.kind === providerKind;
  const testing = capability.status === "running" && capability.kind === providerKind;
  const detected = probe.status === "ok" && probe.kind === providerKind ? probe : null;
  const detectedModels: ModelOption[] = detected
    ? detected.modelInfo && detected.modelInfo.length
      ? detected.modelInfo.map((info) => ({
          id: info.name,
          label: info.name,
          description: formatModelDetail(info),
        }))
      : detected.models.map((name) => ({ id: name, label: name }))
    : [];

  if (providerKind === "deterministic") {
    return (
      <section className="settings-ai-config-panel" aria-label="규칙 기반 설정">
        <p className="settings-ai-empty-config">
          규칙 기반 엔진은 endpoint, 모델, API 키가 없습니다. 필요할 때 즉시 Quick Pass를 실행합니다.
        </p>
      </section>
    );
  }

  return (
    <section className="settings-ai-config-panel" aria-label="분석 엔진 설정">
      {providerKind === "ollama" ? (
        <div className="settings-ai-field-grid">
          <ProviderField
            label="엔드포인트"
            value={settings.ollamaEndpoint}
            placeholder="http://localhost:11434"
            onChange={(value) => onUpdateSettings({ ollamaEndpoint: value })}
          />
          <ModelField
            label="모델"
            value={settings.ollamaModel}
            models={detectedModels}
            detecting={probing}
            placeholder="llama3.1:8b"
            onChange={(value) => onUpdateSettings({ ollamaModel: value })}
            onRefresh={onProbe}
          />
        </div>
      ) : (
        <div className="settings-ai-field-grid">
          <ProviderField
            label="Base URL"
            value={settings.openAiBaseUrl}
            placeholder={choice === "cloudApi" ? "https://api.openai.com/v1" : "http://localhost:1234/v1"}
            onChange={(value) => onUpdateSettings({ openAiBaseUrl: value })}
          />
          <ModelField
            label="모델"
            value={settings.openAiModel}
            models={detectedModels}
            detecting={probing}
            placeholder={choice === "cloudApi" ? "gpt-4.1-mini" : "local-model"}
            onChange={(value) => onUpdateSettings({ openAiModel: value })}
            onRefresh={onProbe}
          />
          <ProviderField
            label="API 키"
            value={settings.openAiApiKey}
            type="password"
            placeholder={choice === "cloudApi" ? "필수" : "필요한 경우만"}
            onChange={(value) => onUpdateSettings({ openAiApiKey: value })}
          />
        </div>
      )}

      <div className="settings-ai-verify">
        <div className="settings-ai-actions">
          <Button icon={Plug} variant="secondary" size="sm" onClick={onProbe} disabled={probing}>
            {probing ? "확인 중" : "연결 확인"}
          </Button>
          <Button
            icon={FlaskConical}
            variant="secondary"
            size="sm"
            onClick={onCapabilityTest}
            disabled={testing}
          >
            {testing ? "테스트 중" : "응답 테스트"}
          </Button>
        </div>
        <EngineStatus provider={providerKind} probe={probe} capability={capability} />
      </div>

      <details className="settings-ai-advanced">
        <summary>고급 설정</summary>
        <div className="settings-ai-advanced-body">
          {providerKind === "ollama" ? (
            <ProviderField
              label="요청 요약 모델"
              value={settings.requestAbstractionModel}
              placeholder="비워두면 기본 모델 사용"
              onChange={(value) => onUpdateSettings({ requestAbstractionModel: value })}
            />
          ) : null}
          <ProviderField
            label="타임아웃(ms)"
            value={String(providerKind === "openAiCompatible" ? settings.openAiTimeoutMs : settings.ollamaTimeoutMs)}
            inputMode="numeric"
            onChange={(value) =>
              providerKind === "openAiCompatible"
                ? onUpdateSettings({ openAiTimeoutMs: parseTimeout(value, settings.openAiTimeoutMs) })
                : onUpdateSettings({ ollamaTimeoutMs: parseTimeout(value, settings.ollamaTimeoutMs) })
            }
          />
          <div className="settings-ai-fallback">
            <span>
              <strong>실패 시 규칙 기반으로 전환</strong>
              <small>엔진 연결이 실패해도 분석 결과를 비워두지 않습니다.</small>
            </span>
            <PreferenceToggle
              label="실패 시 규칙 기반으로 전환"
              active={settings.fallbackToDeterministic}
              onToggle={() =>
                onUpdateSettings({ fallbackToDeterministic: !settings.fallbackToDeterministic })
              }
            />
          </div>
        </div>
      </details>
    </section>
  );
}

type StatusTone = "idle" | "ok" | "warn" | "err";

function StatusLine({
  tone,
  text,
  hint,
  alert,
}: {
  tone: StatusTone;
  text: string;
  hint?: string | null;
  alert?: boolean;
}) {
  return (
    <p className={`settings-ai-status tone-${tone}`} role={alert ? "alert" : undefined}>
      <span className="settings-ai-status-dot" aria-hidden="true" />
      <span className="settings-ai-status-text">
        {text}
        {hint ? <small>{hint}</small> : null}
      </span>
    </p>
  );
}

function EngineStatus({
  provider,
  probe,
  capability,
}: {
  provider: QuickPassProviderKind;
  probe: ProbeState;
  capability: CapabilityState;
}) {
  if (probe.status === "checking" && probe.kind === provider) {
    return <StatusLine tone="idle" text="엔드포인트에 연결하는 중입니다." />;
  }
  if (probe.status === "error" && probe.kind === provider) {
    return <StatusLine tone="err" alert text={`연결할 수 없습니다 · ${probe.message}`} />;
  }
  if (
    probe.status === "ok" &&
    probe.kind === provider &&
    probe.models.length === 0
  ) {
    return (
      <StatusLine
        tone="warn"
        text="연결됐지만 모델 목록이 비어 있습니다."
        hint="모델을 내려받았는지 확인하거나 직접 입력하세요."
      />
    );
  }
  return <CapabilityStatus capability={capability} provider={provider} />;
}

function CapabilityStatus({
  capability,
  provider,
}: {
  capability: CapabilityState;
  provider: QuickPassProviderKind;
}) {
  if (capability.status === "idle" || capability.kind !== provider) return null;
  if (capability.status === "running") {
    return <StatusLine tone="idle" text="응답 구조를 확인하는 중입니다." />;
  }
  const { report } = capability;
  if (report.verdict === "ready") {
    return (
      <StatusLine
        tone="ok"
        text={`응답 확인됨 · 이슈 ${report.counts.issues} · 결정 ${report.counts.decisions} · ${report.durationMs}ms`}
      />
    );
  }
  if (report.verdict === "reachableNoStructure") {
    return <StatusLine tone="warn" text={report.message} hint={report.hint} />;
  }
  return (
    <StatusLine
      tone="err"
      alert
      text={report.message}
      hint={report.hint ?? (report.error ? truncate(report.error, 80) : null)}
    />
  );
}

function ModelField({
  label,
  value,
  models,
  detecting,
  placeholder,
  onChange,
  onRefresh,
}: {
  label: string;
  value: string;
  models: ModelOption[];
  detecting: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const [manual, setManual] = useState(false);
  const hasModels = models.length > 0;
  const valueInList = models.some((model) => model.id === value);
  const useSelect = hasModels && !manual;
  return (
    <label className="settings-ai-field settings-ai-model-field">
      <span>{label}</span>
      <div className="settings-ai-model-input">
        {useSelect ? (
          <BaseSelect
            value={valueInList ? value : models[0]!.id}
            options={models}
            onChange={onChange}
            label={`${label} 선택`}
            className="settings-ai-model-select"
            popoverWidth="trigger"
          />
        ) : (
          <input
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        <button
          type="button"
          className="settings-ai-model-refresh"
          onClick={onRefresh}
          disabled={detecting}
          aria-label="설치된 모델 다시 감지"
          title="설치된 모델 다시 감지"
        >
          <RefreshCw size={13} className={detecting ? "is-spinning" : undefined} aria-hidden="true" />
        </button>
      </div>
      <div className="settings-ai-model-meta">
        <small>
          {detecting
            ? "설치된 모델 감지 중"
            : hasModels
              ? `설치된 모델 ${models.length}개 감지됨`
              : "감지된 모델 없음 · 직접 입력하세요"}
        </small>
        {hasModels ? (
          <button
            type="button"
            className="settings-ai-model-toggle"
            onClick={() => setManual((current) => !current)}
          >
            {manual ? "목록에서 선택" : "직접 입력"}
          </button>
        ) : null}
      </div>
    </label>
  );
}

const MAX_RECENT_RUNS = 5;

function RecentRunsPanel({ runHistory }: { runHistory: AnalysisRunHistoryViewModel | null }) {
  const rows = runHistory ? runHistory.rows.slice(0, MAX_RECENT_RUNS) : [];
  return (
    <section className="settings-ai-info" aria-label="최근 실행">
      <header className="settings-ai-info-head">
        <h4>최근 실행</h4>
        {runHistory && runHistory.runCount > 0 ? (
          <span className="settings-ai-info-count">{runHistory.runCount}회</span>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <p className="settings-ai-info-empty">아직 분석을 실행한 기록이 없습니다.</p>
      ) : (
        <ul className="settings-ai-run-list">
          {rows.map((row) => (
            <li
              key={row.runId}
              className={`settings-ai-run-row${row.isCurrent ? " is-current" : ""}`}
            >
              <span className="settings-ai-run-dot" aria-hidden="true" />
              <div className="settings-ai-run-main">
                <div className="settings-ai-run-head">
                  <strong>{row.providerLabel}</strong>
                  {row.isCurrent ? <span className="settings-ai-run-current">현재</span> : null}
                  <small>{formatRelativeKo(row.generatedAt)}</small>
                </div>
                <small className="settings-ai-run-stats">
                  이슈 {row.reason.elementCounts.issues}개 · 결정 {row.reason.elementCounts.decisions}개 ·
                  신뢰 {Math.round(row.confidence * 100)}% · {row.durationMs}ms
                  {row.changeSummary && row.changeSummary !== "변경 없음"
                    ? ` · ${row.changeSummary}`
                    : ""}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EngineSourceNote() {
  return (
    <section className="settings-ai-source-note">
      <strong>Claude · Codex · OpenCode</strong>
      <span>
        이 도구들은 분석 엔진이 아니라 작업 소스입니다. 연결 화면에서 실제 대화나 JSONL 기록을 가져오면,
        위에서 선택한 엔진으로 그 세션을 분석합니다.
      </span>
      <Badge tone="green">가져오기 구현됨</Badge>
    </section>
  );
}

function ProviderField({
  label,
  value,
  type = "text",
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "password";
  placeholder?: string;
  inputMode?: "numeric";
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-ai-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function inferEngineChoice(settings: QuickPassAnalysisSettings): EngineChoice {
  if (settings.provider !== "openAiCompatible") return settings.provider;
  const baseUrl = settings.openAiBaseUrl.trim().toLowerCase();
  if (baseUrl.includes("localhost:1234") || baseUrl.includes("127.0.0.1:1234")) {
    return "lmStudio";
  }
  if (baseUrl.includes("api.openai.com")) return "cloudApi";
  return "openAiCompatible";
}

function toProviderKind(choice: EngineChoice): QuickPassProviderKind {
  if (choice === "lmStudio" || choice === "cloudApi") return "openAiCompatible";
  return choice;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function formatModelDetail(info: OllamaModelInfo): string | undefined {
  return info.parameterSize ?? (info.sizeBytes ? formatBytes(info.sizeBytes) : undefined);
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))}MB`;
}

function parseTimeout(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
