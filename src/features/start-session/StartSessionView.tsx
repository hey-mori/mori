import {
  AlertCircle,
  ArrowRight,
  Braces,
  Check,
  ClipboardPaste,
  Code2,
  FilePlus2,
  FolderGit2,
  Globe,
  Lock,
  Plug,
  Radar,
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
 * A Mori session *is* one AI-agent conversation (the spine); the surrounding
 * Git / terminal / notes are evidence (ribs). So the only question this screen
 * really asks is: **where does this session's conversation come from?** That
 * single "시작점" decision replaces the old agent × method matrix. Three
 * source-of-conversation paths, all resolved inline on this one page:
 *
 *   1. 감지된 작업 세션  · desktop auto-association from Claude Code records (추천)
 *   2. 대화 붙여넣기      · universal fallback for agents Mori cannot detect
 *                          (ChatGPT / Codex / OpenCode / Claude Desktop · Web)
 *   3. 빈 세션 먼저       · anchor first; Mori never drives the agent, the user
 *                          works in the agent and the conversation arrives later
 *
 * Planned import surfaces (Desktop / Web export, Codex detection, MCP) appear
 * as honest inspect-only cards that never open a flow. Engine selection lives
 * in settings, not here. Picking an LLM before a conversation exists is
 * premature; the summary shows the default and links to settings.
 */

type AgentOption = {
  id: string;
  name: string;
  detail: string;
  icon: LucideIcon;
  platform: AiTranscriptPlatform;
};

/** Agents that can anchor a brand-new (empty) session. */
const AGENT_OPTIONS: AgentOption[] = [
  { id: "opt-claude", name: "Claude", detail: "Claude Code · Desktop · Web", icon: Sparkles, platform: "claude" },
  { id: "opt-codex", name: "Codex", detail: "Codex CLI", icon: Code2, platform: "codex" },
  { id: "opt-opencode", name: "OpenCode", detail: "OpenCode CLI", icon: Braces, platform: "other" },
];

type PastePlatform = { value: AiTranscriptPlatform; label: string };
const PASTE_PLATFORMS: PastePlatform[] = [
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "codex", label: "Codex" },
  { value: "other", label: "기타 (OpenCode 등)" },
];

type RetentionOption = { mode: RecordingMode; label: string; detail: string };
const RETENTION_OPTIONS: RetentionOption[] = [
  { mode: "summary", label: "요약 보관", detail: "기본 · 원본은 짧게만" },
  { mode: "full", label: "전체 보관", detail: "원본 전체 · 공간 많이" },
  { mode: "ephemeral", label: "리포트만", detail: "임시 · 원본 자동 삭제" },
];

type PlannedSurface = { icon: LucideIcon; title: string; detail: string };
const PLANNED_SURFACES: PlannedSurface[] = [
  { icon: Globe, title: "Claude Desktop · Web 내보내기", detail: "내보낸 대화 파일을 세션으로" },
  { icon: Code2, title: "Codex 작업 세션 감지", detail: "Codex CLI 기록 자동 연결" },
  { icon: Plug, title: "MCP 컨텍스트 연결", detail: "에이전트가 Mori를 직접 호출" },
];

type StartPoint = "detected" | "paste" | "empty";
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

function startPointLabel(startPoint: StartPoint | null): string {
  if (startPoint === "detected") return "감지된 작업 세션";
  if (startPoint === "paste") return "대화 붙여넣기";
  if (startPoint === "empty") return "빈 세션 먼저";
  return "미선택";
}

