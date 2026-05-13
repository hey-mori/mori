import { Bot, Cloud, Database, Folder, Plug, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { useMoriSessionStore } from "../../app/sessionStore";
import type { QuickPassProviderKind } from "../../lib/analysis";
import { probeOllamaConnection } from "../../lib/analysis";

type ProbeState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; message: string; models: string[] }
  | { status: "error"; message: string };

export function SettingsView() {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const settings = useMoriSessionStore((state) => state.analysisSettings);
  const updateAnalysisSettings = useMoriSessionStore((state) => state.updateAnalysisSettings);
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

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
    <div className="page">
      <PageHeader title="Settings / Privacy / Local AI" subtitle="로컬 LLM, 저장소, 프라이버시, 테마를 설정합니다." />
      <div className="settings-grid">
        <section>
          <h2>Quick Pass / Local AI</h2>
          <p className="settings-help">
            Quick Pass는 가져온 세션 데이터를 이슈, 결정, 다음 액션으로 변환합니다. 기본 제공자는 결정론적
            로컬 휴리스틱이며, Ollama 같은 실제 로컬 LLM 제공자로 전환할 수 있습니다.
          </p>
          <div className="settings-row settings-stack">
            <span>Quick Pass 제공자</span>
            <div className="segmented" role="radiogroup" aria-label="Quick Pass provider">
              <button
                type="button"
                aria-pressed={settings.provider === "deterministic"}
                className={settings.provider === "deterministic" ? "active" : ""}
                onClick={() => updateAnalysisSettings({ provider: "deterministic" })}
              >
                Deterministic (local)
              </button>
              <button
                type="button"
                aria-pressed={settings.provider === "ollama"}
                className={settings.provider === "ollama" ? "active" : ""}
                onClick={() => updateAnalysisSettings({ provider: "ollama" })}
              >
                Ollama (local LLM)
              </button>
            </div>
          </div>
          <ProviderField
            label="Ollama endpoint"
            value={settings.ollamaEndpoint}
            disabled={settings.provider !== "ollama"}
            onChange={(value) => updateAnalysisSettings({ ollamaEndpoint: value })}
          />
          <ProviderField
            label="Ollama 모델"
            value={settings.ollamaModel}
            disabled={settings.provider !== "ollama"}
            onChange={(value) => updateAnalysisSettings({ ollamaModel: value })}
          />
          <ProviderField
            label="Ollama 타임아웃 (ms)"
            value={String(settings.ollamaTimeoutMs)}
            disabled={settings.provider !== "ollama"}
            onChange={(value) => updateAnalysisSettings({ ollamaTimeoutMs: parseTimeout(value, settings.ollamaTimeoutMs) })}
          />
          <div className="toggle-row">
            <span>Ollama 실패 시 결정론적 제공자로 폴백</span>
            <Toggle
              active={settings.fallbackToDeterministic}
              onClick={() => updateAnalysisSettings({ fallbackToDeterministic: !settings.fallbackToDeterministic })}
            />
          </div>
          <div className="settings-row settings-stack">
            <span>연결 상태</span>
            <div className="settings-probe">
              <Button icon={Plug} onClick={handleTest} disabled={settings.provider !== "ollama" || probe.status === "checking"}>
                {probe.status === "checking" ? "확인 중..." : "Ollama 연결 테스트"}
              </Button>
              <ProbeStatus probe={probe} />
            </div>
          </div>
        </section>
        <section>
          <h2>Local AI Engines (참고)</h2>
          <Provider title="Ollama" detail={`${settings.ollamaEndpoint} · ${settings.ollamaModel}`} active={settings.provider === "ollama"} icon={<Bot size={26} />} />
          <Provider title="LM Studio" detail="OpenAI-compatible local endpoint" icon={<Database size={26} />} />
          <Provider title="Cloud API" detail="explicit opt-in only" disabled icon={<Cloud size={26} />} />
        </section>
        <section>
          <h2>Privacy Defaults</h2>
          {["Summary Mode 기본값", "민감 앱 기본 차단", "Raw data retention 30일", "Cloud API 명시적 opt-in", "Incognito/browser private pages 차단"].map((item) => (
            <div className="toggle-row" key={item}><span>{item}</span><Toggle active /></div>
          ))}
        </section>
        <section>
          <h2>Storage / Export</h2>
          <div className="settings-row"><Folder size={18} /><span>~/Mori/Records</span><Badge tone="green">local</Badge></div>
          <div className="settings-row"><ShieldCheck size={18} /><span>.mori package save/open</span><Badge tone="purple">planned</Badge></div>
          <h2>Theme</h2>
          <div className="theme-options">
            <button className="selected" type="button">Formal</button>
            <button type="button">Forest</button>
            <button type="button">Night Lake</button>
          </div>
        </section>
      </div>
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
    <label className={`settings-field ${disabled ? "disabled" : ""}`}>
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

function ProbeStatus({ probe }: { probe: ProbeState }) {
  if (probe.status === "idle") return <span className="muted">아직 확인하지 않음</span>;
  if (probe.status === "checking") return <span className="muted">확인 중...</span>;
  if (probe.status === "ok") {
    return (
      <span className="tone-ok">
        <Badge tone="green">Reachable</Badge>
        {probe.message}
        {probe.models.length ? <small> · models: {probe.models.slice(0, 4).join(", ")}{probe.models.length > 4 ? "..." : ""}</small> : null}
      </span>
    );
  }
  return (
    <span className="tone-err">
      <Badge tone="red">Unreachable</Badge>
      {probe.message}
    </span>
  );
}

function Provider({ title, detail, icon, active, disabled }: { title: string; detail: string; icon: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <div className={`engine-card ${active ? "selected" : ""} ${disabled ? "muted-card" : ""}`}>
      {icon}
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <Badge tone={active ? "green" : disabled ? "gray" : "blue"}>{active ? "selected" : disabled ? "off" : "ready"}</Badge>
    </div>
  );
}

function parseTimeout(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export type { QuickPassProviderKind };
