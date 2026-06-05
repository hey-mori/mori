import {
  Bot,
  Cloud,
  Code2,
  Database,
  FlaskConical,
  Plug,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
    summary: "모델 없이 기기에서 즉시 정리",
  },
  ollama: {
    label: "Ollama",
    summary: "로컬 LLM으로 더 깊게 분석",
  },
  openAiCompatible: {
    label: "OpenAI 호환",
    summary: "LM Studio·vLLM 등 호환 API 연결",
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

type ModelOption = { value: string; label: string };

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
  const rows = getProviderRows(settings);
  const selectableRows = rows.filter((row): row is ProviderRowModel & { id: QuickPassProviderKind } =>
    row.status === "implemented" &&
    (row.id === "deterministic" || row.id === "ollama" || row.id === "openAiCompatible"),
  );
  const plannedRows = rows.filter((row) => row.status !== "implemented");
  const activeRow = selectableRows.find((row) => row.id === settings.provider) ?? selectableRows[0];
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const [capability, setCapability] = useState<CapabilityState>({ status: "idle" });

  function selectProvider(kind: QuickPassProviderKind) {
    onProviderChange(kind);
    setProbe({ status: "idle" });
    setCapability({ status: "idle" });
  }

  const handleProbe = useCallback(
    async (kind: QuickPassProviderKind) => {
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
      settings.openAiBaseUrl,
      settings.openAiApiKey,
      settings.openAiTimeoutMs,
      settings.ollamaEndpoint,
      settings.ollamaTimeoutMs,
    ],
  );

  // Auto-detect installed models for endpoint-backed engines so the user picks
  // from a list instead of typing a model name blind. Debounced so editing the
  // endpoint does not fire a request on every keystroke.
  useEffect(() => {
    if (settings.provider === "deterministic") return;
    const handle = setTimeout(() => {
      void handleProbe(settings.provider);
    }, 600);
    return () => clearTimeout(handle);
  }, [settings.provider, handleProbe]);

  async function handleCapabilityTest(kind: QuickPassProviderKind) {
    if (kind === "deterministic") return;
    setCapability({ status: "running", kind });
    const report = await checkQuickPassCapability(settings);
    setCapability({ status: "done", kind, report });
  }

  return (
    <SettingsSection title="분석 엔진">
      {/* 설정 영역 — 엔진 선택과 연결 설정. 선택 타일은 '세션 추가' 흐름의
          pick-tile 스타일을 그대로 재사용해 앱 전체에서 일관되게 보입니다. */}
      <div className="settings-ai-layout">
        <div className="pick-grid" role="radiogroup" aria-label="분석 엔진">
          {selectableRows.map((row) => (
            <ProviderTile
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
          probe={probe}
          capability={capability}
          onProbe={() => handleProbe(settings.provider)}
          onCapabilityTest={() => handleCapabilityTest(settings.provider)}
          onUpdateSettings={onUpdateSettings}
        />
      </div>

      {/* 정보 영역 — 최근 실행 이력 */}
      <RecentRunsPanel runHistory={runHistory} />

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

function ProviderTile({
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
      className={`pick-tile${selected ? " is-selected" : ""}`}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className="pick-tile-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="pick-tile-body">
        <strong>{copy.label}</strong>
        <span>{copy.summary}</span>
      </span>
      <span className={`pick-mark${selected ? " is-selected" : ""}`} aria-hidden="true" />
    </button>
  );
}

function EngineConfigPanel({
  row,
  settings,
  probe,
  capability,
  onProbe,
  onCapabilityTest,
  onUpdateSettings,
}: {
  row?: ProviderRowModel & { id: QuickPassProviderKind };
  settings: QuickPassAnalysisSettings;
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
  const detected = probe.status === "ok" && probe.kind === row.id ? probe : null;
  const detectedModels: ModelOption[] = detected
    ? detected.modelInfo && detected.modelInfo.length
      ? detected.modelInfo.map((info) => ({ value: info.name, label: formatModelLabel(info) }))
      : detected.models.map((name) => ({ value: name, label: name }))
    : [];

  if (row.id === "deterministic") {
    return (
      <section className="settings-ai-config-panel" aria-label={`${copy.label} 설정`}>
        <div className="settings-ai-empty-config">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>추가 설정 없이 이 기기 안에서 실행됩니다.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-ai-config-panel" aria-label={`${copy.label} 설정`}>
      {row.id === "ollama" ? (
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
      ) : null}

      {row.id === "openAiCompatible" ? (
        <div className="settings-ai-field-grid">
          <ProviderField
            label="엔드포인트"
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
            label="API 키"
            value={settings.openAiApiKey}
            type="password"
            placeholder="필요한 경우만"
            onChange={(value) => onUpdateSettings({ openAiApiKey: value })}
          />
        </div>
      ) : null}

      {canTest ? (
        <div className="settings-ai-verify">
          <div className="settings-ai-actions">
            <Button icon={Plug} variant="secondary" size="sm" onClick={onProbe} disabled={probing}>
              {probing ? "확인 중…" : "연결 확인"}
            </Button>
            <Button
              icon={FlaskConical}
              variant="secondary"
              size="sm"
              onClick={onCapabilityTest}
              disabled={testing}
            >
              {testing ? "테스트 중…" : "응답 테스트"}
            </Button>
          </div>
          <EngineStatus provider={row.id} probe={probe} capability={capability} />
        </div>
      ) : null}

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

/** One calm status line: a colored dot + text, with an optional muted hint
 *  below. Replaces the heavy tinted result boxes. */
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

/**
 * Unified connection + response status. A successful connection is already
 * shown by the populated model dropdown, so only the in-progress, failed, and
 * response-test states surface here — one consistent line, never a stack of
 * loud colored boxes.
 */
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
    return <StatusLine tone="idle" text="엔드포인트에 연결하는 중…" />;
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
        text="연결됐지만 설치된 모델이 없습니다."
        hint="먼저 모델을 내려받은 뒤 다시 확인하세요."
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
    return <StatusLine tone="idle" text="응답을 확인하는 중…" />;
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

/**
 * Model field with installed-model autodetect. When the endpoint reports models
 * the field is a dropdown of those models; a "직접 입력" toggle falls back to a
 * free-text input, and the refresh button re-probes the endpoint.
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
  models: ModelOption[];
  detecting: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const [manual, setManual] = useState(false);
  const hasModels = models.length > 0;
  const valueInList = models.some((model) => model.value === value);
  const useSelect = hasModels && !manual;
  return (
    <label className="settings-ai-field settings-ai-model-field">
      <span>{label}</span>
      <div className="settings-ai-model-input">
        {useSelect ? (
          <select value={valueInList ? value : ""} onChange={(event) => onChange(event.target.value)}>
            {valueInList ? null : (
              <option value="" disabled>
                모델 선택…
              </option>
            )}
            {models.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
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
            ? "설치된 모델 감지 중…"
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
                  {row.changeSummary && row.changeSummary !== "변화 없음"
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

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** "gemma2:9b · 9.2B" or "llama3.1 · 4.7GB" — parameter count preferred. */
function formatModelLabel(info: OllamaModelInfo): string {
  const detail = info.parameterSize ?? (info.sizeBytes ? formatBytes(info.sizeBytes) : "");
  return detail ? `${info.name} · ${detail}` : info.name;
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
