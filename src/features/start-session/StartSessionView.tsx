import {
  AlertCircle,
  ArrowRight,
  Braces,
  ClipboardPaste,
  Code2,
  FilePlus2,
  FolderGit2,
  History,
  Lock,
  RefreshCw,
  Settings2,
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
  getDefaultStartSessionEngineOption,
  type StartSessionEngineOption,
} from "../../lib/session/startSessionEngineOptions";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import { loadStoredSessionSummaries } from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import type { StoredSessionDraft } from "../../lib/storage/storageTypes";
import { normalizeAiTranscript, type AiTranscriptPlatform } from "../../lib/import";
import type { RecordingMode, SourceOption } from "../../domain/types";
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
 *   3. 세션 정보 — project, name, retention.
 *
 * Import-method availability is agent-scoped and honest: record detection is
 * real for Claude today and shown as 곧 for agents that do not have it yet, so
 * the screen never hardcodes "Claude Code" as the only source. Engine choice
 * lives in settings; the summary shows the default with a 변경 link.
 */

type AgentOption = {
  id: string;
  name: string;
  detail: string;
  icon: LucideIcon;
  platform: AiTranscriptPlatform;
  /** Whether Mori can auto-detect this agent's work records today. */
  detect: boolean;
};

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: "opt-claude",
    name: "Claude",
    detail: "Claude Code · Desktop · Web",
    icon: Sparkles,
    platform: "claude",
    detect: true,
  },
  { id: "opt-codex", name: "Codex", detail: "Codex CLI", icon: Code2, platform: "codex", detect: false },
  {
    id: "opt-opencode",
    name: "OpenCode",
    detail: "OpenCode CLI",
    icon: Braces,
    platform: "other",
    detect: false,
  },
];

type ImportMethod = "records" | "paste" | "fresh";
const NEW_PROJECT_VALUE = "__new__";

type RetentionOption = { mode: RecordingMode; label: string; detail: string };
const RETENTION_OPTIONS: RetentionOption[] = [
  { mode: "summary", label: "요약 보관", detail: "기본 · 원본은 짧게만" },
  { mode: "full", label: "전체 보관", detail: "원본 전체 · 공간 많이" },
  { mode: "ephemeral", label: "리포트만", detail: "임시 · 원본 자동 삭제" },
];

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
  const storeDraft = useMoriSessionStore((state) => state.draft);
  const mode = useMoriSessionStore(selectSessionMode);
  const view = useMoriSessionStore(selectSessionView);
  const importAsNewSession = useMoriSessionStore((state) => state.importAsNewSession);
  const setSessionDraft = useMoriSessionStore((state) => state.setDraft);
  const resetSessionToDemo = useMoriSessionStore((state) => state.resetToDemo);
  const startReview = useMoriReviewStore((state) => state.startReview);
  const setCurrentView = useMoriAppStore((state) => state.navigate);
  const openSettingsSheet = useMoriAppStore((state) => state.openSettingsSheet);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [method, setMethod] = useState<ImportMethod | null>(null);
  const [selectedDetected, setSelectedDetected] = useState<ClaudeCodeSessionMeta | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [retention, setRetention] = useState<RecordingMode>("summary");
  const [creating, setCreating] = useState(false);

  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const storageTarget = useMemo<SessionStorageTarget>(
    () => describeSessionStorageTarget({ isDesktop: isTauriRuntime() }),
    [],
  );
  const selectedEngine = useMemo(() => getDefaultStartSessionEngineOption(), []);

  const existingProjects = useMemo(() => gatherExistingProjects(), []);
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

  function selectDetected(meta: ClaudeCodeSessionMeta) {
    setSelectedDetected((current) => (current?.filePath === meta.filePath ? null : meta));
    // File the import under the conversation's own project; user can change it.
    if (existingProjects.includes(meta.projectName)) setProjectChoice(meta.projectName);
  }

  async function handleCreate() {
    if (creating || !canCreate || !selectedAgent) return;

    if (method === "fresh") {
      const draft = createSessionDraft({
        sessionTitle: sessionTitle || "제목 없는 세션",
        projectName: projectName || "제목 없는 프로젝트",
        selectedSources: [agentSourceOption(selectedAgent)],
        recordingMode: retention,
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
          recordingMode: retention,
        });
        startReview(rebound, "ai-transcript");
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
          recordingMode: retention,
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

  const sourceValue =
    method === "records"
      ? selectedDetected
        ? `${shortProjectLabel(selectedDetected.projectName)} · ${selectedDetected.title}`
        : "대화 선택 필요"
      : method === "paste"
        ? pasteText.trim()
          ? "붙여넣은 대화"
          : "내용 필요"
        : method === "fresh"
          ? "새 작업 (대화는 이후 가져오기)"
          : "미선택";

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
        : method === "records"
          ? "불러올 대화를 선택하세요."
          : method === "paste"
            ? "붙여넣을 대화 내용을 입력하세요."
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
          sourceValue={sourceValue}
          sessionName={resolvedName}
          projectName={projectName}
          retention={retention}
          engine={selectedEngine}
          storageTarget={storageTarget}
          onChangeEngine={() => openSettingsSheet("localAi")}
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
              <DetectedSessionPicker
                agentName={selectedAgent.name}
                supported={selectedAgent.detect}
                selectedFilePath={selectedDetected?.filePath ?? null}
                onSelect={selectDetected}
              />
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
                  수동 붙여넣기 전용입니다. Mori는 브라우저 탭이나 앱을 자동으로 스캔하지 않습니다.
                </p>
              </div>
            ) : null}

            {method === "fresh" ? (
              <div className="method-detail">
                <p className="start-import-note">
                  Mori는 대화를 대신 시작하지 않습니다. 빈 세션을 만들어 두면, {selectedAgent.name}
                  에서 작업한 뒤 캡처 훅이나 가져오기로 그 대화를 증거 탭에 채울 수 있습니다.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="start-import-note">위에서 AI 에이전트를 먼저 선택하세요.</p>
        )}
      </FieldBlock>

      <FieldBlock number="3" title="세션 정보" subtitle="프로젝트와 보관 방식을 정합니다.">
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
            {method === "records" ? (
              <input
                value={selectedDetected?.title ?? ""}
                placeholder="대화 제목에서 자동"
                disabled
              />
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

        <div className="start-retention">
          <span className="start-field-label">보관 정책</span>
          <div className="retention-options">
            {RETENTION_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                aria-pressed={retention === option.mode}
                className={`retention-option${retention === option.mode ? " selected" : ""}`}
                onClick={() => setRetention(option.mode)}
              >
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </button>
            ))}
          </div>
          {method === "records" || method === "paste" ? (
            <p className="start-import-note">
              가져온 대화 원본 전체는 저장되지 않고 요약과 메타데이터만 남습니다. 보관 정책은 이후
              세션에 붙는 증거에 적용됩니다.
            </p>
          ) : null}
        </div>
      </FieldBlock>
    </PageShell>
  );
}

