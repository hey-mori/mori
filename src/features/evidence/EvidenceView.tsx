import { FileText, Filter, RotateCcw, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SearchField } from "../../components/ui/SearchField";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { EmptyState } from "../../components/layout/EmptyState";
import { NoticeBanner } from "../../components/layout/NoticeBanner";
import type { SourceKind } from "../../domain/types";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { useReviewStore } from "../../app/reviewStore";
import {
  applyEnginePreset,
  buildProviderConfigFromSettings,
  describeAnalysisStatus,
  getAnalysisStatusTone,
  loadEnginePresets,
  resolveQuickPassProvider,
} from "../../lib/analysis";
import {
  buildImportApplyCompletion,
  type ImportApplyCompletionActionId,
} from "../../lib/review/importApplyCompletion";
import type {
  AnalysisRunStatus,
  EnginePreset,
  QuickPassAnalysisSettings,
  QuickPassProviderKind,
} from "../../lib/analysis";
import { SOURCE_REGISTRY } from "../../lib/sources/sourceRegistry";
import { ImportReviewView } from "../review-import/ImportReviewView";
import { ImportedSourceRow } from "./ImportedSourceRow";
import {
  SourceDetailPanel,
  type EvidenceDetailSelection,
} from "./SourceDetailPanel";

/**
 * Evidence Hub — the **증거** tab inside the unified Session Detail workspace.
 *
 * A Mori session is one AI-agent work session: the conversation is the spine,
 * and the Git diffs / terminal runs / files / notes produced during that work
 * hang off it as evidence. So this surface does NOT offer a "add a source"
 * catalog — you cannot bolt arbitrary sources onto an agent session after the
 * fact. It is a calm, read-only ledger of what the session is built from: each
 * source with its icon, capture method, and related events, plus the
 * Quick Pass extraction control for a live draft. The review-before-apply
 * import gate (`ImportReviewView`) still renders here while a draft is pending.
 */
