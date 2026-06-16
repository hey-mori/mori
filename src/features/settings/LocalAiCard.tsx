import {
  Bot,
  Code2,
  FlaskConical,
  Plug,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { BaseSelect } from "../../components/ui/BaseSelect";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
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
import { getDefaultLlmFetch } from "../../lib/desktop/llmHttp";
import { SettingsSection } from "./SettingsPrimitives";

type EngineChoice = QuickPassProviderKind;
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

/**
 * The engine roster is ordered and worded to match the canonical analysis
 * vocabulary used on the Evidence screen: a no-model baseline first, then the
 * two model protocols. The subtitle states where each engine's data goes,
 * which is the real axis a user picks on. We deliberately do not split by
 * "local vs cloud" because an OpenAI-compatible endpoint can be either a local
 * server (LM Studio, llama.cpp) or a remote API.
 */
const ENGINE_OPTIONS: Array<{
  id: EngineChoice;
  label: string;
  detail: string;
  icon: LucideIcon;
}> = [
  {
    id: "deterministic",
    label: "규칙 기반",
    detail: "모델 없이 · 외부 전송 없음",
    icon: Sparkles,
  },
  {
    id: "ollama",
    label: "Ollama",
    detail: "기기에서 도는 로컬 LLM 런타임",
    icon: Bot,
  },
  {
    id: "openAiCompatible",
    label: "OpenAI 호환",
    detail: "OpenAI 호환 엔드포인트 · 로컬 또는 외부",
    icon: Code2,
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
  const providerKind = activeChoice;

  function selectEngine(choice: EngineChoice) {
    setProbe({ status: "idle" });
    setCapability({ status: "idle" });
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
          ...(getDefaultLlmFetch() ? { fetchImpl: getDefaultLlmFetch() } : {}),
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
        ...(getDefaultLlmFetch() ? { fetchImpl: getDefaultLlmFetch() } : {}),
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

  async function handleCapabilityTest() {
    if (providerKind === "deterministic") return;
    setCapability({ status: "running", kind: providerKind });
    const report = await checkQuickPassCapability(settings);
    setCapability({ status: "done", kind: providerKind, report });
  }

  return (
    <SettingsSection
      title="분석 엔진"
      action={
        <InfoHint label="분석 엔진 설명">
          <strong>규칙 기반</strong> · 네트워크 없이 기기에서 도는 휴리스틱. 빠르고 비공개이지만 요약은 단순합니다.
          <br />
          <strong>Ollama</strong> · 기기에서 도는 로컬 LLM 런타임. 비공개로 더 풍부하게 요약합니다.
          <br />
          <strong>OpenAI 호환</strong> · OpenAI 형식 API(로컬 또는 원격). 원격 주소면 자료가 외부로 전송될 수 있습니다.
        </InfoHint>
      }
    >
      <div className="settings-ai-layout">
        <div className="settings-ai-engine-grid" role="radiogroup" aria-label="분석 엔진">
          {ENGINE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = option.id === activeChoice;
            return (
              <button
                key={option.id}
                type="button"
                className={`settings-ai-engine-tile${selected ? " is-selected" : ""}`}
                role="radio"
                aria-checked={selected}
                onClick={() => selectEngine(option.id)}
              >
                <span className="settings-ai-engine-icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <span className="settings-ai-engine-body">
                  <strong>{option.label}</strong>
                </span>
                <span
                  className={`settings-ai-engine-mark${selected ? " is-selected" : ""}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {providerKind === "deterministic" ? null : (
          <EngineConfigPanel
            providerKind={providerKind}
            settings={settings}
            probe={probe}
            capability={capability}
            onProbe={() => handleProbe(providerKind)}
            onCapabilityTest={handleCapabilityTest}
            onUpdateSettings={onUpdateSettings}
          />
        )}

        <RecentRunsPanel runHistory={runHistory} />
      </div>
    </SettingsSection>
  );
}

function EngineConfigPanel({
  providerKind,
  settings,
  probe,
  capability,
  onProbe,
  onCapabilityTest,
  onUpdateSettings,
}: {
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
            placeholder="모델 이름"
            onChange={(value) => onUpdateSettings({ ollamaModel: value })}
            onRefresh={onProbe}
          />
        </div>
      ) : (
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
            placeholder="모델 이름"
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
              <strong>실패는 실패로 표시</strong>
              <small>규칙 기반은 직접 선택했을 때만 실행됩니다. AI 엔진 오류는 분석 실패로 남깁니다.</small>
            </span>
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
    const hint =
      provider === "ollama"
        ? "Ollama가 실행 중인지 확인한 뒤 다시 연결 확인을 눌러 주세요."
        : "Base URL과 서버 상태를 확인한 뒤 다시 연결 확인을 눌러 주세요.";
    return (
      <StatusLine tone="err" alert text={`연결할 수 없습니다 · ${probe.message}`} hint={hint} />
    );
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
              : "모델을 감지하지 못했습니다"}
        </small>
        {hasModels ? (
          <button
            type="button"
            className="settings-ai-model-toggle"
            onClick={() => setManual((current) => !current)}
          >
            {manual ? "목록에서 선택" : "수동 입력"}
          </button>
        ) : null}
      </div>
    </label>
  );
}

function runStatsLabel(row: AnalysisRunHistoryViewModel["rows"][number]): string {
  const base = `이슈 ${row.reason.elementCounts.issues}개 · 결정 ${row.reason.elementCounts.decisions}개 · ${row.durationMs}ms`;
  return row.changeSummary && row.changeSummary !== "변경 없음"
    ? `${base} · ${row.changeSummary}`
    : base;
}

/**
 * Older runs were stamped with the legacy "Quick Pass" wording before the
 * engines were renamed to "분석". Normalise it at display so the history reads
 * consistently with the current labels without rewriting stored records.
 */
function cleanProviderLabel(label: string): string {
  return label.replace(/\s*Quick Pass/gi, " 분석").replace(/\s{2,}/g, " ").trim();
}

function RecentRunsPanel({ runHistory }: { runHistory: AnalysisRunHistoryViewModel | null }) {
  const rows = runHistory?.rows ?? [];

  return (
    <section className="settings-ai-runs" aria-label="최근 실행">
      <header className="settings-ai-runs-head">
        <h4>최근 실행</h4>
      </header>
      {rows.length > 0 ? (
        <ul className="settings-ai-runs-grid base-scroll">
          {rows.map((row) => (
            <li key={row.runId} className="settings-ai-run-item">
              <div className="settings-ai-run-item-top">
                <strong>{cleanProviderLabel(row.providerLabel)}</strong>
                <small>{formatRelativeKo(row.generatedAt)}</small>
              </div>
              <p>{runStatsLabel(row)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-ai-runs-empty">아직 분석을 실행한 기록이 없습니다.</p>
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

function inferEngineChoice(settings: QuickPassAnalysisSettings): EngineChoice {
  return settings.provider;
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
