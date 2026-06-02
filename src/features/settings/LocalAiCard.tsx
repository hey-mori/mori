import { Bot, Cloud, Code2, Database, Plug, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { BasePlannedAction } from "../../components/ui/BasePlannedAction";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { probeOllamaConnection, probeOpenAiCompatibleConnection } from "../../lib/analysis";
import type { QuickPassAnalysisSettings, QuickPassProviderKind } from "../../lib/analysis";
import { getProviderRows, type ProviderRow as ProviderRowModel } from "../../lib/settings/settingsStatus";
import {
  getProductAvailabilityDisplay,
  productAvailabilityFromFeatureStatus,
} from "../../lib/product-state/productState";
import {
  PreferenceToggle,
  SettingsNotice,
  SettingsOptionGroup,
  SettingsProviderOption,
  SettingsRow,
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

type ProbeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; message: string; models: string[]; kind: QuickPassProviderKind }
  | { status: "error"; message: string };

export function LocalAiCard({
  settings,
  onProviderChange,
  onUpdateSettings,
}: {
  settings: QuickPassAnalysisSettings;
  onProviderChange: (kind: QuickPassProviderKind) => void;
  onUpdateSettings: (patch: Partial<QuickPassAnalysisSettings>) => void;
}) {
  const rows = getProviderRows(settings);
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

  async function handleTest(kind: QuickPassProviderKind) {
    setProbe({ status: "checking" });
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
      setProbe({ status: "error", message: result.message });
    }
  }

  const selectableRows = rows.filter((row) => row.status === "implemented");
  const plannedRows = rows.filter((row) => row.status !== "implemented");

  return (
    <SettingsSection
      title="AI 제공자"
      description="Quick Pass가 가져온 자료를 이슈, 결정, 다음 행동으로 정리할 때 사용할 제공자입니다."
    >
      <SettingsOptionGroup label="Quick Pass 제공자" columns="single">
        {selectableRows.map((row) => {
          const Icon = ICONS[row.id] ?? Bot;
          const isCurrent = row.selected;
          const availability = getProductAvailabilityDisplay(
            productAvailabilityFromFeatureStatus(row.status),
          );
          return (
            <ProviderOption
              key={row.id}
              row={row}
              icon={Icon}
              isCurrent={isCurrent}
              canSelect
              availabilityLabel={availability.label}
              availabilityTone={availability.tone}
              onSelect={() => onProviderChange(row.id as QuickPassProviderKind)}
              onTest={row.canTest ? () => handleTest(row.id as QuickPassProviderKind) : undefined}
              testBusy={probe.status === "checking"}
            />
          );
        })}
      </SettingsOptionGroup>

      {plannedRows.length > 0 ? (
        <details className="settings-planned-disclosure">
          <summary>
            <span>예정 제공자 {plannedRows.length}개</span>
            <small>구현 전까지 선택할 수 없고, 외부로 데이터를 보내지 않습니다.</small>
          </summary>
          <ul className="settings-planned-list">
            {plannedRows.map((row) => {
              const Icon = ICONS[row.id] ?? Bot;
              return (
                <li key={row.id}>
                  <span className="settings-planned-icon" aria-hidden="true">
                    <Icon size={14} />
                  </span>
                  <div className="settings-planned-text">
                    <strong>{row.label}</strong>
                    <small>{row.description}</small>
                  </div>
                  <StatusPill tone={row.isLocal ? "green" : "orange"}>
                    {row.isLocal ? "로컬" : "외부"}
                  </StatusPill>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      <div className="settings-row-list">
        <SettingsRow
          label="Ollama endpoint"
          description="Ollama 제공자를 선택한 경우에만 사용됩니다."
          control={
            <ProviderField
              label="Ollama endpoint"
              value={settings.ollamaEndpoint}
              disabled={settings.provider !== "ollama"}
              onChange={(value) => onUpdateSettings({ ollamaEndpoint: value })}
            />
          }
        />
        <SettingsRow
          label="모델"
          description="Ollama 요청에 전달할 로컬 모델 이름입니다."
          control={
            <ProviderField
              label="모델"
              value={settings.ollamaModel}
              disabled={settings.provider !== "ollama"}
              onChange={(value) => onUpdateSettings({ ollamaModel: value })}
            />
          }
        />
        <SettingsRow
          label="OpenAI 호환 base URL"
          description="/v1까지 포함한 base URL입니다. 예: http://localhost:1234/v1 또는 https://api.openai.com/v1"
          control={
            <ProviderField
              label="OpenAI 호환 base URL"
              value={settings.openAiBaseUrl}
              disabled={settings.provider !== "openAiCompatible"}
              onChange={(value) => onUpdateSettings({ openAiBaseUrl: value })}
            />
          }
        />
        <SettingsRow
          label="OpenAI 호환 모델"
          description="chat/completions 요청에 전달할 모델 이름입니다."
          control={
            <ProviderField
              label="OpenAI 호환 모델"
              value={settings.openAiModel}
              disabled={settings.provider !== "openAiCompatible"}
              onChange={(value) => onUpdateSettings({ openAiModel: value })}
            />
          }
        />
        <SettingsRow
          label="API key"
          description="필요한 엔드포인트에서만 사용합니다. 이 기기의 Quick Pass 설정에 저장됩니다."
          control={
            <ProviderField
              label="API key"
              value={settings.openAiApiKey}
              disabled={settings.provider !== "openAiCompatible"}
              type="password"
              onChange={(value) => onUpdateSettings({ openAiApiKey: value })}
            />
          }
        />
        <SettingsRow
          label="OpenAI 호환 타임아웃"
          description="OpenAI 호환 응답을 기다리는 최대 시간(ms)입니다."
          control={
            <ProviderField
              label="OpenAI 호환 타임아웃"
              value={String(settings.openAiTimeoutMs)}
              disabled={settings.provider !== "openAiCompatible"}
              onChange={(value) =>
                onUpdateSettings({ openAiTimeoutMs: parseTimeout(value, settings.openAiTimeoutMs) })
              }
            />
          }
        />
        <SettingsRow
          label="타임아웃"
          description="로컬 Ollama 응답을 기다리는 최대 시간(ms)입니다."
          control={
            <ProviderField
              label="타임아웃"
              value={String(settings.ollamaTimeoutMs)}
              disabled={settings.provider !== "ollama"}
              onChange={(value) =>
                onUpdateSettings({ ollamaTimeoutMs: parseTimeout(value, settings.ollamaTimeoutMs) })
              }
            />
          }
        />
        <SettingsRow
          label="Quick Pass로 fallback"
          description="LLM 제공자가 닿지 않으면 결정론적 로컬 제공자로 전환합니다."
          control={
            <PreferenceToggle
              label="LLM 실패 시 자동 전환"
              active={settings.fallbackToDeterministic}
              onToggle={() =>
                onUpdateSettings({ fallbackToDeterministic: !settings.fallbackToDeterministic })
              }
            />
          }
        />
      </div>

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
      <SettingsNotice icon={Cloud} title="외부 제공자">
        OpenAI 호환 base URL에 Cloud API 주소를 입력하면 Quick Pass 실행 시 현재 세션의 이벤트와 소스 요약이 해당 외부 API로 전송됩니다. 결정론적 / Ollama 제공자는 외부 Cloud API를 호출하지 않습니다.
      </SettingsNotice>
    </SettingsSection>
  );
}

function ProviderOption({
  row,
  icon: Icon,
  isCurrent,
  canSelect,
  availabilityLabel,
  availabilityTone,
  onSelect,
  onTest,
  testBusy,
}: {
  row: ProviderRowModel;
  icon: typeof Bot;
  isCurrent: boolean;
  canSelect: boolean;
  availabilityLabel: string;
  availabilityTone: Parameters<typeof BaseStatusBadge>[0]["tone"];
  onSelect: () => void;
  onTest?: () => void;
  testBusy: boolean;
}) {
  const status = (
    <BaseStatusBadge tone={availabilityTone}>
      {availabilityLabel}
    </BaseStatusBadge>
  );
  const actions = canSelect ? (
    <>
      <Button
        variant={isCurrent ? "primary" : "secondary"}
        onClick={onSelect}
        disabled={isCurrent}
        title={isCurrent ? "현재 선택된 제공자입니다." : "Quick Pass 제공자로 선택"}
      >
        {isCurrent ? "선택됨" : "선택"}
      </Button>
      {onTest ? (
        <Button
          icon={Plug}
          onClick={onTest}
          disabled={testBusy}
          title="현재 입력된 endpoint로 연결을 테스트합니다."
        >
          {testBusy ? "테스트 중" : "테스트"}
        </Button>
      ) : null}
    </>
  ) : (
    <BasePlannedAction
      label="예정"
      title="다음 마일스톤에서 활성화됩니다."
    />
  );

  return (
    <SettingsProviderOption
      selected={isCurrent}
      planned={!canSelect}
      icon={Icon}
      label={row.label}
      description={`${row.description} ${row.privacyNote}`}
      locality={
        <StatusPill tone={row.isLocal ? "green" : "orange"}>
          {row.isLocal ? "로컬" : "외부"}
        </StatusPill>
      }
      dataNotice={row.receivesData}
      setup={row.setupRequirement}
      status={status}
      actions={actions}
    />
  );
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
        <span>Ollama에 연결을 시도하고 있습니다...</span>
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
                title="이 모델을 사용합니다"
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
  disabled,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  type?: "text" | "password";
  onChange: (value: string) => void;
}) {
  return (
    <label className={`settings-provider-field ${disabled ? "is-disabled" : ""}`}>
      <span className="sr-only">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
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
