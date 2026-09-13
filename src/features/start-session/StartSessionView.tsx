import {
  Bot,
  Braces,
  Check,
  ChevronDown,
  ClipboardPaste,
  Code2,
  Cpu,
  FilePlus2,
  FolderGit2,
  History,
  Infinity,
  Lock,
  MousePointer2,
  Rocket,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { InfoHint } from "../../components/ui/InfoHint";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { createSessionDraft } from "../../lib/session/createSessionDraft";
import {
  describeSessionStorageTarget,
  type SessionStorageTarget,
} from "../../lib/session/sessionStorageTarget";
import { resolveStartRecordsAgentId } from "../../lib/session/startRecordsAgent";
import {
  getProjectForFolder,
  rememberProjectForFolder,
} from "../../lib/session/projectFolderLinks";
import { isTauriRuntime } from "../../lib/desktop";
import {
  buildStartSessionEngineOptions,
  type StartSessionEngineOption,
} from "../../lib/session/startSessionEngineOptions";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { loadStoredSessionSummaries } from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { normalizeAiTranscript, type AiTranscriptPlatform } from "../../lib/import";
import type { LlmProvider, SourceOption } from "../../domain/types";
import {
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { useProjectStore } from "../../app/projectStore";
import { projectDisplayName, type UserProject } from "../../lib/projects/userProjects";
import {
  formatClaudeRelativeKo,
} from "../../lib/claude/claudeTauri";
import {
  getAgentWorkSession,
  type AgentWorkAgentId,
  type AgentWorkSessionMeta,
} from "../../lib/trace/sources/ai/workSessions";
import { buildPrimaryImportCandidateFromAgentWorkSession } from "../../lib/import/agentWorkSessionImport";
import {
  AGENT_REGISTRY,
  type AgentDescriptor,
  type AgentIconKey,
} from "../../lib/trace/sources/ai/agentRegistry";
import { DetectedConversationsModal } from "./DetectedConversationsModal";
import { ProjectFormModal, type ProjectFormValues } from "../project/ProjectFormModal";

/**
 * 새 세션 — create one session, the way you'd provision one real thing.
 *
 * A Mori session is one AI-agent work conversation (the spine); Git / terminal
 * / notes hang off it as evidence (ribs). The screen reads as deliberate setup,
 * top to bottom, all visible on one page:
 *
 *   1. 에이전트  — which AI did (or will do) the work. Agent-first because the
 *                  roster is the thing that grows (Claude · Codex · OpenCode · …)
 *                  and it decides which import methods are even possible.
 *   2. 대화      — how this session's conversation arrives: 기록에서 불러오기
 *                  (the agent's own work records, auto-detected), 붙여넣기, or
 *                  빈 세션으로 시작 (anchor first; Mori never drives the agent).
 *   3. 분석 엔진 — which local AI engine analyses the conversation, picked as a
 *                  deliberate setup step (config still lives in settings).
 *   4. 세션 정보 — project + name.
 *
 * Retention is deliberately one unified rule, not a per-session toggle: Mori
 * keeps the summary + metadata locally and never stores the full raw
 * transcript. A three-way choice would add complexity and dishonesty (pasted /
 * detected transcripts are summary-only no matter what the toggle said), so it
 * is stated as a fact instead. The summary panel restates the chosen engine as
 * plain text, not a second control.
 */

type AgentOption = {
  id: string;
  name: string;
  detail: string;
  icon: LucideIcon;
  platform: AiTranscriptPlatform;
  agentId: AgentWorkAgentId;
  /** Whether Mori can auto-detect this agent's work records today. */
  detect: boolean;
};

/** Map the registry's stable glyph key to a concrete lucide icon. */
const AGENT_ICON: Record<AgentIconKey, LucideIcon> = {
  sparkles: Sparkles,
  code2: Code2,
  braces: Braces,
  rocket: Rocket,
  infinity: Infinity,
  bot: Bot,
  cursor: MousePointer2,
};

/**
 * The agent roster is derived from the central registry so a new anchor
 * agent appears here automatically — no per-surface list to keep in sync.
 */
function toAgentOption(descriptor: AgentDescriptor): AgentOption {
  return {
    id: `opt-${descriptor.agentId}`,
    name: descriptor.agentName,
    detail: descriptor.detail,
    icon: AGENT_ICON[descriptor.iconKey],
    platform: descriptor.platform,
    agentId: descriptor.agentId,
    detect: descriptor.detect,
  };
}

const AGENT_OPTIONS: AgentOption[] = AGENT_REGISTRY.map(toAgentOption);

type ImportMethod = "records" | "paste" | "fresh";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
};

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

function methodLabel(method: ImportMethod | null): string {
  if (method === "records") return "기록에서 불러오기";
  if (method === "paste") return "붙여넣기";
  if (method === "fresh") return "빈 세션으로 시작";
  return "미선택";
}

export function StartSessionView() {
  const view = useSessionStore(selectSessionView);
  const importAndOpenAsNewSession = useSessionStore(
    (state) => state.importAndOpenAsNewSession,
  );
  const setSessionDraft = useSessionStore((state) => state.setDraft);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);
  const setCurrentView = useAppStore((state) => state.navigate);
  const openSettingsSheet = useAppStore((state) => state.openSettingsSheet);
  const startRecordsRequest = useAppStore((state) => state.startRecordsRequest);
  const startRecordsAgentId = useAppStore((state) => state.startRecordsAgentId);
  const clearStartRecordsRequest = useAppStore((state) => state.clearStartRecordsRequest);
  const projectsInitialized = useProjectStore((state) => state.initialized);
  const userProjects = useProjectStore((state) => state.projects);
  const hydrateProjects = useProjectStore((state) => state.hydrate);
  const createProject = useProjectStore((state) => state.createProject);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [method, setMethod] = useState<ImportMethod | null>(null);
  const [selectedDetected, setSelectedDetected] = useState<AgentWorkSessionMeta | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectCreateInitialName, setProjectCreateInitialName] = useState("");

  useEffect(() => {
    if (!projectsInitialized) hydrateProjects();
  }, [projectsInitialized, hydrateProjects]);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const storageTarget = useMemo<SessionStorageTarget>(
    () => describeSessionStorageTarget({ isDesktop: isTauriRuntime() }),
    [],
  );
  const engineOptions = useMemo(() => buildStartSessionEngineOptions(), []);
  // Keep this screen opt-in: saved settings are applied only after the user
  // explicitly chooses an engine for the new session.
  const [selectedEngineProvider, setSelectedEngineProvider] = useState<LlmProvider | null>(null);
  const selectedEngine = useMemo(
    () =>
      engineOptions.find(
        (option) => option.provider === selectedEngineProvider && option.selectable,
      ) ?? null,
    [engineOptions, selectedEngineProvider],
  );

  const existingProjects = useMemo(
    () => gatherExistingProjects(userProjects),
    [userProjects],
  );
  const projectOptions = useMemo(
    () =>
      existingProjects.map((project) => ({
        value: project,
        label: projectDisplayName(project, userProjects),
      })),
    [existingProjects, userProjects],
  );
  const [projectChoice, setProjectChoice] = useState<string>(
    () => existingProjects[0] ?? "",
  );
  const projectName = projectChoice;

  useEffect(() => {
    if (projectChoice || existingProjects.length === 0) return;
    setProjectChoice(existingProjects[0] ?? "");
  }, [existingProjects, projectChoice]);

  const selectedAgent = AGENT_OPTIONS.find((agent) => agent.id === selectedAgentId) ?? null;
  const pastePlatform: AiTranscriptPlatform = selectedAgent?.platform ?? "claude";

  // The single create action covers every method. It enables once the chosen
  // method has the input it needs.
  const canCreate =
    Boolean(selectedAgent) &&
    Boolean(selectedEngine) &&
    Boolean(projectName.trim()) &&
    ((method === "records" && Boolean(selectedDetected)) ||
      (method === "paste" && pasteText.trim().length > 0) ||
      method === "fresh");

  function chooseAgent(id: string) {
    setSelectedAgentId((current) => (current === id ? null : id));
    // A different agent changes which methods are possible, so clear the
    // method and its sub-state rather than leave a stale selection.
    setMethod(null);
    setSelectedDetected(null);
    setPasteText("");
  }

  function chooseMethod(next: ImportMethod) {
    // Switching method must not throw away work: a loaded detected session, a
    // pasted transcript, and the filled title / project all persist. Each
    // method's panel is gated on `method`, so preserved state simply reappears
    // when the user switches back rather than showing two sources at once.
    setMethod((current) => (current === next ? null : next));
  }

  function pickDetected(meta: AgentWorkSessionMeta) {
    setSelectedDetected(meta);
    // Auto-fill the session name from the conversation's own title; still editable.
    setSessionTitle(meta.title?.trim() ?? "");
    // File the import under the project this folder was last linked to. If the
    // folder has no remembered link, fall back to a project whose label matches
    // the folder name; otherwise default to creating a new project prefilled
    // with the folder name (the calm "this project doesn't exist yet" prompt).
    // Default the project to the folder's last segment, not the full path
    // ("C:\\dev\\tcc-ng-gw" → "tcc-ng-gw"). Once linked the name can differ.
    const folderName = lastFolderName(meta.projectName);
    const remembered = getProjectForFolder(meta.projectPath);
    if (remembered && existingProjects.includes(remembered)) {
      setProjectChoice(remembered);
    } else if (existingProjects.includes(folderName)) {
      setProjectChoice(folderName);
    } else if (folderName) {
      // Prefill a suggested new-project name but do not force the modal open —
      // the user can keep this default, pick an existing project, or rename.
      setProjectCreateInitialName(folderName);
    }
  }

  function openNewProjectModal(initialName = "") {
    setProjectCreateInitialName(initialName);
    setProjectModalOpen(true);
  }

  function handleCreateProject(values: ProjectFormValues) {
    const name = values.name.trim();
    if (!name) return;
    const key =
      createProject({
        key: name,
        name,
        description: values.description,
      }) ?? name;
    setProjectChoice(key);
    setProjectModalOpen(false);
  }

  // Honour a 기록에서 불러오기 request routed from the 소스 hub: pre-select the
  // agent the user picked there (falling back to the first detection-capable
  // agent when the hub sent no preference), choose the method, and let the
  // inline browse button open the modal only when the user asks for it.
  useEffect(() => {
    if (!startRecordsRequest) return;
    const agentId = resolveStartRecordsAgentId(startRecordsAgentId);
    const option =
      (agentId ? AGENT_OPTIONS.find((entry) => entry.agentId === agentId) : null) ??
      AGENT_OPTIONS[0] ??
      null;
    if (option) setSelectedAgentId(option.id);
    setMethod("records");
    clearStartRecordsRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRecordsRequest]);

  async function handleCreate() {
    if (creating || !canCreate || !selectedAgent || !selectedEngine) return;

    // Choosing an engine here configures the analysis provider that reads this
    // session, so Start Session and Settings → 분석 엔진 stay one setting.
    const provider = selectedEngine.provider;
    if (
      provider === "deterministic" ||
      provider === "ollama" ||
      provider === "openAiCompatible"
    ) {
      updateAnalysisSettings({ provider });
    }

    if (method === "fresh") {
      const draft = createSessionDraft({
        sessionTitle: sessionTitle || "제목 없는 세션",
        projectName: projectName || "제목 없는 프로젝트",
        selectedSources: [agentSourceOption(selectedAgent)],
        recordingMode: "summary",
        llmProvider: selectedEngine.provider,
        llmModel: selectedEngine.model,
        storageLocation: storageTarget.location,
      });
      const stored = repository.saveCurrentSessionDraft(draft);
      setSessionDraft(stored);
      setCurrentView("evidence");
      return;
    }

    if (method === "records" && selectedDetected) {
      setCreating(true);
      try {
        const detail = await getAgentWorkSession(selectedDetected);
        const capturedAt = new Date().toISOString();
        const candidate = buildPrimaryImportCandidateFromAgentWorkSession(detail, {
          projectId: view.project.id,
          sessionId: view.session.id,
          capturedAt,
        });
        const { startedAt, endedAt } = deriveConversationWindow(detail, capturedAt);
        const resolvedProject = projectName || detail.projectName || undefined;
        importAndOpenAsNewSession({
          candidate,
          title: sessionTitle.trim() || detail.title,
          startedAt,
          endedAt,
          projectLabel: resolvedProject,
          recordingMode: "summary",
        });
        // Remember this folder's project so the next import from it auto-links.
        rememberProjectForFolder(selectedDetected.projectPath, resolvedProject);
        setCurrentView("evidence");
      } catch {
        setCreating(false);
      }
      return;
    }

    if (method === "paste" && pasteText.trim()) {
      setCreating(true);
      try {
        const capturedAt = new Date().toISOString();
        const candidate = normalizeAiTranscript({
          text: pasteText,
          platform: pastePlatform,
          title: sessionTitle || undefined,
          projectId: view.project.id,
          sessionId: view.session.id,
          capturedAt,
        });
        const title = sessionTitle.trim() || candidate.events[0]?.title || "가져온 대화";
        // A pasted transcript carries no per-message timestamps, so the capture
        // time stands in for both ends of the window.
        importAndOpenAsNewSession({
          candidate,
          title,
          startedAt: capturedAt,
          endedAt: capturedAt,
          projectLabel: projectName || undefined,
          recordingMode: "summary",
        });
        setCurrentView("evidence");
      } catch {
        setCreating(false);
      }
    }
  }

  const resolvedName = sessionTitle.trim()
    ? sessionTitle.trim()
    : method === "records" && !selectedDetected
      ? "대화 선택 필요"
      : "무제 Mori 세션";

  const createTitle = canCreate
    ? undefined
    : !selectedAgent
      ? "AI 에이전트를 먼저 선택하세요."
      : !method
        ? "대화를 가져올 방법을 선택하세요."
        : !projectName.trim()
          ? "프로젝트를 선택하거나 새 프로젝트를 만드세요."
        : method === "records" && !selectedDetected
          ? "불러올 대화를 선택하세요."
          : method === "paste" && pasteText.trim().length === 0
            ? "붙여넣을 대화 내용을 입력하세요."
            : !selectedEngine
              ? "분석 엔진을 선택하세요."
              : undefined;

  return (
    <PageShell
      className="start-session-page"
      aside={
        <SessionSummary
          agent={selectedAgent}
          method={method}
          sessionName={resolvedName}
          projectName={projectName}
          engine={selectedEngine}
          storageTarget={storageTarget}
          createAction={
            <Button
              variant="primary"
              icon={FilePlus2}
              onClick={() => void handleCreate()}
              disabled={!canCreate || creating}
              title={createTitle}
            >
              {creating ? "생성 중..." : "세션 생성"}
            </Button>
          }
        />
      }
    >
      <FieldBlock number="1" title="에이전트">
        <div className="pick-grid">
          {AGENT_OPTIONS.map((agent) => (
            <PickTile
              key={agent.id}
              icon={agent.icon}
              title={agent.name}
              selected={selectedAgentId === agent.id}
              onSelect={() => chooseAgent(agent.id)}
            />
          ))}
        </div>
      </FieldBlock>

      <FieldBlock number="2" title="대화" subtitle="이 세션의 대화를 어떻게 준비할까요?">
        {selectedAgent ? (
          <>
            <div className="pick-grid">
              <PickTile
                icon={History}
                title="기록에서 불러오기"
                recommended={selectedAgent.detect}
                disabled={!selectedAgent.detect}
                status={selectedAgent.detect ? undefined : "곧"}
                selected={method === "records"}
                onSelect={() => chooseMethod("records")}
              />
              <PickTile
                icon={ClipboardPaste}
                title="붙여넣기"
                selected={method === "paste"}
                onSelect={() => chooseMethod("paste")}
              />
              <PickTile
                icon={FilePlus2}
                title="빈 세션으로 시작"
                selected={method === "fresh"}
                onSelect={() => chooseMethod("fresh")}
              />
            </div>

            {method === "records" ? (
              <div className="method-detail">
                {selectedDetected ? (
                  <div className="records-chosen">
                    <span className="records-chosen-icon" aria-hidden="true">
                      <History size={16} />
                    </span>
                    <span className="records-chosen-main">
                      <strong>{selectedDetected.title}</strong>
                      <span>
                        {shortProjectLabel(selectedDetected.projectName)} · 메시지{" "}
                        {selectedDetected.messageCount} ·{" "}
                        {formatClaudeRelativeKo(selectedDetected.startedAt)}
                      </span>
                    </span>
                    <Button variant="secondary" onClick={() => setBrowseOpen(true)}>
                      다시 고르기
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="records-browse-btn"
                    onClick={() => setBrowseOpen(true)}
                  >
                    <History size={16} aria-hidden="true" />
                    <span>기록에서 불러오기</span>
                  </button>
                )}
              </div>
            ) : null}

            {method === "paste" ? (
              <div className="method-detail">
                <textarea
                  className="start-paste-text"
                  value={pasteText}
                  placeholder={`${selectedAgent.name} 대화를 붙여넣으세요. User: / Assistant: 형식이면 턴을 자동으로 나눕니다.`}
                  onChange={(event) => setPasteText(event.target.value)}
                />
                <p className="start-import-note">
                  붙여넣은 텍스트만 사용합니다. Mori가 브라우저나 앱을 들여다보지 않습니다.
                </p>
              </div>
            ) : null}

            {method === "fresh" ? (
              <div className="method-detail">
                <p className="start-import-note">
                  대화는 {selectedAgent.name}에서 직접 하면 됩니다. 빈 세션을 만들어 두면, 작업한
                  대화를 나중에 소스에서 가져와 채울 수 있습니다.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="start-import-note">위에서 AI 에이전트를 먼저 선택하세요.</p>
        )}
      </FieldBlock>

      <FieldBlock
        number="3"
        title="분석 엔진"
        subtitle="대화를 분석할 엔진을 선택합니다."
        hint={
          <InfoHint label="분석 엔진 설명">
            <strong>규칙 기반</strong> · 네트워크 없이 기기에서 도는 휴리스틱. 빠르고 비공개이지만 요약은 단순합니다.
            <br />
            <strong>Ollama</strong> · 기기에서 도는 로컬 LLM 런타임. 비공개로 더 풍부하게 요약합니다.
            <br />
            <strong>OpenAI 호환</strong> · OpenAI 형식 API(로컬 또는 원격). 원격 주소면 자료가 외부로 전송될 수 있습니다.
          </InfoHint>
        }
      >
        <div className="pick-grid engine-pick-grid">
          {engineOptions.map((option) => (
            <EngineTile
              key={option.provider}
              option={option}
              selected={selectedEngineProvider === option.provider}
              onSelect={() => {
                if (!option.selectable) return;
                // Re-selecting clears the choice, matching the agent and method
                // tiles above so every setup step toggles the same way.
                setSelectedEngineProvider((current) =>
                  current === option.provider ? null : option.provider,
                );
              }}
            />
          ))}
        </div>
        <div className="start-engine-footer">
          <button
            type="button"
            className="start-engine-settings"
            onClick={() => openSettingsSheet("localAi")}
          >
            <Settings2 size={13} aria-hidden="true" />
            설정
          </button>
        </div>
      </FieldBlock>

      <FieldBlock number="4" title="세션 정보" subtitle="프로젝트와 이름을 정합니다.">
        <div className="session-info-fields">
          <div className="session-project-line">
            <div className="form-field">
              <span className="form-field-label">프로젝트</span>
              <BaseSelect
                value={projectChoice}
                options={projectOptions}
                placeholder="프로젝트 선택"
                onChange={setProjectChoice}
              />
            </div>
            <Button
              variant="secondary"
              icon={FolderGit2}
              className="session-project-create"
              onClick={() => openNewProjectModal(projectCreateInitialName)}
            >
              새 프로젝트
            </Button>
          </div>
          <label>
            세션 이름
            <input
              value={sessionTitle}
              placeholder={
                method === "records"
                  ? "대화 제목에서 자동 입력"
                  : "예: Mori 앱 기획"
              }
              onChange={(event) => setSessionTitle(event.target.value)}
            />
          </label>
        </div>
      </FieldBlock>

      {browseOpen && selectedAgent ? (
        <DetectedConversationsModal
          agentName={selectedAgent.name}
          agentId={selectedAgent.agentId}
          supported={selectedAgent.detect}
          initialSelectedFilePath={selectedDetected?.filePath ?? null}
          onPick={pickDetected}
          onClose={() => setBrowseOpen(false)}
        />
      ) : null}
      {projectModalOpen ? (
        <ProjectFormModal
          mode="create"
          initialName={projectCreateInitialName}
          onSubmit={handleCreateProject}
          onClose={() => setProjectModalOpen(false)}
        />
      ) : null}
    </PageShell>
  );
}

/** Last path segment of a folder path: "C:\\dev\\tcc-ng-gw" → "tcc-ng-gw". */
function lastFolderName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.split(/[\\/]/).filter(Boolean).pop() ?? trimmed;
}