export function EvidenceView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const analysisStatus = useSessionStore((state) => state.analysisStatus);
  const analysisError = useSessionStore((state) => state.analysisError);
  const analysisProviderLabel = useSessionStore((state) => state.analysisProviderLabel);
  const analysis = useSessionStore((state) => state.analysis);
  const imports = useSessionStore((state) => state.imports);
  const analysisSettings = useSessionStore((state) => state.analysisSettings);
  const analysisFallbackUsed = useSessionStore((state) => state.analysisFallbackUsed);
  const runQuickPass = useSessionStore((state) => state.runQuickPass);
  const clearAnalysis = useSessionStore((state) => state.clearAnalysis);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);
  const removeImport = useSessionStore((state) => state.removeImport);
  // `navigate` routes legacy session-surface keys (timeline) into the unified
  // Session Detail workspace; other keys (memory / settings) pass through.
  const setCurrentView = useAppStore((state) => state.navigate);

  // Engine presets saved in AI engine settings can drive a one-off run without
  // changing the persisted engine. `null` runs with the current settings.
  const enginePresets = useMemo(() => loadEnginePresets(), []);
  const [runPresetId, setRunPresetId] = useState<string | null>(null);

  function handleRunQuickPass() {
    const preset = runPresetId ? enginePresets.find((entry) => entry.id === runPresetId) : null;
    if (!preset) {
      void runQuickPass();
      return;
    }
    const effective = applyEnginePreset(analysisSettings, preset);
    void runQuickPass(resolveQuickPassProvider(buildProviderConfigFromSettings(effective)), effective);
  }

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  const reviewDraft = useReviewStore((state) => state.draft);
  const lastApplied = useReviewStore((state) => state.lastApplied);
  const clearLastApplied = useReviewStore((state) => state.clearLastApplied);

  const integrationLookup = useMemo(() => {
    const map = new Map<string, (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY]>();
    for (const integration of Object.values(SOURCE_REGISTRY)) {
      map.set(integration.id, integration);
    }
    return map;
  }, []);

  const [selection, setSelection] = useState<EvidenceDetailSelection>({ kind: "empty" });
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFamilies, setActiveFamilies] = useState<SourceFamily[]>([]);

  const importedSources = view.sources;
  const familyCounts = useMemo(() => {
    const counts = new Map<SourceFamily, number>();
    for (const source of importedSources) {
      const family = sourceFamily(source.kind);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return counts;
  }, [importedSources]);
  const filteredSources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return importedSources.filter((source) => {
      if (activeFamilies.length > 0 && !activeFamilies.includes(sourceFamily(source.kind))) {
        return false;
      }
      if (!query) return true;
      const haystack = `${source.title} ${source.detail} ${source.kind}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [importedSources, searchQuery, activeFamilies]);
  const filterActive = searchQuery.trim().length > 0 || activeFamilies.length > 0;
  const isDemoSession = mode === "demo";
  const importCompletion = useMemo(
    () =>
      lastApplied
        ? buildImportApplyCompletion({
            appliedCount: lastApplied.appliedCount,
            hasAnalysis,
          })
        : null,
    [lastApplied, hasAnalysis],
  );

  function handleImportCompletionAction(actionId: ImportApplyCompletionActionId) {
    switch (actionId) {
      case "timeline":
        setCurrentView("timeline");
        return;
      case "quickPass":
        void runQuickPass();
        return;
      case "memory":
        setCurrentView("memory");
        return;
      default:
        return;
    }
  }

  // Defer to the review screen if a draft is in flight. Cancel / apply on the
  // review screen clears the draft and falls back to the Evidence Hub.
  if (reviewDraft) {
    return <ImportReviewView embedded />;
  }

  const aside = (
    <SourceDetailPanel
      selection={selection}
      view={view}
      integrationLookup={integrationLookup}
      importSummary={
        selection.kind === "source"
          ? imports.find((entry) => entry.source.id === selection.sourceId)?.importSummary
          : undefined
      }
      onClose={() => setSelection({ kind: "empty" })}
    />
  );

  const importedSourcesSection =
    importedSources.length === 0 ? (
      <EvidenceEmptyState isDemo={isDemoSession} />
    ) : filteredSources.length === 0 ? (
      <EvidenceFilteredEmpty
        onClear={() => {
          setSearchQuery("");
          setActiveFamilies([]);
        }}
      />
    ) : (
      <div className="imported-source-list" aria-label="세션을 구성한 자료">
        {filteredSources.map((source) => {
          const importEntry = imports.find((entry) => entry.source.id === source.id);
          const selected = selection.kind === "source" && selection.sourceId === source.id;
          return (
            <ImportedSourceRow
              key={source.id}
              source={source}
              events={view.events}
              selected={selected}
              importSummary={importEntry?.importSummary}
              onSelect={() =>
                setSelection(
                  selected
                    ? { kind: "empty" }
                    : { kind: "source", sourceId: source.id },
                )
              }
              onRemove={
                importEntry && !isDemoSession
                  ? () => {
                      removeImport(importEntry.id);
                      if (selected) setSelection({ kind: "empty" });
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    );

  const quickPassSection =
    mode === "draft" ? (
      <QuickPassControl
        status={analysisStatus}
        providerLabel={analysisProviderLabel}
        providerName={analysis?.providerName ?? null}
        error={analysisError}
        canRun={imports.length > 0 && analysisStatus !== "running"}
        hasAnalysis={hasAnalysis}
        fallbackUsed={analysisFallbackUsed}
        summary={analysis?.summary.sessionSummary ?? null}
        issueCount={analysis?.issues.length ?? 0}
        decisionCount={analysis?.decisions.length ?? 0}
        nextActionCount={analysis?.nextActions.length ?? 0}
        confidence={analysis?.confidence ?? null}
        notes={analysis?.notes ?? []}
        settings={analysisSettings}
        enginePresets={enginePresets}
        runPresetId={runPresetId}
        onRunPresetChange={setRunPresetId}
        onProviderChange={(provider) => updateAnalysisSettings({ provider })}
        onOpenSettings={() => setCurrentView("settings")}
        onRun={handleRunQuickPass}
        onClear={clearAnalysis}
      />
    ) : null;

  const toolbar =
    importedSources.length > 0 ? (
      <EvidenceToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFamilies={activeFamilies}
        onToggleFamily={(family) =>
          setActiveFamilies((current) =>
            current.includes(family)
              ? current.filter((entry) => entry !== family)
              : [...current, family],
          )
        }
        onClearFilters={() => {
          setSearchQuery("");
          setActiveFamilies([]);
        }}
        familyCounts={familyCounts}
        filterActive={filterActive}
      />
    ) : null;

  const body = (
    <>
      {lastApplied && importCompletion ? (
        <NoticeBanner
          tone="success"
          title={importCompletion.headline}
          onDismiss={clearLastApplied}
          actions={importCompletion.actions.map((action) => (
            <Button
              key={action.id}
              variant={action.primary ? "primary" : "secondary"}
              onClick={() => handleImportCompletionAction(action.id)}
              disabled={action.id === "quickPass" && analysisStatus === "running"}
            >
              {action.id === "quickPass" && analysisStatus === "running"
                ? "분석 중..."
                : action.label}
            </Button>
          ))}
        >
          {importCompletion.detail}
        </NoticeBanner>
      ) : null}

      {toolbar}
      {importedSourcesSection}
      {quickPassSection}
    </>
  );

  // On-demand inspector: the aside only renders when the user has selected a
  // source. First paint stays single-column so the source list reads at a
  // glance; clicking a row opens the detail.
  const showAside = selection.kind !== "empty";

  return (
    <div className="session-tab-pane session-tab-evidence">
      <div className={`session-tab-split${showAside ? "" : " is-collapsed"}`}>
        <div className="session-tab-main">{body}</div>
        {showAside ? aside : null}
      </div>
    </div>
  );
}

type SourceFamily = "ai" | "git" | "terminal" | "file" | "note" | "web" | "other";

const FAMILY_LABELS: Record<SourceFamily, string> = {
  ai: "AI 대화",
  git: "Git",
  terminal: "터미널",
  file: "코드·파일",
  note: "메모",
  web: "웹·URL",
  other: "기타",
};

const FAMILY_ORDER: SourceFamily[] = ["ai", "git", "file", "note", "web", "terminal", "other"];

function sourceFamily(kind: SourceKind): SourceFamily {
  switch (kind) {
    case "aiConversation":
    case "claudeTranscript":
    case "chatgptTranscript":
    case "codexTranscript":
    case "desktopTranscriptImport":
    case "connectorJsonl":
      return "ai";
    case "gitDiff":
    case "tauriGitDiff":
    case "git":
    case "gitCommand":
    case "githubPrImport":
    case "repository":
      return "git";
    case "terminal":
    case "terminalShell":
    case "buildLog":
    case "deployLog":
    case "automation":
      return "terminal";
    case "file":
    case "fileSystem":
    case "editor":
    case "vscode":
    case "cursor":
      return "file";
    case "manualNote":
    case "docs":
    case "notion":
      return "note";
    case "browser":
    case "browserTab":
    case "url":
      return "web";
    default:
      return "other";
  }
}

function EvidenceToolbar({
  searchQuery,
  onSearchChange,
  activeFamilies,
  onToggleFamily,
  onClearFilters,
  familyCounts,
  filterActive,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeFamilies: SourceFamily[];
  onToggleFamily: (family: SourceFamily) => void;
  onClearFilters: () => void;
  familyCounts: Map<SourceFamily, number>;
  filterActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const families = FAMILY_ORDER.filter((family) => (familyCounts.get(family) ?? 0) > 0);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!popRef.current) return;
      if (!popRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="tab-toolbar" role="toolbar" aria-label="자료 도구">
      <SearchField
        value={searchQuery}
        onChange={onSearchChange}
        ariaLabel="자료 검색"
        className="tab-toolbar-search"
      />
      <span className="tab-toolbar-spacer" aria-hidden="true" />
      <div className="tab-toolbar-right">
        {families.length > 0 ? (
          <div className="toolbar-pop-wrap" ref={popRef}>
            <button
              type="button"
              className={`toolbar-toggle ${activeFamilies.length ? "is-active" : ""}`}
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="evidence-filter-popover"
              aria-label="자료 종류 필터"
            >
              <Filter size={14} aria-hidden="true" />
              {activeFamilies.length ? `필터 · ${activeFamilies.length}` : "필터"}
            </button>
            {open ? (
              <div
                className="filter-popover"
                id="evidence-filter-popover"
                role="dialog"
                aria-label="자료 종류 필터"
              >
                <header>
                  <span>자료 종류</span>
                  <button
                    type="button"
                    className="filter-popover-clear"
                    onClick={() => {
                      onClearFilters();
                      setOpen(false);
                    }}
                    disabled={!filterActive}
                  >
                    지우기
                  </button>
                </header>
                <ul>
                  {families.map((family) => {
                    const active = activeFamilies.includes(family);
                    const count = familyCounts.get(family) ?? 0;
                    return (
                      <li key={family}>
                        <button
                          type="button"
                          className={`filter-pop-item ${active ? "active" : ""}`}
                          aria-pressed={active}
                          onClick={() => onToggleFamily(family)}
                        >
                          <span className="filter-pop-label">{FAMILY_LABELS[family]}</span>
                          <span className="filter-pop-count">{count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceFilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="evidence-empty">
      <p>검색·필터에 맞는 자료가 없습니다.</p>
      <button type="button" className="filter-popover-clear" onClick={onClear}>
        필터 지우기
      </button>
    </div>
  );
}

function EvidenceEmptyState({ isDemo }: { isDemo: boolean }) {
  return (
    <EmptyState
      compact
      icon={FileText}
      title="이 세션을 구성한 소스가 아직 없습니다"
      description={
        isDemo
          ? "데모 세션은 미리 정의된 소스만 보여줍니다."
          : "세션은 하나의 AI 작업에서 만들어집니다 — 연동 화면에서 AI 대화를 가져오면 그 대화와 함께 만들어진 Git diff·터미널·메모가 소스로 모입니다."
      }
    />
  );
}

function QuickPassControl({
  status,
  providerLabel,
  providerName,
  error,
  canRun,
  hasAnalysis,
  fallbackUsed,
  summary,
  issueCount,
  decisionCount,
  nextActionCount,
  confidence,
  notes,
  settings,
  enginePresets,
  runPresetId,
  onRunPresetChange,
  onProviderChange,
  onOpenSettings,
  onRun,
  onClear,
}: {
  status: AnalysisRunStatus;
  providerLabel: string | null;
  providerName: string | null;
  error: string | null;
  canRun: boolean;
  hasAnalysis: boolean;
  fallbackUsed: boolean;
  summary: string | null;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  confidence: number | null;
  notes: string[];
  settings: QuickPassAnalysisSettings;
  enginePresets: EnginePreset[];
  runPresetId: string | null;
  onRunPresetChange: (id: string | null) => void;
  onProviderChange: (provider: QuickPassProviderKind) => void;
  onOpenSettings: () => void;
  onRun: () => void;
  onClear: () => void;
}) {
  const providerKindLabel =
    settings.provider === "ollama"
      ? `Ollama · ${settings.ollamaModel} (${settings.ollamaEndpoint})`
      : settings.provider === "openAiCompatible"
        ? `OpenAI 호환 · ${settings.openAiModel} (${settings.openAiBaseUrl})`
      : "규칙 기반 로컬 엔진 (네트워크 없음)";

  return (
    <div className={`analysis-panel status-${status}`}>
      <div className="analysis-panel-header">
        <div>
          <h2>분석</h2>
          <p>가져온 자료에서 이슈 · 결정 · 다음 액션을 추출합니다.</p>
        </div>
        <div className="analysis-panel-actions">
          {enginePresets.length > 0 ? (
            <label className="analysis-panel-run-engine">
              <span>이번 실행</span>
              <select
                value={runPresetId ?? ""}
                onChange={(event) => onRunPresetChange(event.target.value || null)}
              >
                <option value="">현재 설정</option>
                {enginePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={onRun}
            disabled={!canRun}
            title={
              canRun
                ? "현재 세션의 소스로 Quick Pass 분석을 실행합니다."
                : status === "running"
                  ? "분석이 진행 중입니다."
                  : "분석하려면 먼저 Evidence에 소스를 가져오세요."
            }
          >
            {status === "running" ? "분석 중..." : "Quick Pass 실행"}
          </Button>
          {hasAnalysis ? (
            <Button icon={RotateCcw} onClick={onClear}>
              분석 초기화
            </Button>
          ) : null}
        </div>
      </div>
      <div className="analysis-panel-provider">
        <SegmentedControl<QuickPassProviderKind>
          ariaLabel="Quick Pass 제공자"
          role="radiogroup"
          value={settings.provider}
          onChange={onProviderChange}
          options={[
            { id: "deterministic", label: "규칙 기반" },
            { id: "ollama", label: "Ollama (로컬 LLM)" },
            { id: "openAiCompatible", label: "OpenAI 호환" },
          ]}
        />
        <small>{providerKindLabel}</small>
        <Button icon={SettingsIcon} onClick={onOpenSettings} size="sm">
          설정
        </Button>
      </div>
      <div className="analysis-panel-status">
        <Badge tone={getAnalysisStatusTone(status)}>
          {describeAnalysisStatus(status)}
        </Badge>
        <span>
          {status === "succeeded"
            ? `${providerLabel ?? "deterministic"} · ${describeProviderName(providerName)} · 신뢰도 ${Math.round((confidence ?? 0) * 100)}%`
            : status === "failed"
              ? error ?? "Quick Pass 실행에 실패했습니다."
              : status === "running"
                ? `${providerLabel ?? "Quick Pass"} 실행 중...`
                : hasAnalysis
                  ? `이전 결과: ${providerLabel ?? "deterministic"} · ${describeProviderName(providerName)}`
                  : canRun
                    ? "아직 실행하지 않음"
                    : "아직 실행하지 않음 · 분석하려면 먼저 Evidence에 소스를 가져오세요"}
        </span>
        {fallbackUsed ? <Badge tone="orange">폴백 사용됨</Badge> : null}
      </div>
      {hasAnalysis ? (
        <>
          {summary ? <p className="analysis-panel-summary">{summary}</p> : null}
          <ul className="analysis-panel-metrics">
            <li>
              <strong>{issueCount}</strong>
              <span>이슈</span>
            </li>
            <li>
              <strong>{decisionCount}</strong>
              <span>결정</span>
            </li>
            <li>
              <strong>{nextActionCount}</strong>
              <span>다음 액션</span>
            </li>
          </ul>
          {notes.length ? (
            <ul className="analysis-panel-notes">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function describeProviderName(name: string | null): string {
  if (name === "ollama-quick-pass-v1") return "실제 로컬 LLM";
  if (name === "openai-compatible-quick-pass-v1") return "OpenAI 호환 LLM";
  if (name === "deterministic-heuristic-v1") return "휴리스틱 (LLM 미사용)";
  return "알 수 없는 제공자";
}
