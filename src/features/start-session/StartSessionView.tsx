import { ArrowRight, Bot, Braces, Check, Cloud, Code2, Database, FileCode2, FilePlus2, Lock, PlugZap, RefreshCcw, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { ActionBar } from "../../components/layout/ActionBar";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
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
  buildStartSessionEngineOptions,
  coerceStartSessionEngineProvider,
  getDefaultStartSessionEngineOption,
  type StartSessionEngineOption,
} from "../../lib/session/startSessionEngineOptions";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import type { StoredSessionDraft } from "../../lib/storage/storageTypes";
import type { LlmProvider, RecordingMode, SourceOption } from "../../domain/types";
import { useMoriSessionStore, selectSessionMode } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";

/**
 * AI-agent anchors for a hand-made session. A Mori session is one AI-agent
 * work session, so the only thing you choose at creation is which agent it is
 * about (the spine). Git / terminal / file material attaches later as evidence
 * inside the session — it is never a session of its own.
 */
type AgentOption = { id: string; name: string; detail: string; icon: LucideIcon };

const AGENT_OPTIONS: AgentOption[] = [
  { id: "opt-claude", name: "Claude", detail: "Claude Code · Desktop · Web", icon: Sparkles },
  { id: "opt-codex", name: "Codex", detail: "Codex CLI · 내보내기", icon: Code2 },
  { id: "opt-opencode", name: "OpenCode", detail: "OpenCode CLI", icon: Braces },
];

const DEFAULT_AGENT_ID = AGENT_OPTIONS[0]!.id;

/** Build the SourceOption the session draft stores for the chosen agent. */
function agentSourceOption(agent: AgentOption): SourceOption {
  return {
    id: agent.id,
    name: agent.name,
    detail: agent.detail,
    kind: "aiConversation",
    enabled: true,
    selected: true,
    status: "available",
    icon: agent.icon,
  };
}

// Only selectable engines are offered. Disabled / planned providers are not
// shown — a muted card the user can't pick is clutter, and the create flow
// coerces any stale draft provider back to a selectable one anyway.
const ENGINE_OPTIONS = buildStartSessionEngineOptions().filter(
  (engine) => engine.selectable,
);

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
      agentId: DEFAULT_AGENT_ID,
      recordingMode: "summary" as RecordingMode,
      engineProvider: getDefaultStartSessionEngineOption().provider,
    };
  }
  const savedAgent = draft.session.selectedSourceIds.find((id) =>
    AGENT_OPTIONS.some((agent) => agent.id === id),
  );
  return {
    sessionTitle: draft.session.title,
    projectName: draft.project.name,
    agentId: savedAgent ?? DEFAULT_AGENT_ID,
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
 * the background. Source + engine controls stay; the retention-scope choice is
 * dropped — a container for imported evidence keeps summaries by default, and a
 * retention policy is premature before live capture exists.
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
  const [selectedAgentId, setSelectedAgentId] = useState(() => initial.agentId);
  // Recording mode is no longer a create-time choice (premature before live
  // capture exists); a hand-made container keeps summaries by default. We still
  // honour an existing draft's saved mode for returning users.
  const recordingMode = initial.recordingMode;
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
  // `navigate` routes the post-setup "evidence" / "timeline" landings into the
  // unified Session Detail workspace on the matching tab.
  const setCurrentView = useMoriAppStore((state) => state.navigate);

  const selectedAgent =
    AGENT_OPTIONS.find((agent) => agent.id === selectedAgentId) ?? AGENT_OPTIONS[0]!;

  function handleStartSession() {
    const draft = createSessionDraft({
      sessionTitle: sessionTitle || "제목 없는 세션",
      projectName: projectName || "제목 없는 프로젝트",
      selectedSources: [agentSourceOption(selectedAgent)],
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
          label="새 세션 작업"
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
          agent={selectedAgent}
          recordingMode={recordingMode}
          engine={selectedEngine}
          storageTarget={storageTarget}
        />
      }
    >
      <section className="start-entry-strip" aria-label="세션 시작 방식">
        <button
          type="button"
          className="start-entry-card is-primary"
          onClick={() => setCurrentView("connections")}
        >
          <span className="start-entry-icon">
            <PlugZap size={16} aria-hidden="true" />
          </span>
          <span className="start-entry-copy">
            <strong>가져오기로 시작</strong>
            <small>Claude/Codex/OpenCode 작업을 골라 세션과 자료를 함께 만듭니다.</small>
          </span>
          <ArrowRight size={13} aria-hidden="true" />
        </button>
        <div className="start-entry-card">
          <span className="start-entry-icon">
            <FilePlus2 size={16} aria-hidden="true" />
          </span>
          <span className="start-entry-copy">
            <strong>빈 세션 만들기</strong>
            <small>먼저 세션을 만든 뒤 증거 탭에서 자료를 붙입니다.</small>
          </span>
        </div>
      </section>

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
          actions={
            <Button variant="secondary" icon={PlugZap} onClick={() => setCurrentView("connections")}>
              연결로 이동
            </Button>
          }
        >
          대부분의 세션은 연결에서 가져옵니다. 빈 세션이 필요할 때만 아래에서 만드세요.
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
        title="AI 에이전트"
        titleExtra={
          <InfoHint align="start" label="AI 에이전트 안내">
            작업 세션 하나는 AI 에이전트 하나로 시작합니다. Git · 터미널 · 파일 같은 자료는 세션을 만든
            뒤 같은 세션에 붙입니다. Mori는 전체 컴퓨터를 감시하지 않습니다.
          </InfoHint>
        }
      >
        <div className="agent-grid">
          {AGENT_OPTIONS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedAgentId === agent.id}
              onSelect={() => setSelectedAgentId(agent.id)}
            />
          ))}
        </div>
      </SetupBlock>

      <SetupBlock
        number="3"
        title="로컬 AI 엔진"
        note="Quick Pass 분석에 쓸 로컬 엔진입니다."
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

function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = agent.icon;
  return (
    <button
      className={`source-card ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{agent.name}</strong>
        <span>{agent.detail}</span>
      </div>
      {selected ? <Check size={17} /> : <span className="checkbox" />}
    </button>
  );
}

function SetupBlock({
  number,
  title,
  note,
  titleExtra,
  children,
}: {
  number: string;
  title: string;
  note?: string;
  titleExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="setup-block">
      <header>
        <span>{number}</span>
        <div>
          <h2>
            {title}
            {titleExtra}
          </h2>
          {note ? <p>{note}</p> : null}
        </div>
      </header>
      {children}
    </section>
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
  return (
    <button
      className={`engine-card ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{engine.label}</strong>
        <small>{engine.detail}</small>
      </div>
      <Badge tone="green">사용 가능</Badge>
    </button>
  );
}

function SessionSummary({
  savedDraft,
  sessionTitle,
  projectName,
  agent,
  recordingMode,
  engine,
  storageTarget,
}: {
  savedDraft: StoredSessionDraft | null;
  sessionTitle: string;
  projectName: string;
  agent: AgentOption;
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
      <SummaryRow label="AI 에이전트" value={agent.name} />
      <hr />
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
