import {
  AlertCircle,
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
  FolderGit2,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import { ActionBar } from "../../components/layout/ActionBar";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
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
import { loadStoredSessionSummaries } from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import type { StoredSessionDraft } from "../../lib/storage/storageTypes";
import type { AiTranscriptPlatform } from "../../lib/import";
import type { LlmProvider, RecordingMode, SourceOption } from "../../domain/types";
import {
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriReviewStore } from "../../app/reviewStore";
import { useMoriAppStore } from "../../app/store";
import {
  discoverClaudeCodeSessions,
  formatClaudeRelativeKo,
  getClaudeCodeSession,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import { buildImportCandidateFromClaudeCodeSession } from "../../lib/claude/claudeImport";
import type { ClaudeCodeSessionMeta } from "../../lib/claude/types";

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
const NEW_PROJECT_VALUE = "__new__";

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
 * 새 세션 — a single, fully-visible creation page (the cloud "인스턴스 생성"
 * pattern). Every section is shown at once on the left; the right rail
 * summarises what will be created and carries the one create action. Importing
 * an existing conversation happens inline: detected work sessions are grouped
 * by project, the user selects one, and the single "세션 생성" action creates
 * the session from it. Nothing navigates away, nothing is pre-selected.
 */
export function StartSessionView() {
  const storeDraft = useMoriSessionStore((state) => state.draft);
  const mode = useMoriSessionStore(selectSessionMode);
  const view = useMoriSessionStore(selectSessionView);
  const importAsNewSession = useMoriSessionStore((state) => state.importAsNewSession);
  const setSessionDraft = useMoriSessionStore((state) => state.setDraft);
  const resetSessionToDemo = useMoriSessionStore((state) => state.resetToDemo);
  const startReview = useMoriReviewStore((state) => state.startReview);
  const setCurrentView = useMoriAppStore((state) => state.navigate);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [method, setMethod] = useState<StartMethod | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [selectedDetected, setSelectedDetected] = useState<ClaudeCodeSessionMeta | null>(null);
  const [creating, setCreating] = useState(false);
  const [engineProvider, setEngineProvider] = useState<LlmProvider>(
    () => getDefaultStartSessionEngineOption().provider,
  );

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const storageTarget = useMemo<SessionStorageTarget>(
    () => describeSessionStorageTarget({ isDesktop: isTauriRuntime() }),
    [],
  );
  const recordingMode: RecordingMode = "summary";

  const existingProjects = useMemo(() => gatherExistingProjects(), []);
  const [projectChoice, setProjectChoice] = useState<string>(
    () => existingProjects[0] ?? NEW_PROJECT_VALUE,
  );
  const [newProjectName, setNewProjectName] = useState("");
  const projectName = projectChoice === NEW_PROJECT_VALUE ? newProjectName : projectChoice;

  const selectedEngine =
    ENGINE_OPTIONS.find(
      (engine) => engine.provider === coerceStartSessionEngineProvider(engineProvider),
    ) ?? getDefaultStartSessionEngineOption();

  const selectedAgent = AGENT_OPTIONS.find((agent) => agent.id === selectedAgentId) ?? null;

  // The single create action covers both methods: a new conversation creates
  // the container; an imported one creates the session from the picked
  // conversation. So it enables once the method's required input is present.
  const canCreate =
    (method === "new" && Boolean(selectedAgent)) ||
    (method === "import" && Boolean(selectedDetected));

  function selectDetected(meta: ClaudeCodeSessionMeta) {
    setSelectedDetected((current) => (current?.filePath === meta.filePath ? null : meta));
    // Filing the import under the conversation's own project keeps the work
    // where it belongs; the user can still change it.
    if (existingProjects.includes(meta.projectName)) setProjectChoice(meta.projectName);
  }

  async function handleCreate() {
    if (creating) return;
    if (method === "new" && selectedAgent) {
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
      return;
    }
    if (method === "import" && selectedDetected) {
      setCreating(true);
      try {
        const detail = await getClaudeCodeSession(selectedDetected.filePath);
        const capturedAt = new Date().toISOString();
        const candidate = buildImportCandidateFromClaudeCodeSession(detail, {
          projectId: view.project.id,
          sessionId: view.session.id,
          capturedAt,
        });
        const { startedAt, endedAt } = deriveConversationWindow(detail, capturedAt);
        const { candidate: rebound } = importAsNewSession({
          candidate,
          title: detail.title,
          startedAt,
          endedAt,
          projectLabel: projectName || detail.projectName || undefined,
        });
        startReview(rebound, "ai-transcript");
        setCurrentView("evidence");
      } catch {
        setCreating(false);
      }
    }
  }

  function handleResetToDemo() {
    resetSessionToDemo();
    setCurrentView("timeline");
  }
  function handleContinueSession() {
    setCurrentView("evidence");
  }

  const hasActiveSession = mode === "draft" && storeDraft !== null;
  const createTitle = canCreate
    ? undefined
    : !selectedAgent
      ? "AI 에이전트를 먼저 선택하세요."
      : !method
        ? "시작 방법을 선택하세요."
        : method === "import"
          ? "아래에서 가져올 대화를 선택하세요."
          : undefined;

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
          selectedConversationTitle={selectedDetected?.title ?? null}
          projectName={projectName}
          recordingMode={recordingMode}
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

      <FieldBlock number="1" title="AI 에이전트">
        <div className="agent-grid">
          {AGENT_OPTIONS.map((agent) => (
            <PickCard
              key={agent.id}
              icon={agent.icon}
              title={agent.name}
              detail={agent.detail}
              selected={selectedAgentId === agent.id}
              onSelect={() => {
                setSelectedAgentId((current) => (current === agent.id ? null : agent.id));
                setSelectedDetected(null);
              }}
            />
          ))}
        </div>
      </FieldBlock>

      <FieldBlock number="2" title="시작 방법">
        <div className="agent-grid start-method-grid">
          <PickCard
            icon={FilePlus2}
            title="새 대화 시작"
            detail="새 작업을 시작할 세션을 만듭니다."
            selected={method === "new"}
            onSelect={() => setMethod(method === "new" ? null : "new")}
          />
          <PickCard
            icon={Download}
            title="기존 대화 가져오기"
            detail="이미 한 대화를 골라 세션으로 가져옵니다."
            selected={method === "import"}
            onSelect={() => {
              setMethod(method === "import" ? null : "import");
              setSelectedDetected(null);
            }}
          />
        </div>

        {method === "import" ? (
          <DetectedSessionPicker
            agent={selectedAgent}
            selectedFilePath={selectedDetected?.filePath ?? null}
            onSelect={selectDetected}
          />
        ) : method === "new" ? (
          <p className="start-import-note">
            세션을 만든 뒤 {selectedAgent?.name ?? "에이전트"}에서 대화하면 Mori 캡처 훅이 기록한
            내용을 증거 탭에서 가져올 수 있습니다. Mori가 직접 대화를 진행하지는 않습니다.
          </p>
        ) : null}
      </FieldBlock>

      <FieldBlock number="3" title="세션 설정">
        <div className="form-row">
          <label>
            프로젝트
            <select
              value={projectChoice}
              onChange={(event) => setProjectChoice(event.target.value)}
            >
              {existingProjects.map((project) => (
                <option key={project} value={project}>
                  {shortProjectLabel(project)}
                </option>
              ))}
              <option value={NEW_PROJECT_VALUE}>+ 새 프로젝트</option>
            </select>
            {projectChoice === NEW_PROJECT_VALUE ? (
              <input
                className="start-new-project-input"
                value={newProjectName}
                placeholder="새 프로젝트 이름"
                onChange={(event) => setNewProjectName(event.target.value)}
              />
            ) : null}
          </label>
          <label>
            세션 이름
            {method === "import" ? (
              <input
                value={selectedDetected?.title ?? ""}
                placeholder="대화 제목에서 자동"
                disabled
              />
            ) : (
              <input
                value={sessionTitle}
                placeholder="예: Mori 앱 기획"
                onChange={(event) => setSessionTitle(event.target.value)}
              />
            )}
          </label>
        </div>
        <div className="start-engine-field">
          <span className="start-engine-label">로컬 AI 엔진 · Quick Pass 분석</span>
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
        </div>
      </FieldBlock>
    </PageShell>
  );
}

/**
 * Inline picker for an existing conversation, grouped by project then session.
 * Selecting a row highlights it and lifts the choice up; the actual create
 * happens through the right-rail "세션 생성" action. Direct paste is kept in the
 * codebase (the Import panel) but intentionally not surfaced here: pasted
 * transcripts are format-fragile and lossy, so the detected-session path leads.
 */
function DetectedSessionPicker({
  agent,
  selectedFilePath,
  onSelect,
}: {
  agent: AgentOption | null;
  selectedFilePath: string | null;
  onSelect: (meta: ClaudeCodeSessionMeta) => void;
}) {
  const bridge = isClaudeBridgeAvailable();
  const isClaude = agent?.platform === "claude";
  const [sessions, setSessions] = useState<ClaudeCodeSessionMeta[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const load = useCallback(async () => {
    if (!bridge || !isClaude) return;
    setStatus("loading");
    try {
      setSessions(await discoverClaudeCodeSessions());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [bridge, isClaude]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClaudeCodeSessionMeta[]>();
    for (const session of sessions) {
      const list = map.get(session.projectName) ?? [];
      list.push(session);
      map.set(session.projectName, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sessions]);

  if (!isClaude) {
    return (
      <p className="start-import-note">
        {agent?.name ?? "이 에이전트"}는 곧 작업 세션 자동 감지를 지원합니다.
      </p>
    );
  }
  if (!bridge) {
    return (
      <p className="start-import-note">
        데스크톱 앱에서 Claude 작업 세션을 자동으로 감지합니다.
      </p>
    );
  }
  if (status === "loading" || status === "idle") {
    return (
      <p className="start-import-note">
        <RefreshCw size={14} aria-hidden="true" className="start-import-spin" /> 작업 세션을 불러오는 중...
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="start-import-note">
        <AlertCircle size={14} aria-hidden="true" /> 작업 세션을 읽지 못했습니다.
      </p>
    );
  }
  if (sessions.length === 0) {
    return <p className="start-import-note">감지된 작업 세션이 없습니다.</p>;
  }

  return (
    <div className="start-detected" role="radiogroup" aria-label="가져올 작업 세션">
      {grouped.map(([project, projectSessions]) => (
        <section key={project} className="start-detected-group">
          <header className="start-detected-group-head">
            <FolderGit2 size={13} aria-hidden="true" />
            <strong title={project}>{shortProjectLabel(project)}</strong>
            <span>{projectSessions.length}</span>
          </header>
          <ul>
            {projectSessions.map((session) => {
              const selected = selectedFilePath === session.filePath;
              return (
                <li key={session.filePath}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`start-detected-row${selected ? " is-selected" : ""}`}
                    onClick={() => onSelect(session)}
                  >
                    <span className="start-detected-main">
                      <strong>{session.title}</strong>
                      <span className="start-detected-meta">
                        메시지 {session.messageCount} · {formatClaudeRelativeKo(session.startedAt)}
                      </span>
                    </span>
                    {selected ? (
                      <Check size={16} aria-hidden="true" className="start-detected-check" />
                    ) : (
                      <span className="checkbox" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FieldBlock({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="setup-block">
      <header>
        <span className="setup-block-num">{number}</span>
        <div>
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function PickCard({
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
  selectedConversationTitle,
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
  selectedConversationTitle: string | null;
  projectName: string;
  recordingMode: RecordingMode;
  engine: StartSessionEngineOption;
  storageTarget: SessionStorageTarget;
  createAction: ReactNode;
}) {
  const methodLabel =
    method === "new" ? "새 대화 시작" : method === "import" ? "기존 대화 가져오기" : "미선택";
  const nameValue =
    method === "import"
      ? selectedConversationTitle ?? "대화 선택 필요"
      : sessionTitle || "무제 Mori 세션";
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
      <SummaryRow
        label="세션 이름"
        value={nameValue}
        muted={method === "import" && !selectedConversationTitle}
      />
      <SummaryRow label="프로젝트" value={projectName || "무제 프로젝트"} />
      <hr />
      <SummaryRow
        label="AI 엔진"
        value={engine.model ? `${engine.label} (${engine.model})` : engine.label}
        accent
      />
      <SummaryRow label="저장 위치" value={storageTarget.label} />
      <SummaryRow label="원본 보관" value={describeRetentionFootprint(recordingMode)} />
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

/** Distinct existing project labels, derived from stored + demo sessions. */
function gatherExistingProjects(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
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
