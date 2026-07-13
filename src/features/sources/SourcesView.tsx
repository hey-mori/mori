import {
  Bot,
  Braces,
  CheckCircle2,
  Code2,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  History,
  Infinity,
  MessageSquare,
  MousePointer2,
  Package,
  Plug,
  RefreshCw,
  Rocket,
  Sparkles,
  Terminal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import {
  loadConnectorImportHistorySavedSessionsAsync,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import {
  formatConnectorFamily,
  formatInboxFileSize,
  formatInboxModifiedAt,
  isTauriRuntime,
  listConnectorJsonlInbox,
  readConnectorJsonlFile,
  type ConnectorInboxListing,
} from "../../lib/desktop";
import {
  buildSourceWorkspace,
  type SourceWorkspaceCategory,
  type SourceWorkspaceSource,
} from "../../lib/sources/sourceWorkspace";
import {
  ANCHOR_AGENT_IDS,
  buildSourceProviderGroups,
  type SourceProvider,
  type SourceProviderMethod,
} from "../../lib/sources/sourceProviderGroups";
import type { AgentWorkAgentId } from "../../lib/agents/agentRegistry";
import {
  buildConnectorJsonlPreviewWithHistory,
  getConnectorSetupGuide,
  type CaptureSurfaceId,
} from "../../lib/connectors";
import {
  connectClaudeHook,
  loadConnectorStatus,
  uninstallClaudeHook,
  type ConnectorStatusViewModel,
} from "../../lib/connectors/installers";
import { findConnectStatusForProvider } from "../../lib/sources/sourceConnectStatus";
import {
  buildSourceInboxHint,
  describeSourceInboxFreshness,
  getInboxFamiliesForProvider,
  type SourceInboxFreshness,
  type SourceInboxHint,
} from "../../lib/sources/sourceInboxHints";
import { ConnectorSetupGuidePanel } from "./ConnectorSetupGuide";

/**
 * 소스 — the connect-your-work overview.
 *
 * The canvas is a calm grid of *providers* (Claude / ChatGPT / Codex /
 * OpenCode anchor sessions; Git / 터미널 / 메모 / URL attach evidence). It
 * answers "what can I connect" at a glance and nothing more — every detail
 * (the ways in, what Mori reads, the import action) lives in the right
 * inspector for the selected provider, so the overview never turns into a
 * wall of rows.
 */

const CATEGORY_LABEL: Record<SourceWorkspaceCategory, string> = {
  AI: "AI 에이전트",
  Code: "코드 에이전트",
  Git: "Git",
  Terminal: "터미널",
  Docs: "문서",
  Design: "디자인",
  "Issue Tracker": "이슈",
  Manual: "직접 입력",
  URL: "URL",
  Future: "지원 예정",
};

const CATEGORY_ICON: Record<SourceWorkspaceCategory, LucideIcon> = {
  AI: Bot,
  Code: Code2,
  Git: GitBranch,
  Terminal,
  Docs: FileText,
  Design: Braces,
  "Issue Tracker": CheckCircle2,
  Manual: FileText,
  URL: Globe,
  Future: Package,
};

/** Provider-specific glyphs win over the generic category icon when known. */
const PROVIDER_ICON: Record<string, LucideIcon> = {
  claude: Sparkles,
  chatgpt: MessageSquare,
  codex: Code2,
  opencode: Braces,
  antigravity: Rocket,
  continue: Infinity,
  cline: Bot,
  cursor: MousePointer2,
  git: GitBranch,
  terminal: Terminal,
  note: FileText,
  url: Globe,
  connector: Package,
  document: FileText,
  ide: Code2,
  browser: Globe,
  mcp: Plug,
};

function providerIcon(provider: SourceProvider): LucideIcon {
  return PROVIDER_ICON[provider.id] ?? CATEGORY_ICON[provider.category];
}

type SourceInboxFreshnessCheck =
  | SourceInboxFreshness
  | {
      status: "loading";
      tone: "blue";
      label: string;
      detail: string;
    }
  | {
      status: "error";
      tone: "red";
      label: string;
      detail: string;
    };

function providerMatchesQuery(provider: SourceProvider, needle: string): boolean {
  if (!needle) return true;
  if (provider.name.toLowerCase().includes(needle)) return true;
  return provider.methods.some((method) => {
    const source = method.source;
    return [
      method.methodLabel,
      method.connectLabel,
      source.name,
      source.acceptedFormats.join(" "),
      source.privacyNote,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function flattenProviders(groups: ReturnType<typeof buildSourceProviderGroups>): SourceProvider[] {
  return [...groups.agents, ...groups.evidence, ...groups.planned];
}

export function SourcesView() {
  const draft = useSessionStore((state) => state.draft);
  const sessionView = useSessionStore(selectSessionView);
  const requestEvidenceImport = useAppStore((state) => state.requestEvidenceImport);
  const openSettingsSheet = useAppStore((state) => state.openSettingsSheet);
  const requestStartRecords = useAppStore((state) => state.requestStartRecords);
  const desktop = isTauriRuntime();
  const hasActiveSession = Boolean(draft);

  const workspace = useMemo(
    () => buildSourceWorkspace({ isDesktop: desktop, hasActiveSession }),
    [desktop, hasActiveSession],
  );
  const groups = useMemo(() => buildSourceProviderGroups(workspace), [workspace]);
  const allProviders = useMemo(() => flattenProviders(groups), [groups]);
  const allMethods = useMemo(
    () => allProviders.flatMap((provider) => provider.methods),
    [allProviders],
  );

  const defaultSelectedId =
    groups.agents[0]?.methods[0]?.source.id ??
    allMethods[0]?.source.id ??
    "";
  const [connectModels, setConnectModels] = useState<ConnectorStatusViewModel[] | null>(null);
  const [connectorInbox, setConnectorInbox] = useState<ConnectorInboxListing | null>(null);
  const [connectorInboxBusy, setConnectorInboxBusy] = useState(false);
  const [connectorInboxStatus, setConnectorInboxStatus] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);
  const [inboxFreshnessByPath, setInboxFreshnessByPath] = useState<
    Record<string, SourceInboxFreshnessCheck>
  >({});
  const [selectedId, setSelectedId] = useState(defaultSelectedId);
  // Anchor agents open on their canonical way-in (기록에서 불러오기); every other
  // provider, and ChatGPT, opens on its first import method.
  const [recordsMode, setRecordsMode] = useState(() =>
    ANCHOR_AGENT_IDS.has(groups.agents[0]?.id ?? ""),
  );
  const [query, setQuery] = useState("");

  // Live connection status for anchor agents. In browser mode the adapter
  // returns the honest desktop-only model, so the inspector never invents a
  // connected state. Reloaded when the 연동 설정 modal closes after a change.
  const reloadConnectStatus = useCallback(() => {
    void loadConnectorStatus().then(setConnectModels);
  }, []);
  useEffect(() => {
    reloadConnectStatus();
  }, [reloadConnectStatus]);

  const refreshConnectorInbox = useCallback(async () => {
    if (!desktop) {
      setConnectorInboxStatus({
        tone: "info",
        message: "Connector inbox는 Mori 데스크톱 앱에서만 파일 목록을 읽습니다.",
      });
      return;
    }
    setConnectorInboxBusy(true);
    setConnectorInboxStatus({ tone: "info", message: "Inbox 새로고침 중..." });
    try {
      const listing = await listConnectorJsonlInbox();
      setConnectorInbox(listing);
      setConnectorInboxStatus({
        tone: "info",
        message: listing.rootExists
          ? `${listing.files.length}개 파일을 찾았습니다.`
          : "아직 ~/.mori/connectors/ 폴더가 없습니다.",
      });
    } catch (caught) {
      setConnectorInboxStatus({
        tone: "error",
        message: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setConnectorInboxBusy(false);
    }
  }, [desktop]);

  const checkConnectorInboxFile = useCallback(
    async (file: { path: string; displayName: string }) => {
      if (!desktop) {
        setConnectorInboxStatus({
          tone: "info",
          message: "새 이벤트 확인은 Mori 데스크톱 앱에서만 파일을 읽을 수 있습니다.",
        });
        return;
      }
      setInboxFreshnessByPath((prev) => ({
        ...prev,
        [file.path]: {
          status: "loading",
          tone: "blue",
          label: "확인 중",
          detail: "파일을 읽어 새 이벤트와 이미 가져온 이벤트를 계산합니다.",
        },
      }));
      try {
        const result = await readConnectorJsonlFile(file.path);
        const savedSessions = await loadConnectorImportHistorySavedSessionsAsync({
          excludeSessionId: draft?.session.id ?? null,
        });
        const preview = buildConnectorJsonlPreviewWithHistory(result.text, {
          activeSession: sessionView,
          savedSessions,
        });
        const freshness = describeSourceInboxFreshness(preview);
        setInboxFreshnessByPath((prev) => ({ ...prev, [file.path]: freshness }));
      } catch (caught) {
        setInboxFreshnessByPath((prev) => ({
          ...prev,
          [file.path]: {
            status: "error",
            tone: "red",
            label: "확인 실패",
            detail: caught instanceof Error ? caught.message : String(caught),
          },
        }));
      }
    },
    [desktop, draft?.session.id, sessionView],
  );

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () => ({
      agents: groups.agents.filter((p) => providerMatchesQuery(p, needle)),
      evidence: groups.evidence.filter((p) => providerMatchesQuery(p, needle)),
      planned: groups.planned.filter((p) => providerMatchesQuery(p, needle)),
    }),
    [groups, needle],
  );

  // The inspector follows the selected method across the full (unfiltered) set
  // so a search that hides the selected tile never blanks the rail.
  const selectedMethod =
    allMethods.find((method) => method.source.id === selectedId) ?? allMethods[0];
  const selectedProvider =
    allProviders.find((provider) =>
      provider.methods.some((method) => method.source.id === selectedMethod?.source.id),
    ) ?? allProviders[0];

  const hasResults =
    filtered.agents.length + filtered.evidence.length + filtered.planned.length > 0;

  const providerIsAnchor = ANCHOR_AGENT_IDS.has(selectedProvider?.id ?? "");
  const recordsSelected = recordsMode && providerIsAnchor;
  const selectedInboxFamilies = selectedProvider
    ? getInboxFamiliesForProvider(selectedProvider.id)
    : [];
  const selectedInboxHint = useMemo(
    () =>
      selectedProvider && connectorInbox
        ? buildSourceInboxHint(selectedProvider.id, connectorInbox)
        : null,
    [connectorInbox, selectedProvider],
  );

  // Selecting a provider tile resets to its canonical way-in: records for an
  // anchor agent, the first import method otherwise.
  function selectProvider(sourceId: string) {
    setSelectedId(sourceId);
    const provider = allProviders.find((p) =>
      p.methods.some((m) => m.source.id === sourceId),
    );
    setRecordsMode(provider ? ANCHOR_AGENT_IDS.has(provider.id) : false);
  }

  function runSourceAction(source: SourceWorkspaceSource) {
    if (source.action.kind === "import") {
      requestEvidenceImport(source.action.importKind);
      return;
    }
    if (source.action.kind === "settings") {
      openSettingsSheet("storage");
    }
  }

  return (
    <PageShell
      className="sources-page"
      maxWidth="full"
      actionBar={
        <ActionBar
          label="연동"
          start={
            <ToolbarSearch
              value={query}
              onChange={setQuery}
              placeholder=""
              ariaLabel="소스 검색"
            />
          }
        />
      }
      aside={
        selectedProvider && selectedMethod ? (
          <SourceInspector
            provider={selectedProvider}
            method={selectedMethod}
            recordsSelected={recordsSelected}
            connectStatus={
              connectModels
                ? findConnectStatusForProvider(selectedProvider.id, connectModels)
                : null
            }
            inboxAvailable={desktop}
            inboxFamilies={selectedInboxFamilies}
            inboxHint={selectedInboxHint}
            inboxBusy={connectorInboxBusy}
            inboxStatus={connectorInboxStatus}
            inboxFreshnessByPath={inboxFreshnessByPath}
            onReloadConnectStatus={reloadConnectStatus}
            onRefreshInbox={() => void refreshConnectorInbox()}
            onCheckInboxFile={(file) => void checkConnectorInboxFile(file)}
            onOpenConnectorImport={() => requestEvidenceImport("connector")}
            onSelectMethod={(id) => {
              setSelectedId(id);
              setRecordsMode(false);
            }}
            onSelectRecords={providerIsAnchor ? () => setRecordsMode(true) : undefined}
            onAction={() => runSourceAction(selectedMethod.source)}
            onBrowseRecords={
              providerIsAnchor
                ? // providerIsAnchor guarantees the id is an anchor agent id
                  // (ANCHOR_AGENT_IDS = the agent registry), so the start view
                  // opens the records browser scoped to the picked agent.
                  () => requestStartRecords(selectedProvider.id as AgentWorkAgentId)
                : undefined
            }
          />
        ) : null
      }
    >
      {hasResults ? (
        <>
          <RoleGroup
            title="에이전트"
            providers={filtered.agents}
            selectedId={selectedMethod?.source.id ?? ""}
            onSelect={selectProvider}
          />
          <RoleGroup
            title="자료"
            providers={filtered.evidence}
            selectedId={selectedMethod?.source.id ?? ""}
            onSelect={selectProvider}
          />
          <PlannedRow
            providers={filtered.planned}
            selectedId={selectedMethod?.source.id ?? ""}
            onSelect={selectProvider}
          />
        </>
      ) : (
        <p className="sources-empty">검색 결과가 없습니다.</p>
      )}

    </PageShell>
  );
}

function RoleGroup({
  title,
  providers,
  selectedId,
  onSelect,
}: {
  title: string;
  providers: SourceProvider[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (providers.length === 0) return null;
  return (
    <section className="sources-group" aria-label={title}>
      <header className="sources-group-head">
        <h2>{title}</h2>
      </header>
      <div className="sources-tiles">
        {providers.map((provider) => (
          <ProviderTile
            key={provider.id}
            provider={provider}
            active={provider.methods.some((method) => method.source.id === selectedId)}
            onSelect={() => {
              const first = provider.methods[0];
              if (first) onSelect(first.source.id);
            }}
          />
        ))}
      </div>
    </section>
  );
}

function ProviderTile({
  provider,
  active,
  onSelect,
}: {
  provider: SourceProvider;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = providerIcon(provider);
  return (
    <button
      type="button"
      className={`sources-tile pick-tile${active ? " is-active is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={provider.name}
    >
      <span className="sources-tile-icon pick-tile-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="sources-tile-body pick-tile-body">
        <strong className="sources-tile-name">{provider.name}</strong>
      </span>
      <span className="pick-tile-side">
        {provider.recommended ? <em className="pick-tile-rec">추천</em> : null}
        <span className={`pick-mark${active ? " is-selected" : ""}`} aria-hidden="true" />
      </span>
    </button>
  );
}

function PlannedRow({
  providers,
  selectedId: _selectedId,
  onSelect: _onSelect,
}: {
  providers: SourceProvider[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (providers.length === 0) return null;
  return (
    <section className="sources-group sources-planned-group" aria-label="지원 예정">
      <header className="sources-group-head">
        <h2>확장 예정</h2>
        <span>아직 선택할 수 없는 항목</span>
      </header>
      <div className="sources-planned-chips">
        {providers.map((provider) => {
          const Icon = providerIcon(provider);
          return (
            <span
              key={provider.id}
              className="sources-planned-chip"
            >
              <Icon size={13} aria-hidden="true" />
              <span>{provider.name}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Inspector copy for the 기록에서 불러오기 way-in: an anchor agent's detected
 * local work records. It reads the same conversation content as a pasted
 * transcript, behind the same Import Review gate, only the acquisition differs.
 */
function recordsDetail(agentName: string) {
  return {
    canAccess: [
      "감지된 작업 대화 (제목 · 프로젝트 · 시각)",
      "대화 미리보기 (턴 · 코드블록 · 모델)",
      "요약과 메타데이터",
    ],
    cannotAccess: ["계정 · API 접근", "백그라운드 감시 · 자동 수집", "원본 대화 전체 보관"],
    formats: ["데스크톱 자동 감지 (로컬 작업 기록)"],
    note: `감지한 ${agentName} 대화는 세션 생성 후 Import Review를 거쳐 타임라인에 반영됩니다.`,
  };
}

function displayMethodLabel(entry: SourceProviderMethod): string {
  const id = entry.source.id;
  if (id === "manualNote") return "메모 추가";
  if (id === "urlImport") return "URL 추가";
  if (id === "gitDiffPaste" || id === "tauriGitDiff") return "변경 내용 추가";
  if (id === "connectorJsonl" || id === "localCaptureBridge") return "파일에서 가져오기";
  if (
    id === "aiTranscriptPaste" ||
    id === "chatgptTranscript" ||
    id.endsWith("Transcript")
  ) {
    return "직접 추가";
  }
  return entry.source.action.kind === "import" ? "가져오기" : "준비 중";
}

function SourceInspector({
  provider,
  method,
  recordsSelected,
  connectStatus,
  inboxAvailable,
  inboxFamilies,
  inboxHint,
  inboxBusy,
  inboxStatus,
  inboxFreshnessByPath,
  onReloadConnectStatus,
  onRefreshInbox,
  onCheckInboxFile,
  onOpenConnectorImport,
  onSelectMethod,
  onSelectRecords,
  onAction,
  onBrowseRecords,
}: {
  provider: SourceProvider;
  method: SourceProviderMethod;
  recordsSelected: boolean;
  /** Live connection status for an anchor agent, or null when none applies. */
  connectStatus: ConnectorStatusViewModel | null;
  inboxAvailable: boolean;
  inboxFamilies: string[];
  inboxHint: SourceInboxHint | null;
  inboxBusy: boolean;
  inboxStatus: { tone: "info" | "error"; message: string } | null;
  inboxFreshnessByPath: Record<string, SourceInboxFreshnessCheck>;
  /** Re-detect connection status after an inline connect / disconnect. */
  onReloadConnectStatus: () => void;
  onRefreshInbox: () => void;
  onCheckInboxFile: (file: { path: string; displayName: string }) => void;
  onOpenConnectorImport: () => void;
  onSelectMethod: (id: string) => void;
  /** Select the 기록에서 불러오기 way-in (anchor agents only). */
  onSelectRecords?: () => void;
  onAction: () => void;
  /** Run the work-record browser for the selected anchor agent. */
  onBrowseRecords?: () => void;
}) {
  const source = method.source;
  const Icon = providerIcon(provider);
  const detail = recordsSelected ? recordsDetail(provider.name) : null;
  // docs-template methods (Code 훅 / CLI 래퍼 / OpenCode / 터미널 브릿지 / MCP)
  // carry copyable in-app setup steps. The 기록에서 불러오기 way-in needs none.
  const setupGuide = recordsSelected
    ? null
    : getConnectorSetupGuide(source.id as CaptureSurfaceId);
  // An AI-category provider that attaches as evidence (ChatGPT, future pasted
  // transcripts) is not an agent; label it as a pasted conversation, not "AI 에이전트".
  const subtitle =
    provider.role === "evidence" && provider.category === "AI"
      ? "붙여넣은 AI 대화"
      : CATEGORY_LABEL[provider.category];
  return (
    <aside className="sources-inspector" aria-label="선택한 소스">
      <header className="sources-inspector-head">
        <span className="sources-inspector-icon">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>{provider.name}</h2>
          <p>{subtitle}</p>
        </div>
      </header>

      <InspectorBlock title="연동 방법" icon={Plug}>
        <ul className="sources-method-picker">
          {onSelectRecords ? (
            <li>
              <button
                type="button"
                className={`sources-method-pick pick-tile${recordsSelected ? " is-active is-selected" : ""}`}
                onClick={onSelectRecords}
                aria-pressed={recordsSelected}
                aria-label="기록에서 불러오기"
              >
                <span className="sources-method-icon" aria-hidden="true">
                  <History size={16} />
                </span>
                <span className="sources-method-pick-body">
                  <span className="sources-method-pick-label">기록에서 불러오기</span>
                  <span>이 에이전트의 로컬 작업 기록을 선택합니다</span>
                </span>
                <span className={`pick-mark${recordsSelected ? " is-selected" : ""}`} aria-hidden="true" />
              </button>
            </li>
          ) : null}
          {provider.methods.filter((entry) => entry.source.status === "available").map((entry) => {
            const selected = !recordsSelected && entry.source.id === source.id;
            const showStatus = entry.source.status !== "available";
            return (
              <li key={entry.source.id}>
                <button
                  type="button"
                  className={`sources-method-pick pick-tile${selected ? " is-active is-selected" : ""}`}
                  onClick={() => onSelectMethod(entry.source.id)}
                  aria-pressed={selected}
                  aria-label={displayMethodLabel(entry)}
                >
                  <span className="sources-method-icon" aria-hidden="true">
                    <Plug size={16} />
                  </span>
                  <span className="sources-method-pick-body">
                    <span className="sources-method-pick-label">{displayMethodLabel(entry)}</span>
                    <span>{entry.connectLabel}</span>
                  </span>
                  {showStatus ? (
                    <Badge tone={entry.source.statusTone}>{entry.source.statusLabel}</Badge>
                  ) : (
                    <span className={`pick-mark${selected ? " is-selected" : ""}`} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </InspectorBlock>

      {connectStatus ? (
        <ConnectStatusBlock status={connectStatus} onReload={onReloadConnectStatus} />
      ) : null}

      {false && inboxFamilies.length > 0 ? (
        <ConnectorInboxHintBlock
          available={inboxAvailable}
          families={inboxFamilies}
          hint={inboxHint}
          busy={inboxBusy}
          status={inboxStatus}
          freshnessByPath={inboxFreshnessByPath}
          onRefresh={onRefreshInbox}
          onCheckFile={onCheckInboxFile}
          onOpenImport={onOpenConnectorImport}
        />
      ) : null}

      <InspectorBlock title="세부 범위" icon={Database} collapsible>
        <div className="sources-scope-grid">
          <div>
            <h4>가져오는 정보</h4>
            <CheckList items={detail ? detail.canAccess : source.whatMoriCanAccess} tone="ok" />
          </div>
          <div>
            <h4>가져오지 않는 정보</h4>
            <CheckList items={detail ? detail.cannotAccess : source.whatMoriCannotAccess} tone="no" />
          </div>
        </div>
        <h4 className="sources-scope-format-title">지원 형식</h4>
        <ChipList items={detail ? detail.formats : source.acceptedFormats} />
      </InspectorBlock>

      {setupGuide ? (
        <InspectorBlock title="연결하기" icon={Plug} collapsible>
          <ConnectorSetupGuidePanel guide={setupGuide} />
        </InspectorBlock>
      ) : null}

      <div className="sources-inspector-actions">
        <p className="sources-inspector-note">{detail ? detail.note : source.reviewBehavior}</p>
        {recordsSelected ? (
          <Button variant="primary" icon={History} onClick={onBrowseRecords}>
            기록에서 불러오기
          </Button>
        ) : source.action.kind === "none" ? null : (
          <Button
            variant="primary"
            icon={source.action.kind === "settings" ? FolderOpen : Upload}
            disabled={!source.action.enabled}
            title={source.action.disabledReason ?? source.action.label}
            onClick={onAction}
          >
            {source.action.label}
          </Button>
        )}
      </div>
    </aside>
  );
}

/**
 * Live connection status for an anchor agent, shown inline in the inspector.
 * Read-only for session-discovery agents (Codex / Antigravity / Continue);
 * for the Claude config-hook it offers in-place 연결 / 연결 해제 driven by the
 * same safe installer engine the 연동 설정 modal uses. Desktop only, in browser
 * mode the status reads "데스크톱 앱에서만" and no action is offered.
 */
function ConnectStatusBlock({
  status,
  onReload,
}: {
  status: ConnectorStatusViewModel;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onReload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const isHook = status.captureModel === "config-hook";
  const connected = isHook && status.availability === "available";
  const presentation = connectorStatusPresentation(status);
  return (
    <InspectorBlock title="연결" icon={Plug}>
      <div className="sources-connect-status">
        <span className={`sources-connect-dot tone-${presentation.tone}`} aria-hidden="true" />
        <strong>{presentation.label}</strong>
        <span className="sources-connect-detail">{status.detail.join(" · ")}</span>
      </div>
      {connected ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => uninstallClaudeHook({ scope: "global" }))}
        >
          연결 해제
        </Button>
      ) : null}
      {isHook && status.canInstall ? (
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => connectClaudeHook({ scope: "global" }))}
        >
          연결
        </Button>
      ) : null}
      {error ? <p className="sources-connect-error">{error}</p> : null}
    </InspectorBlock>
  );
}

function connectorStatusPresentation(status: ConnectorStatusViewModel): {
  label: string;
  tone: "green" | "orange" | "blue" | "gray";
} {
  if (status.captureModel === "session-discovery") {
    if (status.availability === "available") return { label: "기록 감지됨", tone: "green" };
    if (status.availability === "partial") return { label: "기록 없음", tone: "orange" };
    if (status.availability === "desktopOnly") return { label: "데스크톱 필요", tone: "blue" };
    return { label: "감지 불가", tone: "gray" };
  }
  if (status.availability === "available") return { label: "연결됨", tone: "green" };
  if (status.availability === "requiresSetup") return { label: "연결 필요", tone: "orange" };
  if (status.availability === "desktopOnly") return { label: "데스크톱 필요", tone: "blue" };
  return { label: "연결 불가", tone: "gray" };
}

function ConnectorInboxHintBlock({
  available,
  families,
  hint,
  busy,
  status,
  freshnessByPath,
  onRefresh,
  onCheckFile,
  onOpenImport,
}: {
  available: boolean;
  families: string[];
  hint: SourceInboxHint | null;
  busy: boolean;
  status: { tone: "info" | "error"; message: string } | null;
  freshnessByPath: Record<string, SourceInboxFreshnessCheck>;
  onRefresh: () => void;
  onCheckFile: (file: { path: string; displayName: string }) => void;
  onOpenImport: () => void;
}) {
  const familyLabel = families.map(formatConnectorFamily).join(" · ");
  const hasFiles = Boolean(hint?.files.length);
  const hiddenCount = hint ? Math.max(0, hint.fileCount - hint.files.length) : 0;

  return (
    <InspectorBlock title="최근 수신" icon={Package}>
      <div className="sources-inbox-head">
        <span>{familyLabel}</span>
        <Button
          variant="ghost"
          size="sm"
          icon={RefreshCw}
          disabled={busy}
          onClick={onRefresh}
          title="Inbox 새로고침"
        />
      </div>

      {!available ? (
        <p className="sources-inbox-empty">
          데스크톱 앱에서만 <code>~/.mori/connectors/</code> 파일 목록을 읽습니다.
        </p>
      ) : hint ? (
        hint.rootExists ? (
          hasFiles ? (
            <>
              <ul className="sources-inbox-list">
                {hint.files.map((file) => {
                  const freshness = freshnessByPath[file.path] ?? null;
                  const checking = freshness?.status === "loading";
                  return (
                    <li key={file.path}>
                      <div className="sources-inbox-file-main">
                        <Badge tone="purple">{formatConnectorFamily(file.connectorFamily)}</Badge>
                        <strong title={file.path}>{file.displayName}</strong>
                      </div>
                      <div className="sources-inbox-file-meta">
                        <span>{formatInboxFileSize(file.sizeBytes)}</span>
                        <span>{formatInboxModifiedAt(file.modifiedAt)}</span>
                        <small>{file.relativePath}</small>
                      </div>
                      <div className="sources-inbox-file-freshness">
                        {freshness ? (
                          <Badge tone={freshness.tone} title={freshness.detail}>
                            {freshness.label}
                          </Badge>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={checking}
                          onClick={() => onCheckFile(file)}
                        >
                          {checking ? "확인 중..." : freshness ? "다시 확인" : "새 이벤트 확인"}
                        </Button>
                      </div>
                      {freshness ? (
                        <p className="sources-inbox-freshness-detail">{freshness.detail}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {hiddenCount > 0 ? (
                <p className="sources-inbox-empty">그 외 {hiddenCount}개 파일이 더 있습니다.</p>
              ) : null}
              <Button variant="secondary" size="sm" icon={Upload} onClick={onOpenImport}>
                Connector JSONL 가져오기
              </Button>
            </>
          ) : (
            <p className="sources-inbox-empty">
              해당 연동의 JSONL 파일은 아직 없습니다. 셋업 후 새로고침하세요.
            </p>
          )
        ) : (
          <p className="sources-inbox-empty">
            Mori는 <code>{hint.rootPath}</code> 아래의 JSONL만 읽습니다. 셋업이 완료되면 이
            폴더가 생성됩니다.
          </p>
        )
      ) : (
        <p className="sources-inbox-empty">
          새로고침을 누르면 최근 파일 메타데이터만 확인합니다. 파일 내용은 가져오기 단계에서
          읽습니다.
        </p>
      )}

      {status ? (
        <p className={`sources-inbox-status tone-${status.tone}`}>{status.message}</p>
      ) : null}
    </InspectorBlock>
  );
}

function InspectorBlock({
  title,
  icon: Icon,
  children,
  collapsible = false,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  /** Render as a collapsed-by-default disclosure (for long, optional detail). */
  collapsible?: boolean;
}) {
  if (collapsible) {
    return (
      <details className="sources-inspector-block is-collapsible">
        <summary>
          <h3>
            <Icon size={14} aria-hidden="true" />
            {title}
          </h3>
        </summary>
        {children}
      </details>
    );
  }
  return (
    <section className="sources-inspector-block">
      <h3>
        <Icon size={14} aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function CheckList({ items, tone }: { items: string[]; tone: "ok" | "no" }) {
  return (
    <ul className={`sources-check-list is-${tone}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="sources-chip-list">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
