import {
  Bot,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  FlaskConical,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/Button";
import {
  captureEnginePreset,
  checkQuickPassCapability,
  findMatchingPresetId,
  loadEnginePresets,
  probeOllamaConnection,
  probeOpenAiCompatibleConnection,
  saveEnginePresets,
} from "../../lib/analysis";
import type {
  AnalysisResult,
  AnalysisRunHistoryViewModel,
  AnalysisRunStatus,
  EnginePreset,
  QuickPassAnalysisSettings,
  QuickPassCapabilityReport,
  QuickPassProviderKind,
} from "../../lib/analysis";
import { formatRelativeKo } from "../../lib/home/homeOverview";
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

const PROVIDER_COPY: Record<QuickPassProviderKind, { label: string; summary: string }> = {
  deterministic: {
    label: "규칙 기반",
    summary: "모델 없이 기기 안에서 즉시 정리합니다.",
  },
  ollama: {
    label: "Ollama",
    summary: "로컬 LLM으로 더 깊은 이슈·결정을 추출합니다.",
  },
  openAiCompatible: {
    label: "OpenAI 호환",
    summary: "LM Studio·vLLM·OpenAI 호환 API를 연결합니다.",
  },
};

const PLANNED_COPY: Record<string, { label: string; summary: string }> = {
  lmStudio: {
    label: "LM Studio",
    summary: "전용 LM Studio 연결. 지금은 OpenAI 호환으로 연결할 수 있습니다.",
  },
  toolNativeApi: {
    label: "Claude · Codex · OpenCode",
    summary: "도구 계정을 분석 제공자로 직접 연결합니다.",
  },
  cloudApi: {
    label: "Cloud API",
    summary: "Anthropic·OpenAI 등 외부 API. 명시적 동의 후에만 사용합니다.",
  },
};

type ProbeState =
  | { status: "idle" }
  | { status: "checking"; kind: QuickPassProviderKind }
  | { status: "ok"; message: string; models: string[]; kind: QuickPassProviderKind }
  | { status: "error"; message: string; kind: QuickPassProviderKind };

type CapabilityState =
  | { status: "idle" }
  | { status: "running"; kind: QuickPassProviderKind }
  | { status: "done"; kind: QuickPassProviderKind; report: QuickPassCapabilityReport };

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
  runHistory,
  onProviderChange,
  onUpdateSettings,
}: {
  settings: QuickPassAnalysisSettings;
  diagnostics: EngineDiagnostics;
  runHistory: AnalysisRunHistoryViewModel | null;
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
  const [capability, setCapability] = useState<CapabilityState>({ status: "idle" });
  const [presets, setPresets] = useState<EnginePreset[]>(() => loadEnginePresets());

  function selectProvider(kind: QuickPassProviderKind) {
    onProviderChange(kind);
    setProbe({ status: "idle" });
    setCapability({ status: "idle" });
  }

  const handleProbe = useCallback(
    async (kind: QuickPassProviderKind) => {
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
    },
    [
      settings.openAiBaseUrl,
      settings.openAiApiKey,
      settings.openAiTimeoutMs,
      settings.ollamaEndpoint,
      settings.ollamaTimeoutMs,
    ],
  );

  // Auto-detect installed models for endpoint-backed engines so the user never
  // has to type a model name blind. Debounced so editing the endpoint does not
  // fire a request on every keystroke.
  useEffect(() => {
    if (settings.provider === "deterministic") return;
    const handle = setTimeout(() => {
      void handleProbe(settings.provider);
    }, 600);
    return () => clearTimeout(handle);
  }, [settings.provider, handleProbe]);

  function applyPreset(preset: EnginePreset) {
    onUpdateSettings(preset.settings);
    setProbe({ status: "idle" });
    setCapability({ status: "idle" });
  }

  function savePreset(name: string) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `preset-${Date.now()}`;
    const preset = captureEnginePreset(id, name, settings);
    const next = [...presets.filter((entry) => entry.name !== preset.name), preset];
    setPresets(next);
    saveEnginePresets(next);
  }

  function deletePreset(id: string) {
    const next = presets.filter((entry) => entry.id !== id);
    setPresets(next);
    saveEnginePresets(next);
  }

  async function handleCapabilityTest(kind: QuickPassProviderKind) {
    if (kind === "deterministic") return;
    setCapability({ status: "running", kind });
    const report = await checkQuickPassCapability(settings);
    setCapability({ status: "done", kind, report });
  }

  return (
    <SettingsSection
      title="분석 엔진"
      description="가져온 자료를 이슈, 결정, 다음 행동으로 정리할 때 사용할 엔진입니다. 규칙 기반은 모델 없이 동작하고, Ollama·OpenAI 호환은 로컬 LLM으로 더 깊게 해석합니다."
    >
      <div className="settings-ai-layout">
        <EnginePresetsBar
          settings={settings}
          presets={presets}
          onApply={applyPreset}
          onSave={savePreset}
          onDelete={deletePreset}
        />

        <div className="settings-ai-provider-grid" role="radiogroup" aria-label="분석 엔진">
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
          capability={capability}
          onProbe={() => handleProbe(settings.provider)}
          onCapabilityTest={() => handleCapabilityTest(settings.provider)}
          onUpdateSettings={onUpdateSettings}
        />
      </div>

      {runHistory && runHistory.runCount > 0 ? (
        <RecentRunsDisclosure runHistory={runHistory} />
      ) : null}

      {plannedRows.length > 0 ? (
        <details className="settings-ai-planned">
          <summary>
            <span>향후 지원 엔진</span>
            <small>{plannedRows.length}개</small>
          </summary>
          <table className="settings-ai-planned-table">
            <tbody>
              {plannedRows.map((row) => {
                const Icon = ICONS[row.id] ?? Bot;
                const copy = PLANNED_COPY[row.id];
                return (
                  <tr key={row.id}>
                    <th scope="row">
                      <Icon size={14} aria-hidden="true" />
                      {copy?.label ?? row.label}
                    </th>
                    <td>{copy?.summary ?? row.description}</td>
                    <td>
                      <StatusPill tone="gray">예정</StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ) : null}
    </SettingsSection>
  );
}

function suggestPresetName(settings: QuickPassAnalysisSettings): string {
  if (settings.provider === "ollama") return `Ollama · ${settings.ollamaModel}`;
  if (settings.provider === "openAiCompatible") return `OpenAI 호환 · ${settings.openAiModel}`;
  return "규칙 기반";
}

function EnginePresetsBar({
  settings,
  presets,
  onApply,
  onSave,
  onDelete,
}: {
  settings: QuickPassAnalysisSettings;
  presets: EnginePreset[];
  onApply: (preset: EnginePreset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const activeId = findMatchingPresetId(settings, presets);

  function commit() {
    const name = draft.trim();
    if (!name) return;
    onSave(name);
    setNaming(false);
    setDraft("");
  }

  function cancel() {
    setNaming(false);
    setDraft("");
  }

  return (
    <div className="settings-ai-presets" role="group" aria-label="엔진 프리셋">
      {presets.map((preset) => (
        <span
          key={preset.id}
          className={`settings-ai-preset${preset.id === activeId ? " is-active" : ""}`}
        >
          <button
            type="button"
            className="settings-ai-preset-apply"
            aria-pressed={preset.id === activeId}
            onClick={() => onApply(preset)}
          >
            {preset.name}
          </button>
          <button
            type="button"
            className="settings-ai-preset-remove"
            aria-label={`${preset.name} 프리셋 삭제`}
            onClick={() => onDelete(preset.id)}
          >
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ))}

      {naming ? (
        <span className="settings-ai-preset-form">
          <input
            autoFocus
            value={draft}
            placeholder="프리셋 이름"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") cancel();
            }}
          />
          <button type="button" onClick={commit} disabled={!draft.trim()}>
            확인
          </button>
          <button type="button" className="settings-ai-preset-cancel" onClick={cancel}>
            취소
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="settings-ai-preset-save"
          onClick={() => {
            setDraft(suggestPresetName(settings));
            setNaming(true);
          }}
        >
          <Plus size={12} aria-hidden="true" />
          현재 설정 저장
        </button>
      )}
    </div>
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
    </button>
  );
}

function EngineConfigPanel({
  row,
  settings,
  diagnostics,
  probe,
  capability,
  onProbe,
  onCapabilityTest,
  onUpdateSettings,
}: {
  row?: ProviderRowModel & { id: QuickPassProviderKind };
  settings: QuickPassAnalysisSettings;
  diagnostics: EngineDiagnostics;
  probe: ProbeState;
  capability: CapabilityState;
  onProbe: () => void;
  onCapabilityTest: () => void;
  onUpdateSettings: (patch: Partial<QuickPassAnalysisSettings>) => void;
}) {
  if (!row) return null;
  const copy = PROVIDER_COPY[row.id];
  const probing = probe.status === "checking" && probe.kind === row.id;
  const testing = capability.status === "running" && capability.kind === row.id;
  const canTest = row.id !== "deterministic";
  const detectedModels =
    probe.status === "ok" && probe.kind === row.id ? probe.models : [];
  return (
    <section className="settings-ai-config-panel" aria-label={`${copy.label} 설정`}>
      <header className="settings-ai-config-head">
        <h4>{copy.label}</h4>
        {canTest ? (
          <div className="settings-ai-config-actions">
            <Button icon={Plug} variant="ghost" size="sm" onClick={onProbe} disabled={probing}>
              {probing ? "확인 중" : "연결 확인"}
            </Button>
            <Button
              icon={FlaskConical}
              variant="primary"
              size="sm"
              onClick={onCapabilityTest}
              disabled={testing}
            >
              {testing ? "테스트 중" : "응답 테스트"}
            </Button>
          </div>
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
      ) : null}

      {row.id === "openAiCompatible" ? (
        <div className="settings-ai-field-grid">
          <ProviderField
            label="Base URL"
            value={settings.openAiBaseUrl}
            placeholder="http://localhost:1234/v1"
            onChange={(value) => onUpdateSettings({ openAiBaseUrl: value })}
          />
          <ModelField
            label="모델"
            value={settings.openAiModel}
            models={detectedModels}
            detecting={probing}
            placeholder="local-model"
            onChange={(value) => onUpdateSettings({ openAiModel: value })}
            onRefresh={onProbe}
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

      <ProbeRow probe={probe} />

      <CapabilityRow capability={capability} />

      <EngineDiagnosticsPanel
        provider={row.id}
        probe={probe}
        capability={capability}
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
  capability,
  diagnostics,
  fallbackEnabled,
}: {
  provider: QuickPassProviderKind;
  probe: ProbeState;
  capability: CapabilityState;
  diagnostics: EngineDiagnostics;
  fallbackEnabled: boolean;
}) {
  const items = buildDiagnosticItems({ provider, probe, capability, diagnostics, fallbackEnabled });
  return (
    <table className="settings-ai-diag-table" aria-label="분석 엔진 진단">
      <tbody>
        {items.map((item) => (
          <tr key={item.label} className={`tone-${item.tone}`}>
            <th scope="row">
              <span className="settings-ai-diag-dot" aria-hidden="true" />
              {item.label}
            </th>
            <td>{item.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  capability,
  diagnostics,
  fallbackEnabled,
}: {
  provider: QuickPassProviderKind;
  probe: ProbeState;
  capability: CapabilityState;
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
    capabilityDiagnostic(provider, capability),
    fallbackDiagnostic(provider, fallbackEnabled),
    lastRunDiagnostic(diagnostics),
  ];
}

function capabilityDiagnostic(
  provider: QuickPassProviderKind,
  capability: CapabilityState,
): DiagnosticItem {
  if (provider === "deterministic") {
    return { label: "응답", value: "항상 가능", tone: "ok" };
  }
  if (capability.status === "running" && capability.kind === provider) {
    return { label: "응답", value: "테스트 중", tone: "idle" };
  }
  if (capability.status === "done" && capability.kind === provider) {
    const { report } = capability;
    if (report.verdict === "ready") {
      return { label: "응답", value: `구조화 가능 · ${report.durationMs}ms`, tone: "ok" };
    }
    if (report.verdict === "reachableNoStructure") {
      return { label: "응답", value: "구조 없음", tone: "warn" };
    }
    return { label: "응답", value: "실패", tone: "error" };
  }
  return { label: "응답", value: "아직 테스트 안 함", tone: "idle" };
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

function ProbeRow({ probe }: { probe: ProbeState }) {
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
        <span>
          {probe.models.length
            ? `설치된 모델 ${probe.models.length}개를 찾았습니다.`
            : "연결됐지만 설치된 모델이 없습니다. 먼저 모델을 내려받으세요."}
        </span>
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

/**
 * Model field with installed-model autodetect. A native datalist gives a
 * dropdown of detected models while still allowing free entry, and a refresh
 * button re-probes the endpoint. No blind typing of model names.
 */
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
  models: string[];
  detecting: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const listId = useId();
  return (
    <label className="settings-ai-field settings-ai-model-field">
      <span>{label}</span>
      <div className="settings-ai-model-input">
        <input
          list={listId}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
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
        <datalist id={listId}>
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </div>
      <small className="settings-ai-model-hint">
        {detecting
          ? "설치된 모델을 감지하는 중…"
          : models.length
            ? `설치된 모델 ${models.length}개 · 목록에서 선택하거나 직접 입력`
            : "감지된 모델이 없습니다 · 모델 이름을 직접 입력하세요"}
      </small>
    </label>
  );
}

function CapabilityRow({ capability }: { capability: CapabilityState }) {
  if (capability.status === "idle") return null;
  if (capability.status === "running") {
    return (
      <div className="settings-capability-row">
        <StatusPill tone="purple">테스트 중</StatusPill>
        <span>합성 샘플로 엔진이 구조화된 응답을 내는지 확인합니다...</span>
      </div>
    );
  }
  const { report } = capability;
  if (report.verdict === "ready") {
    return (
      <div className="settings-capability-row tone-ok">
        <StatusPill tone="green">응답 확인됨</StatusPill>
        <span>
          {report.message} · 이슈 {report.counts.issues}개 · 결정 {report.counts.decisions}개 ·{" "}
          {report.durationMs}ms
        </span>
      </div>
    );
  }
  if (report.verdict === "reachableNoStructure") {
    return (
      <div className="settings-capability-row tone-warn">
        <StatusPill tone="orange">부분 응답</StatusPill>
        <span>{report.message}</span>
        {report.hint ? <small className="settings-capability-hint">{report.hint}</small> : null}
      </div>
    );
  }
  return (
    <div className="settings-capability-row tone-err" role="alert">
      <StatusPill tone="red">테스트 실패</StatusPill>
      <span>{report.message}</span>
      {report.hint ? <small className="settings-capability-hint">{report.hint}</small> : null}
      {report.error ? (
        <small className="settings-capability-error">{truncate(report.error, 80)}</small>
      ) : null}
    </div>
  );
}

const MAX_RECENT_RUNS = 5;

function RecentRunsDisclosure({ runHistory }: { runHistory: AnalysisRunHistoryViewModel }) {
  const rows = runHistory.rows.slice(0, MAX_RECENT_RUNS);
  return (
    <details className="settings-ai-runs">
      <summary>
        <span>실행 기록</span>
        <small>{runHistory.runCount}회</small>
      </summary>
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
                {row.changeSummary && row.changeSummary !== "변화 없음"
                  ? ` · ${row.changeSummary}`
                  : ""}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </details>
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
