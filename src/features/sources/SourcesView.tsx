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
  HardDrive,
  Link2,
  Lock,
  Package,
  ShieldCheck,
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
import { SearchField } from "../../components/ui/SearchField";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { useMoriAppStore } from "../../app/store";
import { useMoriRepositoryStore } from "../../app/repositoryStore";
import { isTauriRuntime } from "../../lib/desktop";
import { formatDateTime } from "../../lib/formatting/time";
import {
  buildSourceWorkspace,
  findSourceWorkspaceSource,
  type SourceWorkspaceCategory,
  type SourceWorkspaceSource,
  type SourceWorkspaceStatus,
} from "../../lib/sources/sourceWorkspace";
import type { StoredSessionImport } from "../../lib/storage/storageTypes";

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

const CATEGORY_LABEL: Record<SourceWorkspaceCategory, string> = {
  AI: "AI",
  Code: "코드",
  Git: "Git",
  Terminal: "터미널",
  Docs: "문서",
  Design: "디자인",
  "Issue Tracker": "이슈",
  Manual: "수동",
  URL: "URL",
  Future: "예정",
};

const STATUS_FILTERS: Array<{ id: "all" | SourceWorkspaceStatus; label: string }> = [
  { id: "all", label: "전체" },
  { id: "available", label: "사용 가능" },
  { id: "needsSetup", label: "설정 필요" },
  { id: "planned", label: "지원 예정" },
];

const FORMAT_PREVIEWS = [
  {
    id: "jsonl",
    label: "JSONL event",
    code:
      '{"type":"message","id":"msg_01","timestamp":"2026-05-27T09:41:12.123Z","role":"user","content":"리팩터링 방향 제안해줘","meta":{"model":"gpt-4.1","cwd":"/Users/isaac/dev/project","session_id":"sess_01"}}',
  },
  {
    id: "transcript",
    label: "Transcript",
    code: "User: 로그인 플로우를 정리해줘\nAssistant: 현재 흐름은 세 단계로 나뉩니다...",
  },
  {
    id: "git",
    label: "Git diff summary",
    code: "repo: /Users/isaac/dev/mori\nrange: main..feature\nfiles: 4\nshortstat: 4 files changed, 120 insertions, 32 deletions",
  },
  {
    id: "normalized",
    label: "Normalized event",
    code:
      '{"type":"aiConversation","title":"리팩터링 방향 논의","trustLevel":"observed","sourceRefs":["src-codex"],"createdBy":"import"}',
  },
];

