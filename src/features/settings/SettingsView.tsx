import { Bot, Cloud, Database, Folder, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Toggle } from "../../components/ui/Toggle";

export function SettingsView() {
  return (
    <div className="page">
      <PageHeader title="Settings / Privacy / Local AI" subtitle="로컬 LLM, 저장소, 프라이버시, 테마를 설정합니다." />
      <div className="settings-grid">
        <section>
          <h2>Local AI</h2>
          <Provider title="Ollama" detail="llama3.1:8b · localhost:11434" active icon={<Bot size={26} />} />
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

function Provider({ title, detail, icon, active, disabled }: { title: string; detail: string; icon: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <div className={`engine-card ${active ? "selected" : ""} ${disabled ? "muted-card" : ""}`}>
      {icon}
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <Badge tone={active ? "green" : disabled ? "gray" : "blue"}>{active ? "running" : disabled ? "off" : "ready"}</Badge>
    </div>
  );
}
