import { Bot, Cloud, Code2, Database, Plug, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { Toggle } from "../../components/ui/Toggle";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { probeOllamaConnection } from "../../lib/analysis";
import type { QuickPassAnalysisSettings, QuickPassProviderKind } from "../../lib/analysis";
import { getProviderRows } from "../../lib/settings/settingsStatus";
import {
  getProductAvailabilityDisplay,
  productAvailabilityFromFeatureStatus,
} from "../../lib/product-state/productState";

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
    <section className="settings-card" aria-label="Local AI providers">
      <header className="settings-card-head">
        <div>
          <h3>로컬 AI / Analysis Provider</h3>
          <p>
            Quick Pass는 가져온 세션 데이터를 이슈 · 결정 · 다음 액션으로 변환합니다. 기본 제공자는 deterministic 로컬
            휴리스틱이며, 직접 입력한 endpoint를 통해 Ollama 등 로컬 LLM으로 전환할 수 있습니다.
          </p>
        </div>
      </header>

      <div className="settings-provider-grid">
        {rows.map((row) => {
          const Icon = ICONS[row.id] ?? Bot;
          const canSelect = row.status === "implemented";
          const isCurrent = row.selected;
          const availability = getProductAvailabilityDisplay(
            productAvailabilityFromFeatureStatus(row.status),
          );
          return (
            <article
              key={row.id}
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
                <MoriStatusBadge tone={availability.tone}>
                  {availability.label}
                </MoriStatusBadge>
              </header>
              <dl>
                <div>
                  <dt>위치</dt>
                  <dd>{row.isLocal ? "Local" : "Cloud"}</dd>
                </div>
                <div>
                  <dt>받는 데이터</dt>
                  <dd>{row.receivesData}</dd>
                </div>
                <div>
                  <dt>설정 필요</dt>
                  <dd>{row.setupRequirement}</dd>
                </div>
              </dl>
              <p className="settings-provider-privacy">{row.privacyNote}</p>
              <footer>
                {canSelect ? (
                  <Button
                    variant={isCurrent ? "primary" : "secondary"}
                    onClick={() =>
                      onProviderChange(row.id === "deterministic" ? "deterministic" : "ollama")
                    }
                    disabled={isCurrent}
                    title={isCurrent ? "현재 선택된 제공자입니다." : "Quick Pass 제공자로 선택"}
                  >
                    {isCurrent ? "선택됨" : "선택하기"}
                  </Button>
                ) : (
                  <Button disabled title="다음 마일스톤에서 활성화됩니다.">
                    Planned
                  </Button>
                )}
                {row.canTest ? (
                  <Button
                    icon={Plug}
                    onClick={handleTest}
                    disabled={probe.status === "checking"}
                    title="현재 입력된 Ollama 엔드포인트로 연결을 테스트합니다."
                  >
                    {probe.status === "checking" ? "확인 중..." : "연결 테스트"}
                  </Button>
                ) : null}
              </footer>
            </article>
          );
        })}
      </div>

      <SectionHeader title="Ollama 세부 설정" hint="endpoint / model / timeout" />
      <div className="settings-provider-config">
        <ProviderField
          label="Endpoint"
          value={settings.ollamaEndpoint}
          disabled={settings.provider !== "ollama"}
          onChange={(value) => onUpdateSettings({ ollamaEndpoint: value })}
        />
        <ProviderField
          label="Model"
          value={settings.ollamaModel}
          disabled={settings.provider !== "ollama"}
          onChange={(value) => onUpdateSettings({ ollamaModel: value })}
        />
        <ProviderField
          label="Timeout (ms)"
          value={String(settings.ollamaTimeoutMs)}
          disabled={settings.provider !== "ollama"}
          onChange={(value) =>
            onUpdateSettings({ ollamaTimeoutMs: parseTimeout(value, settings.ollamaTimeoutMs) })
          }
        />
        <label className="settings-provider-fallback">
          <span>
            <strong>Ollama 실패 시 fallback</strong>
            <small>네트워크 오류 등으로 Ollama가 응답하지 않으면 deterministic 제공자가 대신 분석합니다.</small>
          </span>
          <Toggle
            active={settings.fallbackToDeterministic}
            onClick={() =>
              onUpdateSettings({ fallbackToDeterministic: !settings.fallbackToDeterministic })
            }
          />
        </label>
      </div>

      <ProbeRow probe={probe} />
    </section>
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
        <Badge tone="green">Reachable</Badge>
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
      <Badge tone="red">Unreachable</Badge>
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
      <span>{label}</span>
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
