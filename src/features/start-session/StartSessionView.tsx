import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  Cloud,
  Code2,
  Database,
  Download,
  FileCode2,
  FilePlus2,
  Lock,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { ActionBar } from "../../components/layout/ActionBar";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriDrawer } from "../../components/ui/MoriDrawer";
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
import type { AiTranscriptPlatform } from "../../lib/import";
import type { HubImportKind } from "../../lib/sources/integrationGroups";
import type { LlmProvider, RecordingMode, SourceOption } from "../../domain/types";
import { useMoriSessionStore, selectSessionMode } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { ImportPanel } from "../import/ImportPanel";

/**
 * One AI agent anchors a session (the spine). The picker offers the three
 * supported agents; the user must choose one explicitly — nothing is
 * pre-selected, so the create action stays disabled until a real decision.
 */
type AgentOption = {
  id: string;
  name: string;
  detail: string;
  icon: LucideIcon;
  platform: AiTranscriptPlatform;
};

const AGENT_OPTIONS: AgentOption[] = [
  { id: "opt-claude", name: "Claude", detail: "Claude Code · Desktop · Web", icon: Sparkles, platform: "claude" },
  { id: "opt-codex", name: "Codex", detail: "Codex CLI", icon: Code2, platform: "codex" },
  { id: "opt-opencode", name: "OpenCode", detail: "OpenCode CLI", icon: Braces, platform: "other" },
];

type StartMethod = "new" | "import";

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

const ENGINE_OPTIONS = buildStartSessionEngineOptions().filter((engine) => engine.selectable);

const ENGINE_ICONS: Record<LlmProvider, LucideIcon> = {
  ollama: Bot,
  lmStudio: Database,
  openAiCompatible: FileCode2,
  cloudApi: Cloud,
};

/**
 * 새 세션 — a two-pane creation wizard. The left column is a numbered set of
 * steps (connect → method → settings); the right column summarises what will
 * be created and carries the single create action. Nothing is pre-selected,
 * so the user makes each decision deliberately and the create button only
 * enables once the required choices are made.
 */
export function StartSessionView() {
  const storeDraft = useMoriSessionStore((state) => state.draft);
  const mode = useMoriSessionStore(selectSessionMode);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [method, setMethod] = useState<StartMethod | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [engineProvider, setEngineProvider] = useState<LlmProvider>(
    () => getDefaultStartSessionEngineOption().provider,
  );

  const [importOpen, setImportOpen] = useState(false);

  const selectedEngine =
    ENGINE_OPTIONS.find(
      (engine) => engine.provider === coerceStartSessionEngineProvider(engineProvider),
    ) ?? getDefaultStartSessionEngineOption();
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const storageTarget = useMemo<SessionStorageTarget>(
    () => describeSessionStorageTarget({ isDesktop: isTauriRuntime() }),
    [],
  );
  const recordingMode: RecordingMode = "summary";
  const setSessionDraft = useMoriSessionStore((state) => state.setDraft);
  const resetSessionToDemo = useMoriSessionStore((state) => state.resetToDemo);
  const setCurrentView = useMoriAppStore((state) => state.navigate);

  const selectedAgent = AGENT_OPTIONS.find((agent) => agent.id === selectedAgentId) ?? null;
  // "새 대화 시작" creates the container here; "기존 대화 가져오기" creates the
  // session through the import itself, so the right-pane create button only
  // applies to the new-conversation path.
  const canCreate = Boolean(selectedAgent) && method === "new";

  function handleStartSession() {
    if (!selectedAgent || method !== "new") return;
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

  function handleContinueSession() {
    setCurrentView("evidence");
  }

  const hasActiveSession = mode === "draft" && storeDraft !== null;

  const createButton = (
    <Button
      variant="primary"
      icon={FilePlus2}
      onClick={handleStartSession}
      disabled={!canCreate}
      title={
        canCreate
          ? undefined
          : !selectedAgent
            ? "AI 에이전트를 먼저 선택하세요."
            : method === "import"
              ? "가져오기를 마치면 세션이 만들어집니다."
              : "시작 방법을 선택하세요."
      }
    >
      {selectedAgent && method === "new" ? `${selectedAgent.name}로 세션 만들기` : "세션 만들기"}
    </Button>
  );

  return (
    <PageShell
      className="start-session-page"
      actionBar={
        <ActionBar
          label="새 세션"
          end={
            hasActiveSession ? (
              <Button variant="secondary" icon={ArrowRight} onClick={handleContinueSession}>
                현재 세션 계속
              </Button>
            ) : (
              <Button variant="secondary" icon={Sparkles} onClick={handleResetToDemo}>
                데모로 되돌리기
              </Button>
            )
          }
        />
      }
      aside={
        <SessionSummary
          savedDraft={storeDraft}
          agent={selectedAgent}
          method={method}
          sessionTitle={sessionTitle}
          projectName={projectName}
          recordingMode={recordingMode}
          engine={selectedEngine}
          storageTarget={storageTarget}
          createAction={createButton}
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
      ) : null}

      <StepBlock number="1" title="세션 연결" complete={Boolean(selectedAgent)}>
        <div className="agent-grid">
          {AGENT_OPTIONS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedAgentId === agent.id}
              onSelect={() => {
                setSelectedAgentId((current) => (current === agent.id ? null : agent.id));
                setMethod(null);
              }}
            />
          ))}
        </div>
      </StepBlock>

      {selectedAgent ? (
        <StepBlock number="2" title="시작 방법" complete={method !== null}>
          <div className="agent-grid start-method-grid">
            <MethodCard
              icon={FilePlus2}
              title="새 대화 시작"
              detail={`${selectedAgent.name}로 새 작업을 시작할 세션을 만듭니다.`}
              selected={method === "new"}
              onSelect={() => setMethod("new")}
            />
            <MethodCard
              icon={Download}
              title="기존 대화 가져오기"
              detail={`이미 한 ${selectedAgent.name} 대화를 골라 세션으로 가져옵니다.`}
              selected={method === "import"}
              onSelect={() => setMethod("import")}
            />
          </div>

          {method === "import" ? (
            <div className="start-import-options">
              <Button
                variant="primary"
                icon={Download}
                onClick={() => setCurrentView("connections")}
              >
                감지된 작업 세션에서 가져오기
              </Button>
              <Button variant="secondary" icon={FilePlus2} onClick={() => setImportOpen(true)}>
                대화 직접 붙여넣기
              </Button>
              <p className="start-import-note">
                가져온 대화가 그대로 새 작업 세션이 됩니다 — 가져온 항목은 검토를 거쳐 타임라인에
                들어가고, Mori가 직접 대화를 진행하지는 않습니다.
              </p>
            </div>
          ) : method === "new" ? (
            <p className="start-import-note">
              세션을 만든 뒤 {selectedAgent.name}에서 대화하면 Mori 캡처 훅이 기록한 내용을 증거
              탭에서 가져올 수 있습니다.
            </p>
          ) : null}
        </StepBlock>
      ) : null}

      {selectedAgent && method === "new" ? (
        <StepBlock number="3" title="세션 설정" complete>
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
        </StepBlock>
      ) : null}

      <MoriDrawer open={importOpen} onClose={() => setImportOpen(false)} ariaLabel="대화 가져오기">
        <ImportPanel
          variant="embedded"
          initialKind={"ai" as HubImportKind}
          initialAiPlatform={selectedAgent?.platform}
          onClose={() => setImportOpen(false)}
        />
      </MoriDrawer>
    </PageShell>
  );
}

