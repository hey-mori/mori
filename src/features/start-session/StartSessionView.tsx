import {
  Bot,
  Braces,
  Check,
  ChevronDown,
  ClipboardPaste,
  Code2,
  Cpu,
  FilePlus2,
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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { InspectorPanel } from "../../components/layout/InspectorPanel";
import { ActionBar } from "../../components/layout/ActionBar";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { createSessionDraft } from "../../lib/session/createSessionDraft";
import {
  describeSessionStorageTarget,
  type SessionStorageTarget,
} from "../../lib/session/sessionStorageTarget";
import { resolveStartRecordsAgentId } from "../../lib/session/startRecordsAgent";
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
import { useReviewStore } from "../../app/reviewStore";
import { useAppStore } from "../../app/store";
import {
  formatClaudeRelativeKo,
} from "../../lib/claude/claudeTauri";
import {
  buildPrimaryImportCandidateFromAgentWorkSession,
  getAgentWorkSession,
  reviewOriginForAgentWorkSession,
  type AgentWorkAgentId,
  type AgentWorkSessionMeta,
} from "../../lib/agents/workSessions";
import {
  AGENT_REGISTRY,
  type AgentDescriptor,
  type AgentIconKey,
} from "../../lib/agents/agentRegistry";
import { DetectedConversationsModal } from "./DetectedConversationsModal";

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
const NEW_PROJECT_VALUE = "__new__";

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
  const importAsNewSession = useSessionStore((state) => state.importAsNewSession);
  const setSessionDraft = useSessionStore((state) => state.setDraft);
  const startReview = useReviewStore((state) => state.startReview);
  const setCurrentView = useAppStore((state) => state.navigate);
  const openSettingsSheet = useAppStore((state) => state.openSettingsSheet);
  const startRecordsRequest = useAppStore((state) => state.startRecordsRequest);
  const startRecordsAgentId = useAppStore((state) => state.startRecordsAgentId);
  const clearStartRecordsRequest = useAppStore((state) => state.clearStartRecordsRequest);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [method, setMethod] = useState<ImportMethod | null>(null);
  const [selectedDetected, setSelectedDetected] = useState<AgentWorkSessionMeta | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const storageTarget = useMemo<SessionStorageTarget>(
    () => describeSessionStorageTarget({ isDesktop: isTauriRuntime() }),
    [],
  );
  const engineOptions = useMemo(() => buildStartSessionEngineOptions(), []);
  // The engine starts unselected (미선택), like the agent and the import method:
  // the user picks it deliberately rather than inheriting a silent default.
  const [selectedEngineProvider, setSelectedEngineProvider] = useState<LlmProvider | null>(null);
  const selectedEngine = useMemo(
    () =>
      engineOptions.find(
        (option) => option.provider === selectedEngineProvider && option.selectable,
      ) ?? null,
    [engineOptions, selectedEngineProvider],
  );

  const existingProjects = useMemo(() => gatherExistingProjects(), []);
  const projectOptions = useMemo(
    () => [
      ...existingProjects.map((project) => ({ value: project, label: shortProjectLabel(project) })),
      { value: NEW_PROJECT_VALUE, label: "+ 새 프로젝트" },
    ],
    [existingProjects],
  );
  const [projectChoice, setProjectChoice] = useState<string>(
    () => existingProjects[0] ?? NEW_PROJECT_VALUE,
  );
  const [newProjectName, setNewProjectName] = useState("");
  const projectName = projectChoice === NEW_PROJECT_VALUE ? newProjectName : projectChoice;

  const selectedAgent = AGENT_OPTIONS.find((agent) => agent.id === selectedAgentId) ?? null;
  const pastePlatform: AiTranscriptPlatform = selectedAgent?.platform ?? "claude";

  // The single create action covers every method. It enables once the chosen
  // method has the input it needs.
  const canCreate =
    Boolean(selectedAgent) &&
    Boolean(selectedEngine) &&
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
    setMethod((current) => (current === next ? null : next));
    setSelectedDetected(null);
    setPasteText("");
  }

  function pickDetected(meta: AgentWorkSessionMeta) {
    setSelectedDetected(meta);
    // File the import under the conversation's own project; user can change it.
    if (existingProjects.includes(meta.projectName)) setProjectChoice(meta.projectName);
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
        const { candidate: rebound } = importAsNewSession({
          candidate,
          title: detail.title,
          startedAt,
          endedAt,
          projectLabel: projectName || detail.projectName || undefined,
          recordingMode: "summary",
        });
        startReview(rebound, reviewOriginForAgentWorkSession(detail));
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
        const { candidate: rebound } = importAsNewSession({
          candidate,
          title,
          startedAt: capturedAt,
          endedAt: capturedAt,
          projectLabel: projectName || undefined,
          recordingMode: "summary",
        });
        startReview(rebound, "ai-transcript");
        setCurrentView("evidence");
      } catch {
        setCreating(false);
      }
    }
  }

  const resolvedName =
    method === "records"
      ? selectedDetected?.title ?? "대화 선택 필요"
      : sessionTitle.trim() || "무제 Mori 세션";

  const createTitle = canCreate
    ? undefined
    : !selectedAgent
      ? "AI 에이전트를 먼저 선택하세요."
      : !method
        ? "대화를 가져올 방법을 선택하세요."
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
      actionBar={<ActionBar label="새 세션" />}
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
      <FieldBlock number="1" title="에이전트" subtitle="어떤 AI 에이전트로 한 작업인가요?">
        <div className="pick-grid">
          {AGENT_OPTIONS.map((agent) => (
            <PickTile
              key={agent.id}
              icon={agent.icon}
              title={agent.name}
              detail={agent.detail}
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
                detail={
                  selectedAgent.detect
                    ? "에이전트 작업 기록에서 자동으로 찾습니다"
                    : `${selectedAgent.name} 기록 자동 감지는 준비 중입니다`
                }
                recommended={selectedAgent.detect}
                disabled={!selectedAgent.detect}
                status={selectedAgent.detect ? undefined : "곧"}
                selected={method === "records"}
                onSelect={() => chooseMethod("records")}
              />
              <PickTile
                icon={ClipboardPaste}
                title="붙여넣기"
                detail="대화를 복사해 직접 붙여넣습니다"
                selected={method === "paste"}
                onSelect={() => chooseMethod("paste")}
              />
              <PickTile
                icon={FilePlus2}
                title="빈 세션으로 시작"
                detail="지금부터 할 작업을 위한 세션"
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
                  대화를 나중에 자료 탭에서 가져와 채울 수 있습니다.
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
        subtitle="대화를 분석할 로컬 AI 엔진을 선택합니다."
      >
        <div className="pick-grid">
          {engineOptions.map((option) => (
            <PickTile
              key={option.provider}
              icon={Cpu}
              title={engineSummaryLabel(option)}
              detail={option.detail}
              disabled={!option.selectable}
              status={option.selectable ? undefined : option.statusLabel}
              selected={selectedEngineProvider === option.provider}
              onSelect={() => setSelectedEngineProvider(option.provider)}
            />
          ))}
        </div>
        <button
          type="button"
          className="start-engine-settings"
          onClick={() => openSettingsSheet("localAi")}
        >
          <Settings2 size={13} aria-hidden="true" />
          설정에서 endpoint와 모델을 구성
        </button>
      </FieldBlock>

      <FieldBlock number="4" title="세션 정보" subtitle="프로젝트와 이름을 정합니다.">
        <div className="form-row">
          <div className="form-field">
            <span className="form-field-label">프로젝트</span>
            <BaseSelect value={projectChoice} options={projectOptions} onChange={setProjectChoice} />
            {projectChoice === NEW_PROJECT_VALUE ? (
              <input
                className="start-new-project-input"
                value={newProjectName}
                placeholder="새 프로젝트 이름"
                onChange={(event) => setNewProjectName(event.target.value)}
              />
            ) : null}
          </div>
          <label>
            세션 이름
            {method === "records" ? (
              <input value={selectedDetected?.title ?? ""} placeholder="대화 제목에서 자동" disabled />
            ) : (
              <input
                value={sessionTitle}
                placeholder={method ? "예: Mori 앱 기획" : "방법을 먼저 선택하세요"}
                disabled={!method}
                onChange={(event) => setSessionTitle(event.target.value)}
              />
            )}
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
    </PageShell>
  );
}

function FieldBlock({
  number,
  title,
  subtitle,
  children,
}: {
  number: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="setup-block">
      <header>
        <span className="setup-block-num">{number}</span>
        <div>
          <h2>{title}</h2>
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
  detail: string;
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
        <strong>
          {title}
          {recommended ? <em className="pick-tile-rec">추천</em> : null}
        </strong>
        <span>{detail}</span>
      </span>
      {status ? (
        <Badge tone="gray">{status}</Badge>
      ) : (
        <span className={`pick-mark${selected ? " is-selected" : ""}`} aria-hidden="true" />
      )}
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
  onChange,
}: {
  value: string;
  options: SelectOption[];
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
        <span>{current?.label ?? "선택"}</span>
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
          <span>요약·메타데이터만 로컬에 저장하고, Cloud API는 켤 때만 사용합니다.</span>
        </div>
      }
    >
      <SummarySectionTitle>세션 구성</SummarySectionTitle>
      <SummaryRow label="에이전트" value={agent?.name ?? "미선택"} muted={!agent} />
      <SummaryRow label="가져오기 방식" value={methodLabel(method)} muted={!method} />
      <SummaryRow label="세션 이름" value={sessionName} />
      <SummaryRow label="프로젝트" value={projectName || "무제 프로젝트"} />
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
  return engine.model ? `${engine.label} (${engine.model})` : engine.label;
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