export function SourcesView() {
  const draft = useMoriSessionStore((state) => state.draft);
  const imports = useMoriSessionStore((state) => state.imports);
  const view = useMoriSessionStore(selectSessionView);
  const requestEvidenceImport = useMoriAppStore((state) => state.requestEvidenceImport);
  const openSettingsSheet = useMoriAppStore((state) => state.openSettingsSheet);
  const repositories = useMoriRepositoryStore((state) => state.settings.repositories);
  const desktop = isTauriRuntime();
  const hasActiveSession = Boolean(draft);

  const workspace = useMemo(
    () => buildSourceWorkspace({ isDesktop: desktop, hasActiveSession }),
    [desktop, hasActiveSession],
  );
  const [selectedId, setSelectedId] = useState("connectorJsonl");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["id"]>("all");
  const filteredSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.sources.filter((source) => {
      if (statusFilter !== "all" && source.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        source.name,
        source.category,
        source.familyLabel,
        source.acquisitionMethod,
        source.acceptedFormats.join(" "),
        source.privacyNote,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, statusFilter, workspace.sources]);
  const selected =
    filteredSources.find((source) => source.id === selectedId) ??
    filteredSources[0] ??
    findSourceWorkspaceSource(workspace, selectedId) ??
    workspace.sources[0]!;

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
          label="소스"
          start={
            <div className="sources-titlebar">
              <div>
                <h1>소스</h1>
                <p>외부 작업 데이터가 Mori 세션과 근거로 들어오는 방식을 확인합니다.</p>
              </div>
              <SourceCountStrip counts={workspace.counts} />
            </div>
          }
        />
      }
      aside={
        <SourceInspector
          source={selected}
          repositoryCount={repositories.length}
          hasActiveSession={hasActiveSession}
          onAction={() => runSourceAction(selected)}
        />
      }
    >
      <section className="sources-overview" aria-label="소스 개요">
        <div className="sources-toolbar">
          <SearchField
            className="sources-search"
            value={query}
            onChange={setQuery}
            placeholder="소스, 형식, 방식 검색"
            ariaLabel="소스 검색"
          />
          <div className="sources-filter" role="tablist" aria-label="소스 상태 필터">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={filter.id === statusFilter ? "is-active" : ""}
                onClick={() => setStatusFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sources-table" role="list">
          <div className="sources-table-head" aria-hidden="true">
            <span>소스</span>
            <span>가족</span>
            <span>획득 방식</span>
            <span>데이터 범위</span>
            <span>상태</span>
            <span>작업</span>
          </div>
          {filteredSources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              selected={source.id === selected.id}
              onSelect={() => setSelectedId(source.id)}
              onAction={() => runSourceAction(source)}
            />
          ))}
          {filteredSources.length === 0 ? (
            <p className="sources-empty">조건에 맞는 소스가 없습니다.</p>
          ) : null}
        </div>
      </section>

      <section className="sources-pipeline" aria-label="소스 처리 흐름">
        <header className="sources-section-head">
          <h2>소스 → Mori 처리 흐름</h2>
        </header>
        <ol className="sources-pipeline-steps">
          {workspace.pipeline.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <div className="sources-lower-grid">
        <RecentImports imports={imports} sessionTitle={view.session.title} />
        <FormatPreview />
      </div>

      <section className="sources-privacy" aria-label="개인정보와 로컬 데이터">
        <header className="sources-section-head">
          <h2>개인정보 / Raw Data 정책</h2>
        </header>
        <ul>
          {workspace.privacySummary.map((line) => (
            <li key={line}>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}

function SourceCountStrip({ counts }: { counts: ReturnType<typeof buildSourceWorkspace>["counts"] }) {
  return (
    <dl className="sources-count-strip" aria-label="소스 상태 요약">
      <div>
        <dt>사용 가능</dt>
        <dd>{counts.available}</dd>
      </div>
      <div>
        <dt>설정 필요</dt>
        <dd>{counts.needsSetup}</dd>
      </div>
      <div>
        <dt>지원 예정</dt>
        <dd>{counts.planned}</dd>
      </div>
      <div>
        <dt>로컬 전용</dt>
        <dd>{counts.localOnly}</dd>
      </div>
    </dl>
  );
}

function SourceRow({
  source,
  selected,
  onSelect,
  onAction,
}: {
  source: SourceWorkspaceSource;
  selected: boolean;
  onSelect: () => void;
  onAction: () => void;
}) {
  const Icon = CATEGORY_ICON[source.category];
  return (
    <article
      className={`sources-row${selected ? " is-selected" : ""}`}
      role="listitem"
      onClick={onSelect}
    >
      <button type="button" className="sources-row-main" onClick={onSelect}>
        <span className="sources-row-source">
          <span className="sources-row-icon">
            <Icon size={15} aria-hidden="true" />
          </span>
          <span>
            <strong>{source.name}</strong>
            <small>{CATEGORY_LABEL[source.category]}</small>
          </span>
        </span>
        <span>{source.familyLabel}</span>
        <span>{compactMethod(source.acquisitionMethod)}</span>
        <span>{source.localOnly ? "로컬 / 명시 선택" : "명시 입력"}</span>
        <span>
          <Badge tone={source.statusTone}>{source.statusLabel}</Badge>
        </span>
      </button>
      <div className="sources-row-action">
        <SourceActionButton source={source} onAction={onAction} />
      </div>
    </article>
  );
}

function SourceActionButton({
  source,
  onAction,
}: {
  source: SourceWorkspaceSource;
  onAction: () => void;
}) {
  if (source.action.kind === "none") {
    return <span className="sources-action-inert">{source.action.label}</span>;
  }
  const icon = source.action.kind === "settings" ? FolderOpen : Upload;
  return (
    <Button
      size="sm"
      variant={source.action.enabled ? "secondary" : "ghost"}
      icon={icon}
      disabled={!source.action.enabled}
      title={source.action.disabledReason ?? source.action.label}
      onClick={(event) => {
        event.stopPropagation();
        onAction();
      }}
    >
      {shortActionLabel(source.action.label)}
    </Button>
  );
}

function SourceInspector({
  source,
  repositoryCount,
  hasActiveSession,
  onAction,
}: {
  source: SourceWorkspaceSource;
  repositoryCount: number;
  hasActiveSession: boolean;
  onAction: () => void;
}) {
  const Icon = CATEGORY_ICON[source.category];
  return (
    <aside className="sources-inspector" aria-label="선택한 소스">
      <header className="sources-inspector-head">
        <span className="sources-inspector-icon">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>{source.name}</h2>
          <p>
            {CATEGORY_LABEL[source.category]} · {source.familyLabel}
          </p>
        </div>
        <Badge tone={source.statusTone}>{source.statusLabel}</Badge>
      </header>

      <InspectorBlock title="Mori가 접근하는 것" icon={Database}>
        <CheckList items={source.whatMoriCanAccess} tone="ok" />
      </InspectorBlock>

      <InspectorBlock title="Mori가 접근하지 않는 것" icon={Lock}>
        <CheckList items={source.whatMoriCannotAccess} tone="no" />
      </InspectorBlock>

      <InspectorBlock title="지원 입력 형식" icon={FileText}>
        <ChipList items={source.acceptedFormats} />
      </InspectorBlock>

      <InspectorBlock title="경로 / 설정" icon={HardDrive}>
        <dl className="sources-inspector-meta">
          <div>
            <dt>상태</dt>
            <dd>{source.pathStateLabel}</dd>
          </div>
          <div>
            <dt>저장된 repo</dt>
            <dd>{repositoryCount}개</dd>
          </div>
          <div>
            <dt>세션</dt>
            <dd>{hasActiveSession ? "활성 세션 있음" : "활성 세션 없음"}</dd>
          </div>
        </dl>
        <p>{source.setupMethod}</p>
      </InspectorBlock>

      <InspectorBlock title="가져오면 생성되는 항목" icon={Package}>
        <CheckList items={source.creates} tone="ok" />
        <p>{source.reviewBehavior}</p>
      </InspectorBlock>

      <InspectorBlock title="구현 백로그" icon={Link2}>
        <dl className="sources-inspector-meta">
          <div>
            <dt>안전성</dt>
            <dd>{source.safeToImplementNow ? "지금 확장 가능" : "설계/권한 모델 필요"}</dd>
          </div>
          <div>
            <dt>Raw data</dt>
            <dd>{rawDataLabel(source.rawDataPolicy)}</dd>
          </div>
        </dl>
        <small className="sources-inspector-files">{source.likelyFiles.join(" · ")}</small>
      </InspectorBlock>

      <div className="sources-inspector-actions">
        {source.action.kind === "none" ? (
          <span className="sources-action-inert">{source.action.label}</span>
        ) : (
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

function RecentImports({
  imports,
  sessionTitle,
}: {
  imports: StoredSessionImport[];
  sessionTitle: string;
}) {
  return (
    <section className="sources-panel" aria-label="최근 불러온 소스">
      <header className="sources-section-head">
        <h2>최근 불러온 소스</h2>
        <span>{imports.length}건</span>
      </header>
      {imports.length ? (
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
      ) : (
        <div className="sources-panel-empty">
          <p>아직 불러온 소스가 없습니다.</p>
          <small>{sessionTitle ? `${sessionTitle} 세션에 소스를 추가하면 여기에 표시됩니다.` : "지원 형식을 확인한 뒤 명시적으로 불러오세요."}</small>
        </div>
      )}
    </section>
  );
}

function FormatPreview() {
  const [active, setActive] = useState(FORMAT_PREVIEWS[0]!.id);
  const current = FORMAT_PREVIEWS.find((item) => item.id === active) ?? FORMAT_PREVIEWS[0]!;
  return (
    <section className="sources-panel" aria-label="지원 형식 미리보기">
      <header className="sources-section-head">
        <h2>지원 형식 미리보기</h2>
      </header>
      <div className="sources-format-tabs" role="tablist" aria-label="지원 형식">
        {FORMAT_PREVIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === active ? "is-active" : ""}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <pre className="sources-code-preview">
        <code>{current.code}</code>
      </pre>
      <small>미리보기는 예시입니다. 실제 적용은 검토 후 반영 흐름을 거칩니다.</small>
    </section>
  );
}

function compactMethod(value: string): string {
  const cleaned = value.replace(/^증거 탭 →\s*/, "").replace(/^사용자가\s*/, "");
  return cleaned.length > 42 ? `${cleaned.slice(0, 39)}...` : cleaned;
}

function shortActionLabel(value: string): string {
  if (value.includes("JSONL")) return "JSONL";
  if (value.includes("diff")) return "Diff";
  if (value.includes("메모")) return "작성";
  if (value.includes("URL")) return "추가";
  if (value.includes("설정")) return "설정";
  if (value.includes("AI")) return "붙여넣기";
  return value.replace(" 가져오기", "");
}

function rawDataLabel(policy: SourceWorkspaceSource["rawDataPolicy"]): string {
  switch (policy) {
    case "retained":
      return "원문 보관";
    case "summaryOnly":
      return "요약 / 메타데이터";
    case "redacted":
      return "마스킹됨";
    case "notCaptured":
      return "원문 없음";
    case "referenceOnly":
      return "참조만";
  }
}
