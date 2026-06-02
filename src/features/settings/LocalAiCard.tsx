import {
  Bot,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  Plug,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { probeOllamaConnection, probeOpenAiCompatibleConnection } from "../../lib/analysis";
import type {
  AnalysisResult,
  AnalysisRunStatus,
  QuickPassAnalysisSettings,
  QuickPassProviderKind,
} from "../../lib/analysis";
import { getProviderRows, type ProviderRow as ProviderRowModel } from "../../lib/settings/settingsStatus";
import {
  PreferenceToggle,
  SettingsSection,
  StatusPill,
} from "./SettingsPrimitives";

const ICONS: Record<string, typeof Bot> = {
  deterministic: Sparkles,
  ollama: Bot,
  lmStudio: Database,
  openAiCompatible: Code2,
  toolNativeApi: Plug,
  cloudApi: Cloud,
};

const PROVIDER_COPY: Record<QuickPassProviderKind, { label: string; summary: string; data: string }> = {
  deterministic: {
    label: "규칙 기반",
    summary: "모델 없이 제목과 요약의 신호를 빠르게 정리합니다.",
    data: "네트워크 호출 없음",
  },
  ollama: {
    label: "Ollama",
    summary: "로컬 LLM으로 더 풍부한 이슈와 결정을 추출합니다.",
    data: "입력한 로컬 endpoint만 사용",
  },
  openAiCompatible: {
    label: "OpenAI 호환",
    summary: "LM Studio, vLLM, LocalAI, OpenAI 호환 API를 연결합니다.",
    data: "입력한 base URL로 전송",
  },
};

type ProbeState =
  | { status: "idle" }
  | { status: "checking"; kind: QuickPassProviderKind }
  | { status: "ok"; message: string; models: string[]; kind: QuickPassProviderKind }
  | { status: "error"; message: string; kind: QuickPassProviderKind };

type EngineDiagnostics = {
  analysis: AnalysisResult | null;
  status: AnalysisRunStatus;
  error: string | null;
  providerLabel: string | null;
  fallbackUsed: boolean;
  importCount: number;
  sourceCount: number;
};

export function LocalAiCard({
  settings,
  diagnostics,
  onProviderChange,
  onUpdateSettings,
}: {
  settings: QuickPassAnalysisSettings;
  diagnostics: EngineDiagnostics;
  onProviderChange: (kind: QuickPassProviderKind) => void;
  onUpdateSettings: (patch: Partial<QuickPassAnalysisSettings>) => void;
}) {
  const rows = getProviderRows(settings);
  const selectableRows = rows.filter((row): row is ProviderRowModel & { id: QuickPassProviderKind } =>
    row.status === "implemented" &&
    (row.id === "deterministic" || row.id === "ollama" || row.id === "openAiCompatible"),
  );
  const plannedRows = rows.filter((row) => row.status !== "implemented");
  const activeRow = selectableRows.find((row) => row.id === settings.provider) ?? selectableRows[0];
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

  function selectProvider(kind: QuickPassProviderKind) {
    onProviderChange(kind);
    setProbe({ status: "idle" });
  }

  async function handleTest(kind: QuickPassProviderKind) {
    if (kind === "deterministic") return;
    setProbe({ status: "checking", kind });
    const result =
      kind === "openAiCompatible"
        ? await probeOpenAiCompatibleConnection({
            baseUrl: settings.openAiBaseUrl,
            apiKey: settings.openAiApiKey,
            timeoutMs: Math.min(settings.openAiTimeoutMs, 5_000),
          })
        : await probeOllamaConnection({
            endpoint: settings.ollamaEndpoint,
            timeoutMs: Math.min(settings.ollamaTimeoutMs, 5_000),
          });
    if (result.ok) {
      setProbe({ status: "ok", message: result.message, models: result.models ?? [], kind });
    } else {
      setProbe({ status: "error", message: result.message, kind });
    }
  }

  return (
    <SettingsSection
      title="Quick Pass 엔진"
      description="Quick Pass가 가져온 자료를 이슈, 결정, 다음 행동으로 정리할 때 사용할 엔진입니다."
    >
      <div className="settings-ai-layout">
        <div className="settings-ai-provider-grid" role="radiogroup" aria-label="Quick Pass 엔진">
          {selectableRows.map((row) => (
            <ProviderChoice
              key={row.id}
              row={row}
              selected={row.id === settings.provider}
              onSelect={() => selectProvider(row.id)}
            />
          ))}
        </div>

        <EngineConfigPanel
          row={activeRow}
          settings={settings}
          diagnostics={diagnostics}
          probe={probe}
          onTest={() => handleTest(settings.provider)}
          onUpdateSettings={onUpdateSettings}
        />
      </div>

      {plannedRows.length > 0 ? (
        <details className="settings-ai-planned">
          <summary>
            <span>향후 지원</span>
            <small>{plannedRows.length}개 엔진</small>
          </summary>
          <div className="settings-ai-planned-list">
            {plannedRows.map((row) => {
              const Icon = ICONS[row.id] ?? Bot;
              return (
                <span key={row.id}>
                  <Icon size={13} aria-hidden="true" />
                  {row.label}
                </span>
              );
            })}
          </div>
        </details>
      ) : null}
    </SettingsSection>
  );
}

function ProviderChoice({
  row,
  selected,
  onSelect,
}: {
  row: ProviderRowModel & { id: QuickPassProviderKind };
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = ICONS[row.id] ?? Bot;
  const copy = PROVIDER_COPY[row.id];
  return (
    <button
      type="button"
      className={`settings-ai-provider${selected ? " is-selected" : ""}`}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className="settings-ai-provider-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="settings-ai-provider-main">
        <span className="settings-ai-provider-title">
          <strong>{copy.label}</strong>
          {selected ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
        </span>
        <small>{copy.summary}</small>
      </span>
      <span className="settings-ai-provider-data">{copy.data}</span>
    </button>
  );
}

function EngineConfigPanel({
  row,
  settings,
  diagnostics,
  probe,
  onTest,
  onUpdateSettings,
}: {
  row?: ProviderRowModel & { id: QuickPassProviderKind };
  settings: QuickPassAnalysisSettings;
  diagnostics: EngineDiagnostics;
  probe: ProbeState;
  onTest: () => void;
  onUpdateSettings: (patch: Partial<QuickPassAnalysisSettings>) => void;
}) {
  if (!row) return null;
  const copy = PROVIDER_COPY[row.id];
  const busy = probe.status === "checking" && probe.kind === row.id;
  const canTest = row.id !== "deterministic";
  return (
    <section className="settings-ai-config-panel" aria-label={`${copy.label} 설정`}>
      <header className="settings-ai-config-head">
        <div>
          <h4>{copy.label}</h4>
          <p>{row.id === "deterministic" ? "즉시 사용 가능. 가볍지만 LLM처럼 문맥을 깊게 추론하지는 않습니다." : row.setupRequirement}</p>
        </div>
        {canTest ? (
          <Button icon={Plug} onClick={onTest} disabled={busy}>
            {busy ? "확인 중" : "연결 확인"}
          </Button>
        ) : null}
      </header>

      {row.id === "deterministic" ? (
        <div className="settings-ai-empty-config">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>추가 설정 없이 이 기기 안에서 실행됩니다.</span>
        </div>
      ) : null}

      {row.id === "ollama" ? (
        <div className="settings-ai-field-grid">
          <ProviderField
            label="Endpoint"
            value={settings.ollamaEndpoint}
            placeholder="http://localhost:11434"
            onChange={(value) => onUpdateSettings({ ollamaEndpoint: value })}
          />
          <ProviderField
            label="모델"
            value={settings.ollamaModel}
            placeholder="llama3.1:8b"
            onChange={(value) => onUpdateSettings({ ollamaModel: value })}
          />
        </div>
      ) : null}

      {row.id === "openAiCompatible" ? (
        <div className="settings-ai-field-grid">
          <ProviderField
            label="Base URL"
            value={settings.openAiBaseUrl}
            placeholder="http://localhost:1234/v1"
            onChange={(value) => onUpdateSettings({ openAiBaseUrl: value })}
          />
          <ProviderField
            label="모델"
            value={settings.openAiModel}
            placeholder="local-model"
            onChange={(value) => onUpdateSettings({ openAiModel: value })}
          />
          <ProviderField
            label="API key"
            value={settings.openAiApiKey}
            type="password"
            placeholder="필요한 경우만"
            onChange={(value) => onUpdateSettings({ openAiApiKey: value })}
          />
        </div>
      ) : null}

      <ProbeRow
        probe={probe}
        selectedModel={
          probe.status === "ok"
            ? probe.kind === "openAiCompatible"
              ? settings.openAiModel
              : settings.ollamaModel
            : ""
        }
        onSelectModel={(model) => {
          if (probe.status !== "ok") return;
          onUpdateSettings(
            probe.kind === "openAiCompatible" ? { openAiModel: model } : { ollamaModel: model },
          );
        }}
      />

      <EngineDiagnosticsPanel
        provider={row.id}
        probe={probe}
        diagnostics={diagnostics}
        fallbackEnabled={settings.fallbackToDeterministic}
      />

      {row.id !== "deterministic" ? (
        <details className="settings-ai-advanced">
          <summary>고급 설정</summary>
          <div className="settings-ai-advanced-body">
            {row.id === "ollama" ? (
              <ProviderField
                label="요청 요약 모델"
                value={settings.requestAbstractionModel}
                placeholder="비워두면 기본 모델 사용"
                onChange={(value) => onUpdateSettings({ requestAbstractionModel: value })}
              />
            ) : null}
            <ProviderField
              label="타임아웃(ms)"
              value={String(row.id === "openAiCompatible" ? settings.openAiTimeoutMs : settings.ollamaTimeoutMs)}
              inputMode="numeric"
              onChange={(value) =>
                row.id === "openAiCompatible"
                  ? onUpdateSettings({ openAiTimeoutMs: parseTimeout(value, settings.openAiTimeoutMs) })
                  : onUpdateSettings({ ollamaTimeoutMs: parseTimeout(value, settings.ollamaTimeoutMs) })
              }
            />
            <div className="settings-ai-fallback">
              <span>
                <strong>실패 시 규칙 기반으로 전환</strong>
                <small>엔진 연결이 실패해도 Quick Pass 결과를 비워두지 않습니다.</small>
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
      ) : null}
    </section>
  );
}

function EngineDiagnosticsPanel({
  provider,
  probe,
  diagnostics,
  fallbackEnabled,
}: {
  provider: QuickPassProviderKind;
  probe: ProbeState;
  diagnostics: EngineDiagnostics;
  fallbackEnabled: boolean;
}) {
  const items = buildDiagnosticItems({ provider, probe, diagnostics, fallbackEnabled });
  return (
    <div className="settings-ai-diagnostics" aria-label="AI 엔진 진단">
      {items.map((item) => (
        <div key={item.label} className={`settings-ai-diagnostic tone-${item.tone}`}>
          <span className="settings-ai-diagnostic-dot" aria-hidden="true" />
          <span>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

type DiagnosticItem = {
  label: string;
  value: string;
  tone: "ok" | "info" | "idle" | "warn" | "error";
};

function buildDiagnosticItems({
  provider,
  probe,
  diagnostics,
  fallbackEnabled,
}: {
  provider: QuickPassProviderKind;
  probe: ProbeState;
  diagnostics: EngineDiagnostics;
  fallbackEnabled: boolean;
}): DiagnosticItem[] {
  return [
    {
      label: "입력",
      value:
        diagnostics.importCount > 0 || diagnostics.sourceCount > 0
          ? `가져오기 ${diagnostics.importCount}건 · 출처 ${diagnostics.sourceCount}개`
          : "분석할 자료 없음",
      tone: diagnostics.importCount > 0 || diagnostics.sourceCount > 0 ? "info" : "idle",
    },
    dataRouteDiagnostic(provider),
    connectionDiagnostic(provider, probe),
    fallbackDiagnostic(provider, fallbackEnabled),
    lastRunDiagnostic(diagnostics),
  ];
}

function dataRouteDiagnostic(provider: QuickPassProviderKind): DiagnosticItem {
  if (provider === "openAiCompatible") {
    return { label: "데이터 경로", value: "입력한 base URL", tone: "warn" };
  }
  if (provider === "ollama") {
    return { label: "데이터 경로", value: "입력한 로컬 endpoint", tone: "ok" };
  }
  return { label: "데이터 경로", value: "기기 내부", tone: "ok" };
}

function connectionDiagnostic(provider: QuickPassProviderKind, probe: ProbeState): DiagnosticItem {
  if (provider === "deterministic") {
    return { label: "연결", value: "필요 없음", tone: "ok" };
  }
  if (probe.status === "checking" && probe.kind === provider) {
    return { label: "연결", value: "확인 중", tone: "idle" };
  }
  if (probe.status === "ok" && probe.kind === provider) {
    const suffix = probe.models.length ? ` · 모델 ${probe.models.length}개` : "";
    return { label: "연결", value: `확인됨${suffix}`, tone: "ok" };
  }
  if (probe.status === "error" && probe.kind === provider) {
    return { label: "연결", value: "확인 실패", tone: "error" };
  }
  return { label: "연결", value: "아직 확인 안 함", tone: "idle" };
}

function fallbackDiagnostic(provider: QuickPassProviderKind, enabled: boolean): DiagnosticItem {
  if (provider === "deterministic") {
    return { label: "Fallback", value: "해당 없음", tone: "idle" };
  }
  return {
    label: "Fallback",
    value: enabled ? "규칙 기반으로 전환" : "실패를 그대로 표시",
    tone: enabled ? "info" : "warn",
  };
}

function lastRunDiagnostic(diagnostics: EngineDiagnostics): DiagnosticItem {
  if (diagnostics.status === "running") {
    return { label: "최근 실행", value: "실행 중", tone: "idle" };
  }
  if (diagnostics.status === "failed") {
    return {
      label: "최근 실행",
      value: diagnostics.error ? `실패 · ${truncate(diagnostics.error, 34)}` : "실패",
      tone: "error",
    };
  }
  if (!diagnostics.analysis) {
    return { label: "최근 실행", value: "아직 없음", tone: "idle" };
  }
  const provider = diagnostics.fallbackUsed
    ? "fallback 사용"
    : diagnostics.providerLabel ?? diagnostics.analysis.providerLabel;
  return {
    label: "최근 실행",
    value: `${provider} · ${Math.round(diagnostics.analysis.confidence * 100)}% · ${diagnostics.analysis.durationMs}ms`,
    tone: "ok",
  };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function ProbeRow({
  probe,
  selectedModel = "",
  onSelectModel,
}: {
  probe: ProbeState;
  selectedModel?: string;
  onSelectModel?: (model: string) => void;
}) {
  if (probe.status === "idle") return null;
  if (probe.status === "checking") {
    return (
      <div className="settings-probe-row">
        <StatusPill tone="purple">확인 중</StatusPill>
        <span>엔드포인트에 연결하고 있습니다...</span>
      </div>
    );
  }
  if (probe.status === "ok") {
    return (
      <div className="settings-probe-row tone-ok">
        <StatusPill tone="green">연결됨</StatusPill>
        <span>{probe.message}</span>
        {probe.models.length ? (
          <div className="settings-probe-models" aria-label="발견된 모델">
            {probe.models.map((model) => (
              <button
                key={model}
                type="button"
                className={`settings-probe-model${model === selectedModel ? " is-selected" : ""}`}
                aria-pressed={model === selectedModel}
                onClick={() => onSelectModel?.(model)}
              >
                {model}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="settings-probe-row tone-err" role="alert">
      <StatusPill tone="red">연결 불가</StatusPill>
      <span>{probe.message}</span>
    </div>
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

function parseTimeout(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
