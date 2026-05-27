import {
  ArrowRight,
  Bot,
  Braces,
  Cloud,
  Code2,
  Database,
  FileCode2,
  FilePlus2,
  Lock,
  RefreshCcw,
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
import type { LlmProvider, RecordingMode, SourceOption } from "../../domain/types";
import { useMoriSessionStore, selectSessionMode } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { SourceControlCenter } from "../connections/SourceControlCenter";
import { ImportPanel } from "../import/ImportPanel";
import type {
  CaptureSurfaceToolFamily,
  ControlCenterAiPlatform,
  ControlCenterImportKind,
} from "../../lib/connectors";
import type { HubImportKind } from "../../lib/sources/integrationGroups";
import type { AiTranscriptPlatform } from "../../lib/import";

/**
 * AI-agent anchors for a hand-made session. A Mori session is one AI-agent work
 * session, so the agent (the spine) is the single thing you choose at creation.
 */
type AgentOption = { id: string; name: string; detail: string; icon: LucideIcon };

const AGENT_OPTIONS: AgentOption[] = [
  { id: "opt-claude", name: "Claude", detail: "Claude Code · Desktop · Web", icon: Sparkles },
  { id: "opt-codex", name: "Codex", detail: "Codex CLI · 내보내기", icon: Code2 },
  { id: "opt-opencode", name: "OpenCode", detail: "OpenCode CLI", icon: Braces },
];

/** Map the Source Control Center's agent families onto the create-time agent. */
const FAMILY_TO_AGENT: Partial<Record<CaptureSurfaceToolFamily, AgentOption>> = {
  claude: AGENT_OPTIONS[0]!,
  codex: AGENT_OPTIONS[1]!,
  opencode: AGENT_OPTIONS[2]!,
};
const AGENT_ID_TO_FAMILY: Record<string, CaptureSurfaceToolFamily> = {
  "opt-claude": "claude",
  "opt-codex": "codex",
  "opt-opencode": "opencode",
};

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

const ENGINE_OPTIONS = buildStartSessionEngineOptions().filter((engine) => engine.selectable);

const ENGINE_ICONS: Record<LlmProvider, LucideIcon> = {
  ollama: Bot,
  lmStudio: Database,
  openAiCompatible: FileCode2,
  cloudApi: Cloud,
};

function deriveInitialFormState(draft: StoredSessionDraft | null) {
  if (!draft) {
    return {
      sessionTitle: "",
      projectName: "",
      family: "claude" as CaptureSurfaceToolFamily,
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
    family: (savedAgent ? AGENT_ID_TO_FAMILY[savedAgent] : undefined) ?? "claude",
    recordingMode: draft.session.recordingMode,
    engineProvider: draft.session.llmProvider,
  };
}

/**
 * 새 세션 — the single session entry. One agent picker (the Source Control
 * Center) drives everything: its per-agent surfaces import an existing
 * conversation inline (no separate page), and the same selected agent anchors
 * "새 대화 시작", which creates the session container so the user can go start
 * the conversation in their own agent — Mori then imports what the capture
 * hook records. Mori never drives the agent or watches the machine.
 */
export function StartSessionView() {
  const storeDraft = useMoriSessionStore((state) => state.draft);
  const mode = useMoriSessionStore(selectSessionMode);

  const initial = useMemo(() => deriveInitialFormState(storeDraft), [storeDraft]);

  const [sessionTitle, setSessionTitle] = useState(() => initial.sessionTitle);
  const [projectName, setProjectName] = useState(() => initial.projectName);
  const [selectedFamily, setSelectedFamily] = useState<CaptureSurfaceToolFamily>(
    () => initial.family,
  );
  const recordingMode = initial.recordingMode;
  const [engineProvider, setEngineProvider] = useState<LlmProvider>(() => initial.engineProvider);

  // Inline import drawer — the destination for the Source Control Center's
  // per-agent import actions, so "기존 대화 가져오기" happens on this page
  // instead of routing away.
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<HubImportKind>("ai");
  const [importPlatform, setImportPlatform] = useState<AiTranscriptPlatform | undefined>(undefined);

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
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const openSettingsSheet = useMoriAppStore((state) => state.openSettingsSheet);

  const selectedAgent = FAMILY_TO_AGENT[selectedFamily] ?? null;

  function openImportDrawer(kind: ControlCenterImportKind, platform?: ControlCenterAiPlatform) {
    setImportKind(kind as HubImportKind);
    setImportPlatform(platform as AiTranscriptPlatform | undefined);
    setImportOpen(true);
  }

  function handleStartSession() {
    if (!selectedAgent) return;
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

  return (
    <PageShell
      className="start-session-page"
      actionBar={
        <ActionBar
          label="새 세션"
          end={
            <>
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
                variant={selectedAgent ? "primary" : "secondary"}
                icon={hasActiveSession ? RefreshCcw : FilePlus2}
                onClick={handleStartSession}
                disabled={!selectedAgent}
                title={selectedAgent ? undefined : "AI 에이전트를 먼저 선택하세요."}
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

      {/* One agent picker. Selecting an agent shows its import surfaces right
          here (no separate page) and anchors the "새 대화 시작" block below. */}
      <SourceControlCenter
        isDesktop={isTauriRuntime()}
        hasActiveSession={hasActiveSession}
        onImport={openImportDrawer}
        onOpenRepositorySettings={() => openSettingsSheet("repositories")}
        selectedFamily={selectedFamily}
        onSelectFamily={setSelectedFamily}
      />

      <SetupBlock
        title="새 대화 시작"
        note={
          selectedAgent
            ? `${selectedAgent.name}로 새 작업을 시작할 세션을 만듭니다. 만든 뒤 그 에이전트에서 대화하면 Mori 캡처 훅이 기록한 내용을 가져옵니다 — Mori가 직접 대화를 진행하지는 않습니다.`
            : "위에서 AI 에이전트(Claude · Codex · OpenCode)를 선택하면 새 대화 세션을 시작할 수 있습니다."
        }
      >
        {selectedAgent ? (
          <>
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
            <div className="start-create-action">
              <Button variant="primary" icon={FilePlus2} onClick={handleStartSession}>
                {selectedAgent.name}로 세션 만들기
              </Button>
            </div>
          </>
        ) : null}
      </SetupBlock>

      <MoriDrawer open={importOpen} onClose={() => setImportOpen(false)} ariaLabel="소스 가져오기">
        <ImportPanel
          variant="embedded"
          initialKind={importKind}
          initialAiPlatform={importPlatform}
          onClose={() => setImportOpen(false)}
        />
      </MoriDrawer>
    </PageShell>
  );
}

function SetupBlock({
  number,
  title,
  note,
  titleExtra,
  children,
}: {
  number?: string;
  title: string;
  note?: string;
  titleExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="setup-block">
      <header>
        {number ? <span>{number}</span> : null}
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
  agent: AgentOption | null;
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
      <SummaryRow label="AI 에이전트" value={agent?.name ?? "에이전트 미선택"} />
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
