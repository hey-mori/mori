import { ArrowRight, Bot, Check, Cloud, Database, FileCode2, FilePlus2, Lock, PlugZap, RefreshCcw, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { HelpDisclosure } from "../../components/layout/HelpDisclosure";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { PageShell } from "../../components/layout/PageShell";
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
import { useMoriSessionStore, selectSessionMode } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";

const availableSources = sourceOptions.filter((source) => source.status === "available");
const plannedSources = sourceOptions.filter((source) => source.status === "planned");

const RECORDING_MODES: { mode: RecordingMode; points: string[] }[] = [
  { mode: "summary", points: ["요약 · 결정 · 이슈 · 산출물 중심", "원본은 짧게만 보관", "저장 공간 절약"] },
  { mode: "full", points: ["전체 대화 및 원본 보관", "감사 / 상세 추적에 적합", "더 많은 저장 공간 사용"] },
  { mode: "ephemeral", points: ["리포트만 저장", "원본 데이터 자동 삭제", "민감 프로젝트에 적합"] },
];

const ENGINE_OPTIONS = buildStartSessionEngineOptions();

const ENGINE_ICONS: Record<LlmProvider, LucideIcon> = {
  ollama: Bot,
  lmStudio: Database,
  openAiCompatible: FileCode2,
  cloudApi: Cloud,
};

/**
 * Derive sensible initial form values from a persisted draft when the user
 * returns to Start Session while a session already exists. Falls back to
 * neutral defaults when no draft is present (first-run path).
 */
function deriveInitialFormState(draft: StoredSessionDraft | null) {
  if (!draft) {
    return {
      sessionTitle: "",
      projectName: "",
      selectedSourceIds: initialSelectedSourceIds(sourceOptions),
      recordingMode: "summary" as RecordingMode,
      engineProvider: getDefaultStartSessionEngineOption().provider,
    };
  }
  return {
    sessionTitle: draft.session.title,
    projectName: draft.project.name,
    selectedSourceIds: new Set(draft.session.selectedSourceIds),
    recordingMode: draft.session.recordingMode,
    engineProvider: draft.session.llmProvider,
  };
}

/**
 * New work session — the *secondary* entry path.
 *
 * Most sessions are created by importing a Claude conversation in 연결
 * (Connections); this surface exists for the rarer case of starting an empty
 * work session by hand so imported evidence has somewhere to land. The framing
 * is deliberately "create a container for evidence", never "start recording" —
 * Mori reconstructs work from explicit imports, it does not watch or capture in
 * the background. Existing source / engine / retention controls are kept but
 * presented honestly and compactly.
 */
export function StartSessionView() {
  // Read the store-hydrated draft as the source of truth for initial values.
  // We take the value once at mount (lazy initialiser) so that form edits are
  // not clobbered by store re-renders while the user types.
  const storeDraft = useMoriSessionStore((state) => state.draft);
  const mode = useMoriSessionStore(selectSessionMode);

  const initial = useMemo(() => deriveInitialFormState(storeDraft), [storeDraft]);

  const [sessionTitle, setSessionTitle] = useState(() => initial.sessionTitle);
  const [projectName, setProjectName] = useState(() => initial.projectName);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(
    () => initial.selectedSourceIds,
  );
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(
    () => initial.recordingMode,
  );
  const [engineProvider, setEngineProvider] = useState<LlmProvider>(
    () => initial.engineProvider,
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

  const selectedSources = useMemo(
    () =>
      applySourceSelection(sourceOptions, selectedSourceIds).filter(
        (source) => source.selected,
      ),
    [selectedSourceIds],
  );

  function handleStartSession() {
    const draft = createSessionDraft({
      sessionTitle: sessionTitle || "제목 없는 세션",
      projectName: projectName || "제목 없는 프로젝트",
      selectedSources: applySourceSelection(sourceOptions, selectedSourceIds),
      recordingMode,
      llmProvider: selectedEngine.provider,
      llmModel: selectedEngine.model,
      storageLocation: storageTarget.location,
    });
    const stored = repository.saveCurrentSessionDraft(draft);
    setSessionDraft(stored);
    setCurrentView("evidence");
  }

  function handleResetToDemo() {
    resetSessionToDemo();
    setCurrentView("timeline");
  }

  /** Switch back to the existing session without changing anything. */
  function handleContinueSession() {
    setCurrentView("evidence");
  }

  const hasActiveSession = mode === "draft" && storeDraft !== null;

  return (
    <PageShell
      className="start-session-page"
      actionBar={
        <ActionBar
          label="세션 생성"
          start={
            <>
              <span className="action-bar-context">새 작업 세션</span>
              <Badge tone={hasActiveSession ? "green" : "gray"}>
                {hasActiveSession ? "활성 세션 있음" : "활성 세션 없음"}
              </Badge>
            </>
          }
          end={
            <>
              <Button variant="secondary" icon={PlugZap} onClick={() => setCurrentView("connections")}>
                연결에서 가져오기
              </Button>
              {hasActiveSession ? (
                <Button variant="secondary" icon={ArrowRight} onClick={handleContinueSession}>
                  현재 세션 계속
                </Button>
              ) : (
                <Button variant="secondary" icon={Sparkles} onClick={handleResetToDemo}>
                  데모로 되돌리기
                </Button>
              )}
              <Button
                variant={hasActiveSession ? "secondary" : "primary"}
                icon={hasActiveSession ? RefreshCcw : FilePlus2}
                onClick={handleStartSession}
              >
                {hasActiveSession ? "새 세션으로 교체" : "세션 만들기"}
              </Button>
            </>
          }
        />
      }
      aside={
        <SessionSummary
          savedDraft={storeDraft}
          sessionTitle={sessionTitle || "무제 Mori 세션"}
          projectName={projectName || "무제 프로젝트"}
          selectedSources={selectedSources}
          recordingMode={recordingMode}
          engine={selectedEngine}
          storageTarget={storageTarget}
        />
      }
    >
      {hasActiveSession ? (
        <NoticeBanner
          tone="success"
          title="활성 세션이 이미 있습니다"
          actions={
            <Button variant="secondary" icon={ArrowRight} onClick={handleContinueSession}>
              계속 작업
            </Button>
          }
        >
          {storeDraft.session.title} · {storeDraft.project.name} ·{" "}
          {recordingModeLabels[storeDraft.session.recordingMode]} · 저장{" "}
          {formatDateTime(storeDraft.savedAt)}
        </NoticeBanner>
      ) : (
        <NoticeBanner
          tone="info"
          title="먼저 연결을 확인하세요"
          actions={
            <Button variant="secondary" icon={PlugZap} onClick={() => setCurrentView("connections")}>
              연결로 이동
            </Button>
          }
        >
          대부분의 세션은 연결에서 Claude 대화를 가져오면 자동으로 만들어집니다. 빈 세션이 필요할
          때만 아래에서 직접 만드세요.
        </NoticeBanner>
      )}

      <SetupBlock number="1" title="세션 정보">
        <div className="form-row">
          <label>
            세션 이름
            <input
              value={sessionTitle}
              placeholder="예: Mori 앱 기획"
              onChange={(event) => setSessionTitle(event.target.value)}
            />
          </label>
          <label>
            프로젝트
            <input
              value={projectName}
              placeholder="예: Mori Product"
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>
        </div>
      </SetupBlock>

      <SetupBlock
        number="2"
        title="가져올 소스"
        note="선택한 소스에서 가져온 증거만 이 세션에 모읍니다. Mori는 전체 컴퓨터를 감시하지 않습니다."
      >
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
              <span className="pill tone-gray">예정</span>
            </p>
            <div className="source-grid">
              {plannedSources.map((source) => (
                <SourceCard key={source.id} source={source} selected={false} />
              ))}
            </div>
          </div>
        ) : null}
        <CaptureSurfaceHelp />
      </SetupBlock>

      <SetupBlock
        number="3"
        title="보관 범위"
        note="이 세션이 가져온 증거를 얼마나 오래 보관할지 정합니다."
      >
        <div className="mode-grid">
          {RECORDING_MODES.map(({ mode: m, points }) => (
            <ModeCard
              key={m}
              mode={m}
              points={points}
              selected={recordingMode === m}
              onSelect={() => setRecordingMode(m)}
            />
          ))}
        </div>
      </SetupBlock>

      <SetupBlock
        number="4"
        title="로컬 AI 엔진"
        note="Quick Pass 분석에 쓸 로컬 엔진입니다. Planned 제공자는 설정과 같은 기준으로 비활성화됩니다."
      >
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
    </PageShell>
  );
}