function StepBlock({
  number,
  title,
  complete,
  children,
}: {
  number: string;
  title: string;
  complete?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`setup-block${complete ? " is-complete" : ""}`}>
      <header>
        <span>{complete ? <Check size={14} aria-hidden="true" /> : number}</span>
        <div>
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
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

function MethodCard({
  icon: Icon,
  title,
  detail,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`source-card ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {selected ? <Check size={17} /> : <span className="checkbox" />}
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
  agent,
  method,
  sessionTitle,
  projectName,
  recordingMode,
  engine,
  storageTarget,
  createAction,
}: {
  savedDraft: StoredSessionDraft | null;
  agent: AgentOption | null;
  method: StartMethod | null;
  sessionTitle: string;
  projectName: string;
  recordingMode: RecordingMode;
  engine: StartSessionEngineOption;
  storageTarget: SessionStorageTarget;
  createAction: ReactNode;
}) {
  const methodLabel =
    method === "new" ? "새 대화 시작" : method === "import" ? "기존 대화 가져오기" : "미선택";
  return (
    <InspectorPanel
      ariaLabel="세션 요약"
      title="세션 요약"
      subtitle="선택한 내용을 기반으로 이렇게 만들어집니다."
      headerExtras={
        <Badge tone={savedDraft ? "green" : "gray"}>
          {savedDraft ? "드래프트 저장됨" : "미저장"}
        </Badge>
      }
      footer={
        <div className="start-summary-footer">
          <Lock size={15} aria-hidden="true" />
          <span>모든 데이터는 로컬에 저장됩니다. Cloud API는 명시적으로 켤 때만 사용합니다.</span>
        </div>
      }
    >
      <SummaryRow label="AI 에이전트" value={agent?.name ?? "미선택"} muted={!agent} />
      <SummaryRow label="시작 방법" value={methodLabel} muted={!method} />
      {method === "new" ? (
        <>
          <SummaryRow label="세션 이름" value={sessionTitle || "무제 Mori 세션"} />
          <SummaryRow label="프로젝트" value={projectName || "무제 프로젝트"} />
          <hr />
          <SummaryRow
            label="AI 엔진"
            value={engine.model ? `${engine.label} (${engine.model})` : engine.label}
            accent
          />
          <SummaryRow label="저장 위치" value={storageTarget.label} />
          <SummaryRow label="원본 보관" value={describeRetentionFootprint(recordingMode)} />
        </>
      ) : null}
      <div className="start-summary-action">{createAction}</div>
    </InspectorPanel>
  );
}

function SummaryRow({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="summary-row">
      <span />
      <span>{label}</span>
      <b className={accent ? "accent" : muted ? "muted" : ""}>{value}</b>
    </div>
  );
}