/**
 * Inline picker for an agent's detected work sessions, grouped by project then
 * session. Detection is desktop-only and real for Claude today; for an agent
 * without detection, or in browser mode, this renders an honest note instead
 * of a fake list. Selecting a row lifts the choice up; the actual create
 * happens through the right-rail "세션 생성" action.
 */
function DetectedSessionPicker({
  agentName,
  supported,
  selectedFilePath,
  onSelect,
}: {
  agentName: string;
  supported: boolean;
  selectedFilePath: string | null;
  onSelect: (meta: ClaudeCodeSessionMeta) => void;
}) {
  const bridge = isClaudeBridgeAvailable();
  const [sessions, setSessions] = useState<ClaudeCodeSessionMeta[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const load = useCallback(async () => {
    if (!bridge || !supported) return;
    setStatus("loading");
    try {
      setSessions(await discoverClaudeCodeSessions());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [bridge, supported]);

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

  if (!supported) {
    return (
      <p className="start-import-note">{agentName} 작업 기록 자동 감지는 준비 중입니다.</p>
    );
  }
  if (!bridge) {
    return (
      <p className="start-import-note">
        데스크톱 앱에서 {agentName} 작업 기록을 자동으로 감지합니다. 브라우저에서는 붙여넣기를
        사용하세요.
      </p>
    );
  }
  if (status === "loading" || status === "idle") {
    return (
      <p className="start-import-note">
        <RefreshCw size={14} aria-hidden="true" className="start-import-spin" /> 작업 기록을 불러오는 중...
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="start-import-note">
        <AlertCircle size={14} aria-hidden="true" /> 작업 기록을 읽지 못했습니다.
      </p>
    );
  }
  if (sessions.length === 0) {
    return <p className="start-import-note">감지된 대화가 없습니다.</p>;
  }

  return (
    <div className="start-detected" role="radiogroup" aria-label="불러올 대화">
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
                    <span
                      className={`pick-mark${selected ? " is-selected" : ""}`}
                      aria-hidden="true"
                    />
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

function SessionSummary({
  savedDraft,
  agent,
  method,
  sourceValue,
  sessionName,
  projectName,
  retention,
  engine,
  storageTarget,
  onChangeEngine,
  createAction,
}: {
  savedDraft: StoredSessionDraft | null;
  agent: AgentOption | null;
  method: ImportMethod | null;
  sourceValue: string;
  sessionName: string;
  projectName: string;
  retention: RecordingMode;
  engine: StartSessionEngineOption;
  storageTarget: SessionStorageTarget;
  onChangeEngine: () => void;
  createAction: ReactNode;
}) {
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
      <SummaryRow label="에이전트" value={agent?.name ?? "미선택"} muted={!agent} />
      <SummaryRow label="가져오기 방식" value={methodLabel(method)} muted={!method} />
      <SummaryRow label="대화 출처" value={sourceValue} muted={!method} />
      <SummaryRow label="세션 이름" value={sessionName} />
      <SummaryRow label="프로젝트" value={projectName || "무제 프로젝트"} />
      <hr />
      <div className="summary-row">
        <span />
        <span>분석 엔진</span>
        <b className="accent">
          {engine.model ? `${engine.label} (${engine.model})` : engine.label}
          <button type="button" className="start-engine-change" onClick={onChangeEngine}>
            <Settings2 size={12} aria-hidden="true" /> 변경
          </button>
        </b>
      </div>
      <SummaryRow label="보관 위치" value={storageTarget.label} />
      <SummaryRow label="보관 정책" value={describeRetentionFootprint(retention)} />
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
