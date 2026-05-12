import { Bot, Check, Cloud, Database, FileCode2, Lock, Play, Plus, ShieldCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { sourceOptions } from "../../domain/mock-data";
import { recordingModeLabels } from "../../domain/constants";
import { createSessionDraft } from "../../lib/session/createSessionDraft";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import type { StoredSessionDraft } from "../../lib/storage/storageTypes";

export function StartSessionView() {
  const [sessionTitle, setSessionTitle] = useState("Mori 앱 기획");
  const [projectName, setProjectName] = useState("Mori Product");
  const [savedDraft, setSavedDraft] = useState<StoredSessionDraft | null>(null);
  const repository = useMemo(() => createBrowserDraftRepository(), []);

  useEffect(() => {
    setSavedDraft(repository.loadCurrentSessionDraft());
  }, [repository]);

  function handleStartSession() {
    const draft = createSessionDraft({
      sessionTitle,
      projectName,
      selectedSources: sourceOptions,
      recordingMode: "summary",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      storageLocation: "~/Mori/Records",
    });
    setSavedDraft(repository.saveCurrentSessionDraft(draft));
  }

  return (
    <div className="page">
      <PageHeader title="Start Mori / Session Setup" subtitle="기록할 범위와 방식을 설정하고 Mori 세션을 시작합니다." right={<Button icon={X} />} />
      <div className="setup-grid">
        <div className="setup-stack">
          <SetupBlock number="1" title="세션 정보">
            <div className="form-row">
              <label>세션 이름<input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} /></label>
              <label>프로젝트<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
              <Button icon={Plus}>새 프로젝트</Button>
            </div>
          </SetupBlock>
          <SetupBlock number="2" title="기록할 앱 / 소스 선택" note="선택한 앱과 소스의 활동만 기록합니다. Mori는 전체 컴퓨터를 감시하지 않습니다.">
            <div className="source-grid">
              {sourceOptions.map((source) => {
                const Icon = source.icon;
                return (
                  <button className={`source-card ${source.selected ? "selected" : ""} ${source.enabled ? "" : "disabled"}`} key={source.id} type="button">
                    <Icon size={28} />
                    <div>
                      <strong>{source.name}</strong>
                      <span><i />{source.detail}</span>
                    </div>
                    {source.selected ? <Check size={17} /> : <span className="checkbox" />}
                  </button>
                );
              })}
            </div>
            <div className="privacy-note">
              <ShieldCheck size={16} />
              Summary Mode에서는 원본을 오래 보관하지 않고 요약/이슈/결정/타임라인 중심으로 저장합니다.
              <b>자세히 보기</b>
            </div>
          </SetupBlock>
          <SetupBlock number="3" title="기록 모드 선택">
            <div className="mode-grid">
              <ModeCard title={recordingModeLabels.summary} selected points={["AI 대화 요약", "주요 결정 / 이슈 / 산출물 중심", "저장 공간 절약"]} />
              <ModeCard title={recordingModeLabels.full} points={["전체 대화 및 원본 보관", "감사/상세 추적에 적합", "더 많은 저장 공간 사용"]} />
              <ModeCard title={recordingModeLabels.ephemeral} points={["리포트만 저장", "원본 데이터 자동 삭제", "민감 프로젝트에 적합"]} />
            </div>
          </SetupBlock>
          <SetupBlock number="4" title="로컬 AI 엔진 선택" note="요약 및 분석을 수행할 로컬/상용 엔진을 선택합니다. Cloud API는 명시적으로 켜야 합니다.">
            <div className="engine-grid">
              <EngineCard title="Ollama" detail="llama3.1:8b" active icon={Bot} />
              <EngineCard title="LM Studio" detail="local-model (8B)" icon={Database} />
              <EngineCard title="OpenAI Compatible" detail="http://localhost:1234" icon={FileCode2} />
              <EngineCard title="Cloud API" detail="API key required" icon={Cloud} muted />
            </div>
          </SetupBlock>
          <div className="setup-actions">
            <Button variant="primary" icon={Play} onClick={handleStartSession}>Mori 세션 시작</Button>
            <Button>취소</Button>
          </div>
        </div>
        <SessionSummary savedDraft={savedDraft} sessionTitle={sessionTitle} projectName={projectName} />
      </div>
    </div>
  );
}

function SetupBlock({ number, title, note, children }: { number: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="setup-block">
      <header>
        <span>{number}</span>
        <div>
          <h2>{title}</h2>
          {note ? <p>{note}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function ModeCard({ title, points, selected = false }: { title: string; points: string[]; selected?: boolean }) {
  return (
    <button className={`mode-card ${selected ? "selected" : ""}`} type="button">
      <span className="radio" />
      <strong>{title}</strong>
      <small>{selected ? "기본 추천 모드입니다." : "프로젝트 성격에 따라 선택하세요."}</small>
      <ul>
        {points.map((point) => <li key={point}>{point}</li>)}
      </ul>
    </button>
  );
}

function EngineCard({ title, detail, icon: Icon, active, muted }: { title: string; detail: string; icon: LucideIcon; active?: boolean; muted?: boolean }) {
  return (
    <button className={`engine-card ${active ? "selected" : ""} ${muted ? "muted-card" : ""}`} type="button">
      <Icon size={26} />
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <Badge tone={muted ? "gray" : "green"}>{muted ? "비활성" : active ? "실행 중" : "연결됨"}</Badge>
    </button>
  );
}

function SessionSummary({ savedDraft, sessionTitle, projectName }: { savedDraft: StoredSessionDraft | null; sessionTitle: string; projectName: string }) {
  return (
    <aside className="summary-panel">
      <h2>세션 요약</h2>
      <SummaryRow label="세션 이름" value={sessionTitle || "Untitled Mori Session"} />
      <SummaryRow label="프로젝트" value={projectName || "Untitled Project"} />
      <hr />
      <SummaryRow label="기록할 소스" value="9개 선택됨" />
      <ul className="summary-source-list">
        {sourceOptions.filter((source) => source.selected).slice(0, 8).map((source) => <li key={source.id}>{source.name}</li>)}
        <li>외 1개</li>
      </ul>
      <hr />
      <SummaryRow label="기록 모드" value="Summary Mode" accent />
      <SummaryRow label="AI 엔진" value="Ollama (llama3.1:8b)" accent />
      <SummaryRow label="저장 위치" value="~/Mori/Records" />
      <SummaryRow label="예상 저장 공간" value="하루 약 50MB ~ 200MB" />
      <SummaryRow label="민감 앱" value="기본 차단" />
      <div className="draft-status-panel">
        <strong>{savedDraft ? "Session draft saved" : "Session draft not saved yet"}</strong>
        <span>Storage adapter: browser localStorage</span>
        <span>Package version: .mori v0.1.0 JSON-ready</span>
        {savedDraft ? (
          <>
            <span>Current session: {savedDraft.session.id}</span>
            <span>Saved at: {new Date(savedDraft.savedAt).toLocaleString()}</span>
          </>
        ) : null}
      </div>
      <div className="local-first-note">
        <Lock size={18} />
        <strong>모든 데이터는 로컬에 안전하게 저장됩니다.</strong>
        <p>Cloud API는 사용자가 명시적으로 켤 때만 사용합니다. 사용자는 언제든 원본과 요약 데이터를 삭제할 수 있습니다.</p>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="summary-row">
      <span />
      <span>{label}</span>
      <b className={accent ? "accent" : ""}>{value}</b>
    </div>
  );
}
