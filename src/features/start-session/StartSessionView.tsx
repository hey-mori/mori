import { Bot, Check, Cloud, Database, FileCode2, Info, Lock, Play, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { sourceOptions } from "../../domain/mock-data";
import { recordingModeLabels } from "../../domain/constants";
import { createSessionDraft } from "../../lib/session/createSessionDraft";
import {
  describeRetentionFootprint,
  describeSessionStorageTarget,
  type SessionStorageTarget,
} from "../../lib/session/sessionStorageTarget";
import { isTauriRuntime } from "../../lib/desktop";
import { formatDateTime } from "../../lib/formatting/time";
import {
  applySourceSelection,
  initialSelectedSourceIds,
  toggleSourceSelection,
} from "../../lib/session/sourceSelection";
import {
  buildStartSessionEngineOptions,
  coerceStartSessionEngineProvider,
  getDefaultStartSessionEngineOption,
  type StartSessionEngineOption,
} from "../../lib/session/startSessionEngineOptions";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import {
  getImplementedCaptureSurfaces,
  getPlannedCaptureSurfaces,
} from "../../lib/connectors/captureSurfaces";
import type { StoredSessionDraft } from "../../lib/storage/storageTypes";
import type { LlmProvider, RecordingMode, SourceOption } from "../../domain/types";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";

const availableSources = sourceOptions.filter((source) => source.status === "available");
const plannedSources = sourceOptions.filter((source) => source.status === "planned");

const RECORDING_MODES: { mode: RecordingMode; points: string[] }[] = [
  { mode: "summary", points: ["AI 대화 요약", "주요 결정 / 이슈 / 산출물 중심", "저장 공간 절약"] },
  { mode: "full", points: ["전체 대화 및 원본 보관", "감사/상세 추적에 적합", "더 많은 저장 공간 사용"] },
  { mode: "ephemeral", points: ["리포트만 저장", "원본 데이터 자동 삭제", "민감 프로젝트에 적합"] },
];

const ENGINE_OPTIONS = buildStartSessionEngineOptions();

const ENGINE_ICONS: Record<LlmProvider, LucideIcon> = {
  ollama: Bot,
  lmStudio: Database,
  openAiCompatible: FileCode2,
  cloudApi: Cloud,
};

export function StartSessionView() {
  const [sessionTitle, setSessionTitle] = useState("Mori 앱 기획");
  const [projectName, setProjectName] = useState("Mori Product");
  const [savedDraft, setSavedDraft] = useState<StoredSessionDraft | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() =>
    initialSelectedSourceIds(sourceOptions),
  );
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("summary");
  const [engineProvider, setEngineProvider] = useState<LlmProvider>(
    () => getDefaultStartSessionEngineOption().provider,
  );
  const selectedEngine =
    ENGINE_OPTIONS.find(
      (engine) => engine.provider === coerceStartSessionEngineProvider(engineProvider),
    ) ?? getDefaultStartSessionEngineOption();
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const storageTarget = useMemo<SessionStorageTarget>(
    () => describeSessionStorageTarget({ isDesktop: isTauriRuntime() }),
    [],
  );
  const setSessionDraft = useMoriSessionStore((state) => state.setDraft);
  const resetSessionToDemo = useMoriSessionStore((state) => state.resetToDemo);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  useEffect(() => {
    setSavedDraft(repository.loadCurrentSessionDraft());
  }, [repository]);

  const selectedSources = useMemo(
    () =>
      applySourceSelection(sourceOptions, selectedSourceIds).filter(
        (source) => source.selected,
      ),
    [selectedSourceIds],
  );

  function handleStartSession() {
    const draft = createSessionDraft({
      sessionTitle,
      projectName,
      selectedSources: applySourceSelection(sourceOptions, selectedSourceIds),
      recordingMode,
      llmProvider: selectedEngine.provider,
      llmModel: selectedEngine.model,
      storageLocation: storageTarget.location,
    });
    const stored = repository.saveCurrentSessionDraft(draft);
    setSavedDraft(stored);
    setSessionDraft(stored);
    setCurrentView("evidence");
  }

  function handleResetToDemo() {
    resetSessionToDemo();
    setSavedDraft(null);
  }

  return (
    <div className="page">
      <PageHeader title="Start Session" subtitle="기록 범위를 설정하고 새 작업 메모리 세션을 시작합니다." />
      <div className="setup-grid">
        <div className="setup-stack">
          <SetupBlock number="1" title="세션 정보">
            <div className="form-row">
              <label>세션 이름<input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} /></label>
              <label>프로젝트<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
            </div>
          </SetupBlock>
          <SetupBlock number="2" title="기록할 앱 / 소스 선택" note="선택한 앱과 소스의 활동만 기록합니다. Mori는 전체 컴퓨터를 감시하지 않습니다.">
            <CaptureSurfaceHonestyStrip />
            <div className="source-group">
              <p className="source-group-label">
                지금 가져올 수 있는 소스
                <span className="source-group-count">{availableSources.length}</span>
              </p>
              <div className="source-grid">
                {availableSources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    selected={selectedSourceIds.has(source.id)}
                    onToggle={() =>
                      setSelectedSourceIds((current) =>
                        toggleSourceSelection(current, source),
                      )
                    }
                  />
                ))}
              </div>
            </div>
            {plannedSources.length > 0 ? (
              <div className="source-group">
                <p className="source-group-label">
                  예정된 통합
                  <span className="pill tone-gray">Planned</span>
                </p>
                <p className="source-group-hint">
                  아래 통합은 아직 제공되지 않습니다. 이번 세션에서 캡처되지 않으며, Mori는 이 앱들을 자동으로 읽지 않습니다.
                </p>
                <div className="source-grid">
                  {plannedSources.map((source) => (
                    <SourceCard key={source.id} source={source} selected={false} />
                  ))}
                </div>
              </div>
            ) : null}
            <details className="privacy-note">
              <summary>
                <ShieldCheck size={16} aria-hidden="true" />
                <span>Summary Mode는 원본을 오래 보관하지 않고 요약·이슈·결정·타임라인 중심으로 저장합니다.</span>
              </summary>
              <ul className="privacy-note-detail">
                <li>저장하는 항목 — AI 대화 요약, 결정 · 이슈 · 산출물, 타임라인 이벤트</li>
                <li>보관하지 않는 항목 — 전체 원본 대화, 첨부 원본 파일</li>
                <li>전체 원본이 필요하면 3단계에서 Full Mode를 선택하세요.</li>
              </ul>
            </details>
          </SetupBlock>
          <SetupBlock number="3" title="기록 모드 선택">
            <div className="mode-grid">
              {RECORDING_MODES.map(({ mode, points }) => (
                <ModeCard
                  key={mode}
                  mode={mode}
                  points={points}
                  selected={recordingMode === mode}
                  onSelect={() => setRecordingMode(mode)}
                />
              ))}
            </div>
          </SetupBlock>
          <SetupBlock number="4" title="로컬 AI 엔진 선택" note="현재 세션에 연결할 수 있는 로컬 분석 엔진만 선택할 수 있습니다. Planned 제공자는 설정 화면과 같은 기준으로 비활성화됩니다.">
            <div className="engine-grid">
              {ENGINE_OPTIONS.map((engine) => (
                <EngineCard
                  key={engine.provider}
                  engine={engine}
                  selected={selectedEngine.provider === engine.provider}
                  onSelect={() => setEngineProvider(engine.provider)}
                />
              ))}
            </div>
          </SetupBlock>
          <div className="setup-actions">
            <Button variant="primary" icon={Play} onClick={handleStartSession}>Mori 세션 시작</Button>
            {savedDraft ? (
              <Button icon={Sparkles} onClick={handleResetToDemo}>데모로 되돌리기</Button>
            ) : null}
          </div>
        </div>
        <SessionSummary
          savedDraft={savedDraft}
          sessionTitle={sessionTitle}
          projectName={projectName}
          selectedSources={selectedSources}
          recordingMode={recordingMode}
          engine={selectedEngine}
          storageTarget={storageTarget}
        />
      </div>
    </div>
  );
}