function pastePlatformLabel(platform: AiTranscriptPlatform): string {
  return PASTE_PLATFORMS.find((p) => p.value === platform)?.label ?? "AI";
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

  const [startPoint, setStartPoint] = useState<StartPoint | null>(null);
  const [emptyAgentId, setEmptyAgentId] = useState<string | null>(null);
  const [selectedDetected, setSelectedDetected] = useState<ClaudeCodeSessionMeta | null>(null);
  const [pastePlatform, setPastePlatform] = useState<AiTranscriptPlatform>("claude");
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

  const selectedEmptyAgent = AGENT_OPTIONS.find((agent) => agent.id === emptyAgentId) ?? null;

  // The single create action covers every path. It enables once the chosen
  // start-point has the input it needs: a picked conversation, pasted text, or
  // an anchor agent.
  const canCreate =
    (startPoint === "detected" && Boolean(selectedDetected)) ||
    (startPoint === "paste" && pasteText.trim().length > 0) ||
    (startPoint === "empty" && Boolean(selectedEmptyAgent));

  function chooseStartPoint(next: StartPoint) {
    setStartPoint((current) => (current === next ? null : next));
    // Switching start-points clears the previous path's sub-selections so the
    // summary + create action never reflect a path the user moved away from.
    setSelectedDetected(null);
    setEmptyAgentId(null);
    setPasteText("");
  }

  function selectDetected(meta: ClaudeCodeSessionMeta) {
    setSelectedDetected((current) => (current?.filePath === meta.filePath ? null : meta));
    // Filing the import under the conversation's own project keeps the work
    // where it belongs; the user can still change it.
    if (existingProjects.includes(meta.projectName)) setProjectChoice(meta.projectName);
  }

  async function handleCreate() {
    if (creating || !canCreate) return;

    if (startPoint === "empty" && selectedEmptyAgent) {
      const draft = createSessionDraft({
        sessionTitle: sessionTitle || "제목 없는 세션",
        projectName: projectName || "제목 없는 프로젝트",
        selectedSources: [agentSourceOption(selectedEmptyAgent)],
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

    if (startPoint === "detected" && selectedDetected) {
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

    if (startPoint === "paste" && pasteText.trim()) {
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

  const spineLabel =
    startPoint === "detected"
      ? selectedDetected
        ? `Claude · ${shortProjectLabel(selectedDetected.projectName)}`
        : "Claude Code 세션 선택 필요"
      : startPoint === "paste"
        ? `${pastePlatformLabel(pastePlatform)} 붙여넣기${pasteText.trim() ? "" : " · 내용 필요"}`
        : startPoint === "empty"
          ? selectedEmptyAgent
            ? `${selectedEmptyAgent.name} · 빈 세션`
            : "에이전트 선택 필요"
          : "미선택";

  const resolvedName =
    startPoint === "detected"
      ? selectedDetected?.title ?? "대화 선택 필요"
      : sessionTitle.trim() || "무제 Mori 세션";

  const createTitle = canCreate
    ? undefined
    : !startPoint
      ? "시작점을 먼저 선택하세요."
      : startPoint === "detected"
        ? "가져올 작업 세션을 선택하세요."
        : startPoint === "paste"
          ? "붙여넣을 대화 내용을 입력하세요."
          : "에이전트를 선택하세요.";

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
          startPoint={startPoint}
          spineLabel={spineLabel}
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

      <FieldBlock number="1" title="시작점" subtitle="이 세션의 대화를 어디서 가져올지 정합니다.">
        <div className="startpoint-grid">
          <StartPointCard
            icon={Radar}
            title="감지된 작업 세션"
            detail="Claude Code 기록에서 자동 연결"
            badge="추천"
            selected={startPoint === "detected"}
            onSelect={() => chooseStartPoint("detected")}
          />
          <StartPointCard
            icon={ClipboardPaste}
            title="대화 붙여넣기"
            detail="ChatGPT · Codex · Desktop 등 감지 밖 대화"
            selected={startPoint === "paste"}
            onSelect={() => chooseStartPoint("paste")}
          />
          <StartPointCard
            icon={FilePlus2}
            title="빈 세션 먼저"
            detail="대화 전에 앵커만 만들어 둡니다"
            selected={startPoint === "empty"}
            onSelect={() => chooseStartPoint("empty")}
          />
        </div>

        {startPoint === "detected" ? (
          <DetectedSessionPicker
            selectedFilePath={selectedDetected?.filePath ?? null}
            onSelect={selectDetected}
          />
        ) : null}

        {startPoint === "paste" ? (
          <div className="startpoint-detail start-paste">
            <label className="start-paste-platform">
              플랫폼
              <select
                value={pastePlatform}
                onChange={(event) => setPastePlatform(event.target.value as AiTranscriptPlatform)}
              >
                {PASTE_PLATFORMS.map((platform) => (
                  <option key={platform.value} value={platform.value}>
                    {platform.label}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="start-paste-text"
              value={pasteText}
              placeholder="대화 내용을 붙여넣으세요. User: / Assistant: 형식이면 턴을 자동으로 나눕니다."
              onChange={(event) => setPasteText(event.target.value)}
            />
            <p className="start-import-note">
              수동 붙여넣기 전용. Claude · ChatGPT · Codex 직접 연동은 계획 단계입니다. Mori는
              브라우저 탭이나 앱을 자동으로 스캔하지 않습니다.
            </p>
          </div>
        ) : null}

        {startPoint === "empty" ? (
          <div className="startpoint-detail">
            <p className="start-import-note">
              Mori는 대화를 대신 시작하지 않습니다. 빈 세션을 만들어 두면, 선택한 에이전트에서
              작업한 뒤 캡처 훅이나 가져오기로 그 대화를 증거 탭에 채울 수 있습니다.
            </p>
            <div className="agent-grid">
              {AGENT_OPTIONS.map((agent) => (
                <PickCard
                  key={agent.id}
                  icon={agent.icon}
                  title={agent.name}
                  detail={agent.detail}
                  selected={emptyAgentId === agent.id}
                  onSelect={() =>
                    setEmptyAgentId((current) => (current === agent.id ? null : agent.id))
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </FieldBlock>

      <FieldBlock number="2" title="세션 정보">
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
            {startPoint === "detected" ? (
              <input
                value={selectedDetected?.title ?? ""}
                placeholder="대화 제목에서 자동"
                disabled
              />
            ) : (
              <input
                value={sessionTitle}
                placeholder={startPoint ? "예: Mori 앱 기획" : "시작점을 먼저 선택하세요"}
                disabled={!startPoint}
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
          {startPoint === "detected" || startPoint === "paste" ? (
            <p className="start-import-note">
              가져온 대화 원본 전체는 저장되지 않고 요약과 메타데이터만 남습니다. 보관 정책은 이후
              세션에 붙는 증거에 적용됩니다.
            </p>
          ) : null}
        </div>
      </FieldBlock>

      <FieldBlock
        number="3"
        title="곧 지원"
        subtitle="아직 연결되지 않은 가져오기 경로입니다. 살펴보기 전용."
      >
        <div className="startpoint-grid is-planned">
          {PLANNED_SURFACES.map((surface) => (
            <PlannedCard
              key={surface.title}
              icon={surface.icon}
              title={surface.title}
              detail={surface.detail}
            />
          ))}
        </div>
      </FieldBlock>
    </PageShell>
  );
}

/**
 * Inline picker for a detected Claude Code work session, grouped by project
 * then session. Detection is desktop-only and Claude-only today (the
 * `~/.claude` records bridge); in browser mode this renders an honest note
 * rather than a fake list. Selecting a row lifts the choice up; the actual
 * create happens through the right-rail "세션 생성" action.
 */
function DetectedSessionPicker({
  selectedFilePath,
  onSelect,
}: {
  selectedFilePath: string | null;
  onSelect: (meta: ClaudeCodeSessionMeta) => void;
}) {
  const bridge = isClaudeBridgeAvailable();
  const [sessions, setSessions] = useState<ClaudeCodeSessionMeta[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const load = useCallback(async () => {
    if (!bridge) return;
    setStatus("loading");
    try {
      setSessions(await discoverClaudeCodeSessions());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [bridge]);

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

  if (!bridge) {
    return (
      <p className="start-import-note">
        데스크톱 앱에서 Claude 작업 세션을 자동으로 감지합니다. 브라우저에서는 대화 붙여넣기를
        사용하세요.
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

/** A start-point card: the primary "where does the conversation come from" pick. */
function StartPointCard({
  icon: Icon,
  title,
  detail,
  badge,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  badge?: string;
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
      {selected ? (
        <Check size={17} />
      ) : badge ? (
        <Badge tone="purple">{badge}</Badge>
      ) : (
        <span className="checkbox" />
      )}
    </button>
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

/** Inspect-only card for a planned import surface. Never opens a flow. */
function PlannedCard({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="planned-card" aria-disabled="true">
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <Badge tone="gray">곧</Badge>
    </div>
  );
}

function SessionSummary({
  savedDraft,
  startPoint,
  spineLabel,
  sessionName,
  projectName,
  retention,
  engine,
  storageTarget,
  onChangeEngine,
  createAction,
}: {
  savedDraft: StoredSessionDraft | null;
  startPoint: StartPoint | null;
  spineLabel: string;
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
      <SummaryRow label="시작점" value={startPointLabel(startPoint)} muted={!startPoint} />
      <SummaryRow label="대화 출처" value={spineLabel} muted={!startPoint} />
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
