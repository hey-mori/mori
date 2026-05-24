import { Bot, Cloud, Code2, Database, Plug, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriPlannedAction } from "../../components/ui/MoriPlannedAction";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { probeOllamaConnection } from "../../lib/analysis";
import type { QuickPassAnalysisSettings, QuickPassProviderKind } from "../../lib/analysis";
import { getProviderRows, type ProviderRow as ProviderRowModel } from "../../lib/settings/settingsStatus";
import {
  getProductAvailabilityDisplay,
  productAvailabilityFromFeatureStatus,
} from "../../lib/product-state/productState";
import {
  PreferenceToggle,
  SettingsRow,
  SettingsSection,
  StatusPill,
} from "./SettingsPrimitives";

const ICONS: Record<string, typeof Bot> = {
  deterministic: Sparkles,
  ollama: Bot,
  lmStudio: Database,
  openAiCompatible: Code2,
  cloudApi: Cloud,
};

type ProbeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; message: string; models: string[] }
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

  async function handleTest() {
    setProbe({ status: "checking" });
    const result = await probeOllamaConnection({
      endpoint: settings.ollamaEndpoint,
      timeoutMs: Math.min(settings.ollamaTimeoutMs, 5_000),
    });
    if (result.ok) {
      setProbe({ status: "ok", message: result.message, models: result.models ?? [] });
    } else {
      setProbe({ status: "error", message: result.message });
    }
  }

  return (
    <SettingsSection
      title="Local AI providers"
      eyebrow="Quick Pass"
      description="Choose what Quick Pass uses to turn imported evidence into issues, decisions, and next actions. Mori only sends data to a provider after you select and configure it."
    >

      <div className="settings-provider-grid">
        {rows.map((row) => {
          const Icon = ICONS[row.id] ?? Bot;
          const canSelect = row.status === "implemented";
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
              canSelect={canSelect}
              availabilityLabel={availability.label}
              availabilityTone={availability.tone}
              onSelect={() =>
                onProviderChange(row.id === "deterministic" ? "deterministic" : "ollama")
              }
              onTest={row.canTest ? handleTest : undefined}
              testBusy={probe.status === "checking"}
            />
          );
        })}
      </div>

      <div className="settings-row-list">
        <SettingsRow
          label="Ollama endpoint"
          description="Only used when Ollama is the selected provider."
          control={
            <ProviderField
              label="엔드포인트"
              value={settings.ollamaEndpoint}
              disabled={settings.provider !== "ollama"}
              onChange={(value) => onUpdateSettings({ ollamaEndpoint: value })}
            />
          }
        />
        <SettingsRow
          label="Model"
          description="The local model name Mori sends in the Ollama request."
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
          label="Timeout"
          description="Maximum wait time for a local Ollama response."
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
          label="Fallback to Quick Pass"
          description="If Ollama is unreachable, Mori can use the deterministic local provider instead."
          control={
            <PreferenceToggle
              label="Ollama 실패 시 자동 전환"
              active={settings.fallbackToDeterministic}
              onToggle={() =>
                onUpdateSettings({ fallbackToDeterministic: !settings.fallbackToDeterministic })
              }
            />
          }
        />
      </div>

      <ProbeRow probe={probe} />
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
  availabilityTone: Parameters<typeof MoriStatusBadge>[0]["tone"];
  onSelect: () => void;
  onTest?: () => void;
  testBusy: boolean;
}) {
  return (
    <article
      className={`settings-provider-card ${isCurrent ? "is-selected" : ""} ${row.status === "planned" ? "is-planned" : ""}`}
      aria-current={isCurrent ? "true" : undefined}
    >
      <header>
        <span className={`settings-provider-icon ${row.isLocal ? "is-local" : "is-cloud"}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <div>
          <strong>{row.label}</strong>
          <span>{row.description}</span>
        </div>
        <MoriStatusBadge tone={availabilityTone}>
          {availabilityLabel}
        </MoriStatusBadge>
      </header>
      <div className="settings-provider-meta">
        <StatusPill tone={row.isLocal ? "green" : "orange"}>
          {row.isLocal ? "Runs locally" : "External service"}
        </StatusPill>
        <span>{row.receivesData}</span>
        <span>{row.setupRequirement}</span>
      </div>
      <p className="settings-provider-privacy">{row.privacyNote}</p>
      <footer>
        {canSelect ? (
          <Button
            variant={isCurrent ? "primary" : "secondary"}
            onClick={onSelect}
            disabled={isCurrent}
            title={isCurrent ? "현재 선택된 제공자입니다." : "Quick Pass 제공자로 선택"}
          >
            {isCurrent ? "Selected" : "Select"}
          </Button>
        ) : (
          <MoriPlannedAction
            label="Planned"
            title="다음 마일스톤에서 활성화됩니다."
          />
        )}
        {onTest ? (
          <Button
            icon={Plug}
            onClick={onTest}
            disabled={testBusy}
            title="현재 입력된 Ollama 엔드포인트로 연결을 테스트합니다."
          >
            {testBusy ? "Testing..." : "Test"}
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function ProbeRow({ probe }: { probe: ProbeState }) {
  if (probe.status === "idle") return null;
  if (probe.status === "checking") {
    return (
      <div className="settings-probe-row">
        <Badge tone="purple">확인 중</Badge>
        <span>Ollama에 연결을 시도하고 있습니다...</span>
      </div>
    );
  }
  if (probe.status === "ok") {
    return (
      <div className="settings-probe-row tone-ok">
        <Badge tone="green">연결됨</Badge>
        <span>{probe.message}</span>
        {probe.models.length ? (
          <small>
            models: {probe.models.slice(0, 4).join(", ")}
            {probe.models.length > 4 ? "..." : ""}
          </small>
        ) : null}
      </div>
    );
  }
  return (
    <div className="settings-probe-row tone-err" role="alert">
      <Badge tone="red">연결 불가</Badge>
      <span>{probe.message}</span>
    </div>
  );
}

function ProviderField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`settings-provider-field ${disabled ? "is-disabled" : ""}`}>
      <span className="sr-only">{label}</span>
      <input
        type="text"
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