function FieldBlock({
  number,
  title,
  subtitle,
  hint,
  children,
}: {
  number: string;
  title: string;
  subtitle?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="setup-block">
      <header>
        <span className="setup-block-num">{number}</span>
        <div>
          <h2 className="setup-block-title">
            {title}
            {hint}
          </h2>
          {subtitle ? <p className="setup-block-sub">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * A selectable tile for an agent or an import method. Neutral by default; the
 * selected state carries the brand's lavender fill + purple ring (the same
 * accent the active nav uses), and a filled radio dot rather than a checkmark.
 * A planned method renders disabled with a neutral 곧 badge.
 */
function PickTile({
  icon: Icon,
  title,
  detail,
  selected,
  recommended,
  disabled,
  status,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  selected: boolean;
  recommended?: boolean;
  disabled?: boolean;
  status?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`pick-tile${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="pick-tile-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="pick-tile-body">
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
      {status ? (
        <Badge tone="gray">{status}</Badge>
      ) : (
        <span className="pick-tile-side">
          {recommended ? <em className="pick-tile-rec">추천</em> : null}
          <span className={`pick-mark${selected ? " is-selected" : ""}`} aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

/** Per-engine glyphs, matching Settings → 분석 엔진 for cross-surface identity. */
const ENGINE_ICON: Partial<Record<LlmProvider, LucideIcon>> = {
  deterministic: Sparkles,
  ollama: Bot,
  openAiCompatible: Code2,
};

function EngineTile({
  option,
  selected,
  onSelect,
}: {
  option: StartSessionEngineOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const disabled = !option.selectable;
  const Icon = ENGINE_ICON[option.provider] ?? Cpu;
  return (
    <button
      type="button"
      className={`pick-tile engine-pick-tile${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      title={disabled ? option.disabledReason : undefined}
      onClick={onSelect}
    >
      <span className="pick-tile-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="pick-tile-body">
        <strong>{option.label}</strong>
      </span>
      <span className={`pick-mark${selected ? " is-selected" : ""}`} aria-hidden="true" />
    </button>
  );
}

/**
 * A small styled single-select. The native <select> popup is OS-painted and
 * reads as a default form control; this keeps the closed and open states in
 * Mori's own surface language (a button trigger + a lavender-highlighted
 * listbox), closing on outside-click or Escape.
 */
function BaseSelect({
  value,
  options,
  placeholder = "선택",
  onChange,
}: {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // When the menu opens, move focus to the selected option so arrow keys take
  // over immediately and Escape returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(".base-select-option");
    if (!buttons?.length) return;
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    buttons[index]?.focus();
  }, [open, options, value]);

  function close(focusTrigger: boolean) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>(".base-select-option") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[Math.min(buttons.length - 1, index + 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[Math.max(0, index - 1)]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }

  const current = options.find((option) => option.value === value);

  return (
    <div className={`base-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="base-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{current?.label ?? placeholder}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="base-select-menu" role="listbox" ref={listRef} onKeyDown={onMenuKeyDown}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`base-select-option${selected ? " is-selected" : ""}`}
                  disabled={option.disabled}
                  title={option.title}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    close(true);
                  }}
                >
                  <span>{option.label}</span>
                  {selected ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function SessionSummary({
  agent,
  method,
  sessionName,
  projectName,
  engine,
  storageTarget,
  createAction,
}: {
  agent: AgentOption | null;
  method: ImportMethod | null;
  sessionName: string;
  projectName: string;
  engine: StartSessionEngineOption | null;
  storageTarget: SessionStorageTarget;
  createAction: ReactNode;
}) {
  return (
    <InspectorPanel
      ariaLabel="세션 요약"
      title="세션 요약"
      footer={
        <div className="start-summary-footer">
          <Lock size={15} aria-hidden="true" />
          <span>기록은 이 기기에만 저장됩니다</span>
        </div>
      }
    >
      <SummarySectionTitle>세션 구성</SummarySectionTitle>
      <SummaryRow label="에이전트" value={agent?.name ?? "미선택"} muted={!agent} />
      <SummaryRow label="가져오기 방식" value={methodLabel(method)} muted={!method} />
      <SummaryRow label="세션 이름" value={sessionName} />
      <SummaryRow label="프로젝트" value={projectName || "프로젝트 선택 필요"} muted={!projectName} />
      <hr />
      <SummarySectionTitle>분석 및 보관</SummarySectionTitle>
      <SummaryRow
        label="분석 엔진"
        value={engine ? engineSummaryLabel(engine) : "미선택"}
        muted={!engine}
      />
      <SummaryRow label="보관 위치" value={storageTarget.label} />
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
      <span>{label}</span>
      <b className={accent ? "accent" : muted ? "muted" : ""} title={value}>
        {value}
      </b>
    </div>
  );
}

function SummarySectionTitle({ children }: { children: ReactNode }) {
  return <div className="summary-section-title">{children}</div>;
}

function engineSummaryLabel(engine: StartSessionEngineOption): string {
  return engine.label;
}

/** Distinct existing project keys, derived from stored/demo sessions + user-created projects. */
function gatherExistingProjects(userProjects: UserProject[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const project of userProjects) {
    const key = project.key.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  for (const summary of safeListSessions()) {
    const label = (summary.sourceLabel ?? "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function safeListSessions() {
  try {
    return mergeDemoSessionSummaries(loadStoredSessionSummaries());
  } catch {
    return mergeDemoSessionSummaries([]);
  }
}

/**
 * Window for an imported Claude conversation: start is the recorded start, end
 * is the last timestamped message. Both fall back to `capturedAt`.
 */
function deriveConversationWindow(
  detail: { startedAt?: string; messages: Array<{ createdAt?: string }> },
  capturedAt: string,
): { startedAt: string; endedAt: string } {
  const startedAt = detail.startedAt?.trim() || capturedAt;
  let endedAt = startedAt;
  for (const message of detail.messages) {
    const stamp = message.createdAt?.trim();
    if (stamp) endedAt = stamp;
  }
  return { startedAt, endedAt };
}