/**
 * Honest disclosure of which capture surfaces work today vs. which are still
 * planned. Reads from the capture surface matrix so the copy can never drift
 * out of sync with the connector docs. Tucked behind a HelpDisclosure so the
 * first screen stays calm.
 */
function CaptureSurfaceHelp() {
  const implementedCount = getImplementedCaptureSurfaces().length;
  const plannedCount = getPlannedCaptureSurfaces().length;
  return (
    <HelpDisclosure label="캡처 경로는 어떻게 동작하나요" ariaLabel="캡처 경로 설명">
      <p>
        지금 사용할 수 있는 캡처 경로는 {implementedCount}개입니다. 모든 가져오기는 사용자가
        직접 붙여넣거나 파일을 선택할 때만 일어납니다.
      </p>
      <p>
        나머지 {plannedCount}개 — Claude Code hook, Codex CLI wrapper, 터미널 / IDE / 브라우저
        경로 — 는 문서·템플릿 단계이거나 예정 상태이며, Mori는 이들을 임의로 수집하지 않습니다.
      </p>
    </HelpDisclosure>
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
      <small>{selected ? "선택된 보관 범위입니다." : "프로젝트 성격에 따라 선택하세요."}</small>
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
    <InspectorPanel
      ariaLabel="세션 요약"
      title="세션 요약"
      subtitle="만들기 전에 이 세션의 구성을 확인하세요."
      headerExtras={
        <Badge tone={savedDraft ? "green" : "gray"}>
          {savedDraft ? "드래프트 저장됨" : "미저장"}
        </Badge>
      }
      footer={
        <div className="start-summary-footer">
          <Lock size={15} aria-hidden="true" />
          <span>
            모든 데이터는 로컬에 저장됩니다. Cloud API는 명시적으로 켤 때만 사용합니다.
          </span>
        </div>
      }
    >
      <SummaryRow label="세션 이름" value={sessionTitle || "무제 Mori 세션"} />
      <SummaryRow label="프로젝트" value={projectName || "무제 프로젝트"} />
      <SummaryRow label="가져올 소스" value={`${selectedSources.length}개 선택됨`} />
      <ul className="summary-source-list">
        {selectedSources.length === 0 ? (
          <li className="summary-source-empty">선택된 소스가 없습니다</li>
        ) : (
          selectedSources.map((source) => <li key={source.id}>{source.name}</li>)
        )}
      </ul>
      <hr />
      <SummaryRow label="보관 범위" value={recordingModeLabels[recordingMode]} accent />
      <SummaryRow
        label="AI 엔진"
        value={engine.model ? `${engine.label} (${engine.model})` : engine.label}
        accent
      />
      <SummaryRow label="저장 위치" value={storageTarget.label} />
      <SummaryRow label="원본 보관" value={describeRetentionFootprint(recordingMode)} />
      {savedDraft ? (
        <>
          <hr />
          <SummaryRow label="현재 세션" value={savedDraft.session.id} />
          <SummaryRow label="저장 시각" value={formatDateTime(savedDraft.savedAt)} />
        </>
      ) : null}
    </InspectorPanel>
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
