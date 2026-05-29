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
  Lock,
  MessageSquare,
  Package,
  Plug,
  Rocket,
  Sparkles,
  Terminal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ActionBar } from "../../components/layout/ActionBar";
import { PageShell } from "../../components/layout/PageShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { useSessionStore } from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { isTauriRuntime } from "../../lib/desktop";
import { formatDateTime } from "../../lib/formatting/time";
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
import type { StoredSessionImport } from "../../lib/storage/storageTypes";
import { ConnectorStatusPanel } from "./ConnectorStatusPanel";

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
  const imports = useSessionStore((state) => state.imports);
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
  const [selectedId, setSelectedId] = useState(defaultSelectedId);
  // Anchor agents open on their canonical way-in (기록에서 불러오기); every other
  // provider, and ChatGPT, opens on its first import method.
  const [recordsMode, setRecordsMode] = useState(() =>
    ANCHOR_AGENT_IDS.has(groups.agents[0]?.id ?? ""),
  );
  const [query, setQuery] = useState("");

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
      openSettingsSheet("repositories");
    }
  }

  return (
    <PageShell
      className="sources-page"
      maxWidth="detail"
      actionBar={
        <ActionBar
          label="연결"
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
            onSelectMethod={(id) => {
              setSelectedId(id);
              setRecordsMode(false);
            }}
            onSelectRecords={providerIsAnchor ? () => setRecordsMode(true) : undefined}
            onAction={() => runSourceAction(selectedMethod.source)}
            onBrowseRecords={providerIsAnchor ? requestStartRecords : undefined}
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

      <ConnectorStatusPanel />

      {imports.length > 0 ? <RecentImports imports={imports} /> : null}
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
      className={`sources-tile${active ? " is-active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="sources-tile-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <strong className="sources-tile-name">{provider.name}</strong>
    </button>
  );
}

function PlannedRow({
  providers,
  selectedId,
  onSelect,
}: {
  providers: SourceProvider[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (providers.length === 0) return null;
  return (
    <section className="sources-group" aria-label="지원 예정">
      <header className="sources-group-head">
        <h2>예정</h2>
      </header>
      <div className="sources-planned-chips">
        {providers.map((provider) => {
          const Icon = providerIcon(provider);
          const firstId = provider.methods[0]?.source.id;
          const active = provider.methods.some((method) => method.source.id === selectedId);
          return (
            <button
              key={provider.id}
              type="button"
              className={`sources-planned-chip${active ? " is-selected" : ""}`}
              onClick={() => firstId && onSelect(firstId)}
            >
              <Icon size={13} aria-hidden="true" />
              <span>{provider.name}</span>
            </button>
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

function SourceInspector({
  provider,
  method,
  recordsSelected,
  onSelectMethod,
  onSelectRecords,
  onAction,
  onBrowseRecords,
}: {
  provider: SourceProvider;
  method: SourceProviderMethod;
  recordsSelected: boolean;
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

      <InspectorBlock title="연결 방법" icon={Plug}>
        <ul className="sources-method-picker">
          {onSelectRecords ? (
            <li>
              <button
                type="button"
                className={`sources-method-pick${recordsSelected ? " is-active" : ""}`}
                onClick={onSelectRecords}
                aria-pressed={recordsSelected}
              >
                <span className="sources-method-pick-label">기록에서 불러오기</span>
              </button>
            </li>
          ) : null}
          {provider.methods.map((entry) => {
            const selected = !recordsSelected && entry.source.id === source.id;
            const showStatus = entry.source.status !== "available";
            return (
              <li key={entry.source.id}>
                <button
                  type="button"
                  className={`sources-method-pick${selected ? " is-active" : ""}`}
                  onClick={() => onSelectMethod(entry.source.id)}
                  aria-pressed={selected}
                >
                  <span className="sources-method-pick-label">{entry.methodLabel}</span>
                  {showStatus ? (
                    <Badge tone={entry.source.statusTone}>{entry.source.statusLabel}</Badge>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </InspectorBlock>

      <InspectorBlock title="읽는 것" icon={Database}>
        <CheckList items={detail ? detail.canAccess : source.whatMoriCanAccess} tone="ok" />
      </InspectorBlock>

      <InspectorBlock title="읽지 않는 것" icon={Lock}>
        <CheckList items={detail ? detail.cannotAccess : source.whatMoriCannotAccess} tone="no" />
      </InspectorBlock>

      <InspectorBlock title="지원 형식" icon={FileText}>
        <ChipList items={detail ? detail.formats : source.acceptedFormats} />
      </InspectorBlock>

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

function InspectorBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
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

function RecentImports({ imports }: { imports: StoredSessionImport[] }) {
  return (
    <section className="sources-panel" aria-label="최근 불러온 소스">
      <header className="sources-group-head">
        <h2>최근 불러온 소스</h2>
        <span>{imports.length}건</span>
      </header>
      <ul className="sources-recent-list">
        {imports.slice(0, 5).map((entry) => (
          <li key={entry.id}>
            <strong>{entry.source.title}</strong>
            <span>
              {entry.source.kind} · 이벤트 {entry.events.length}개 · {formatDateTime(entry.savedAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