/**
 * Honest strip above the source-tile grid: which capture surfaces actually
 * work today vs. which are still planned. Reads from the capture surface
 * matrix so the copy can never drift out of sync with the connector docs.
 */
function CaptureSurfaceHonestyStrip() {
  const implementedCount = getImplementedCaptureSurfaces().length;
  const plannedCount = getPlannedCaptureSurfaces().length;
  return (
    <div className="capture-surface-strip" role="note">
      <Info size={14} aria-hidden="true" />
      <div>
        <strong>현재 사용 가능한 캡처 경로 {implementedCount}개</strong>
        <span> · </span>
        <span>
          {plannedCount}개 Planned — Claude Code hook, Codex CLI wrapper,
          터미널 / IDE / 브라우저 경로는 문서·템플릿 단계이거나 예정 상태이며,
          Mori는 이들을 임의로 수집하지 않습니다.
        </span>
      </div>
    </div>
  );
}

function SourceCard({
  source,
  selected,
  onToggle,
}: {
  source: SourceOption;
  selected: boolean;
  onToggle?: () => void;
}) {
  const Icon = source.icon;
  const planned = source.status === "planned";
  return (
    <button
      className={`source-card ${selected ? "selected" : ""} ${planned ? "disabled" : ""}`}
      type="button"
      disabled={planned}
      aria-pressed={planned ? undefined : selected}
      onClick={planned ? undefined : onToggle}
    >
      <Icon size={28} />
      <div>
        <strong>{source.name}</strong>
        <span><i />{source.detail}</span>
      </div>
      {planned ? (
        <span className="pill tone-gray">Planned</span>
      ) : selected ? (
        <Check size={17} />
      ) : (
        <span className="checkbox" />
      )}
    </button>
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

function ModeCard({
  mode,
  points,
  selected,
  onSelect,
}: {
  mode: RecordingMode;
  points: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`mode-card ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="radio" />
      <strong>{recordingModeLabels[mode]}</strong>
      <small>{selected ? "선택된 기록 모드입니다." : "프로젝트 성격에 따라 선택하세요."}</small>
      <ul>
        {points.map((point) => <li key={point}>{point}</li>)}
      </ul>
    </button>
  );
}

function EngineCard({
  engine,
  selected,
  onSelect,
}: {
  engine: StartSessionEngineOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = ENGINE_ICONS[engine.provider];
  const muted = !engine.selectable;
  return (
    <button
      className={`engine-card ${selected ? "selected" : ""} ${muted ? "muted-card" : ""}`}
      type="button"
      disabled={muted}
      aria-pressed={muted ? undefined : selected}
      onClick={muted ? undefined : onSelect}
      title={muted ? engine.disabledReason : undefined}
    >
      <Icon size={26} />
      <div>
        <strong>{engine.label}</strong>
        <small>{engine.detail}</small>
        {muted && engine.disabledReason ? (
          <small className="engine-card-reason">{engine.disabledReason}</small>
        ) : null}
      </div>
      <Badge tone={muted ? "orange" : "green"} title={engine.disabledReason}>
        {muted ? engine.statusLabel : "사용 가능"}
      </Badge>
    </button>
  );
}

function SessionSummary({
  savedDraft,
  sessionTitle,
  projectName,
  selectedSources,
  recordingMode,
  engine,
  storageTarget,
}: {
  savedDraft: StoredSessionDraft | null;
  sessionTitle: string;
  projectName: string;
  selectedSources: SourceOption[];
  recordingMode: RecordingMode;
  engine: StartSessionEngineOption;
  storageTarget: SessionStorageTarget;
}) {
  return (
    <aside className="summary-panel">
      <h2>세션 요약</h2>
      <SummaryRow label="세션 이름" value={sessionTitle || "Untitled Mori Session"} />
      <SummaryRow label="프로젝트" value={projectName || "Untitled Project"} />
      <hr />
      <SummaryRow label="기록할 소스" value={`${selectedSources.length}개 선택됨`} />
      <ul className="summary-source-list">
        {selectedSources.length === 0 ? (
          <li className="summary-source-empty">선택된 소스가 없습니다</li>
        ) : (
          selectedSources.map((source) => <li key={source.id}>{source.name}</li>)
        )}
      </ul>
      <hr />
      <SummaryRow label="기록 모드" value={recordingModeLabels[recordingMode]} accent />
      <SummaryRow
        label="AI 엔진"
        value={engine.model ? `${engine.label} (${engine.model})` : engine.label}
        accent
      />
      <SummaryRow label="저장 위치" value={storageTarget.label} />
      <SummaryRow label="원본 보관" value={describeRetentionFootprint(recordingMode)} />
      <SummaryRow label="민감 앱" value="기본 차단" />
      <div className="draft-status-panel">
        <strong>{savedDraft ? "세션 드래프트 저장됨" : "세션 드래프트가 아직 저장되지 않음"}</strong>
        <span>저장소: {storageTarget.detail}</span>
        <span>패키지 버전: .mori v0.1.0 JSON 지원</span>
        {savedDraft ? (
          <>
            <span>현재 세션: {savedDraft.session.id}</span>
            <span>저장 시각: {formatDateTime(savedDraft.savedAt)}</span>
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
