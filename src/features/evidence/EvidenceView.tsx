import { Filter, RotateCcw, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { SearchField } from "../../components/ui/SearchField";
import { InfoHint } from "../../components/ui/InfoHint";
import { SessionEmptyPrompt } from "../session/SessionEmptyPrompt";
import type { SourceKind } from "../../domain/types";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import {
  applyEnginePreset,
  buildProviderConfigFromSettings,
  loadEnginePresets,
  resolveQuickPassProvider,
} from "../../lib/analysis";
import { providerKindLabel, providerNameLabel } from "../../lib/analysis/providerLabels";
import type {
  AnalysisRunStatus,
  EnginePreset,
  QuickPassAnalysisSettings,
  QuickPassProviderKind,
} from "../../lib/analysis";
import { SOURCE_REGISTRY } from "../../lib/sources/sourceRegistry";
import { formatSidebarRelative } from "../../lib/sidebar/sessionList";
import { useBackgroundWatchStore } from "../../app/backgroundWatchStore";
import { ImportReviewView } from "../review-import/ImportReviewView";
import { BackgroundAnalysisResultsPanel } from "./BackgroundAnalysisResultsPanel";
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
  const applyBackgroundAnalysis = useSessionStore((state) => state.applyBackgroundAnalysis);
  const backgroundAnalysisResults = useBackgroundWatchStore((state) => state.analysisResults);
  // `navigate` routes legacy session-surface keys (timeline) into the unified
  // Session Detail workspace; other keys (memory / settings) pass through.
  const setCurrentView = useAppStore((state) => state.navigate);
  const setSessionTab = useAppStore((state) => state.setSessionTab);

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

  const pendingReview = useSessionStore((state) => state.pendingReview);

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

  const bgAnalysisSection =
    mode === "draft" && backgroundAnalysisResults.length > 0 ? (
      <BackgroundAnalysisResultsPanel
        results={backgroundAnalysisResults}
        onApply={(result) =>
          applyBackgroundAnalysis(result.analysis, result.analysis.providerName ?? undefined)
        }
      />
    ) : null;

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
        generatedAt={analysis?.generatedAt ?? null}
        durationMs={analysis?.durationMs ?? null}
        inputEventCount={analysis?.inputEventCount ?? null}
        inputSourceCount={analysis?.inputSourceCount ?? null}
        notes={analysis?.notes ?? []}
        settings={analysisSettings}
        enginePresets={enginePresets}
        runPresetId={runPresetId}
        onRunPresetChange={setRunPresetId}
        onProviderChange={(provider) => updateAnalysisSettings({ provider })}
        onOpenSettings={() => setCurrentView("settings")}
        onOpenReview={() => setSessionTab("insights")}
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
      {pendingReview ? (
        // A parsed import awaiting review is hosted inline here (not a
        // full-screen takeover), so the 자료 tab keeps its shape and the review
        // survives navigation. Applied sources / analysis appear once 반영 runs.
        <ImportReviewView embedded />
      ) : importedSources.length === 0 ? (
        <>
          {bgAnalysisSection}
          {importedSourcesSection}
          {quickPassSection}
        </>
      ) : (
        <>
          {toolbar}
          <EvidenceComposition
            familyCounts={familyCounts}
            sourceCount={importedSources.length}
            eventCount={view.events.length}
          />
          {bgAnalysisSection}
          {quickPassSection}
          {importedSourcesSection}
        </>
      )}
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

/**
 * Evidence composition — the at-a-glance "what is this session built from"
 * band at the top of the 자료 tab. A Mori session is one AI conversation (the
 * spine) with Git / files / notes / terminal hanging off it as evidence; this
 * shows that makeup as a proportional bar + per-family legend, so the user
 * reads the evidence base before the source list. Distinct from 개요's activity
 * shape (what was *done*) — this is what the work is *sourced from*.
 */
function EvidenceComposition({
  familyCounts,
  sourceCount,
  eventCount,
}: {
  familyCounts: Map<SourceFamily, number>;
  sourceCount: number;
  eventCount: number;
}) {
  const families = FAMILY_ORDER.filter((family) => (familyCounts.get(family) ?? 0) > 0);
  const total = families.reduce((sum, family) => sum + (familyCounts.get(family) ?? 0), 0);
  if (total === 0) return null;
  return (
    <section className="evidence-composition" aria-label="증거 구성">
      <header className="evidence-composition-head">
        <h2>이 세션의 증거</h2>
        <span className="evidence-composition-scale">
          소스 {sourceCount} · 이벤트 {eventCount}
        </span>
      </header>
      <div className="evidence-composition-bar" aria-hidden="true">
        {families.map((family) => (
          <span
            key={family}
            className={`evidence-composition-seg family-${family}`}
            style={{ width: `${((familyCounts.get(family) ?? 0) / total) * 100}%` }}
            title={`${FAMILY_LABELS[family]} ${familyCounts.get(family)}`}
          />
        ))}
      </div>
      <div className="evidence-composition-legend">
        {families.map((family) => (
          <span key={family} className="evidence-composition-legend-item">
            <i className={`evidence-composition-dot family-${family}`} aria-hidden="true" />
            {FAMILY_LABELS[family]} <strong>{familyCounts.get(family)}</strong>
          </span>
        ))}
      </div>
    </section>
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

// The 자료 tab is the home of a session's evidence, so its own empty state does
// not repeat the "자료 가져오기" button the other tabs use to send you *here*.
// It stays a calm prompt that explains how evidence arrives (via 연동).
function EvidenceEmptyState({ isDemo }: { isDemo: boolean }) {
  return (
    <SessionEmptyPrompt
      title="세션에 가져온 자료 없음"
      hint={isDemo ? "데모 세션은 미리 정의된 소스만 보여줍니다." : "연동에서 대화를 가져오면 여기에 모입니다."}
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
  confidence: _confidence,
  generatedAt,
  durationMs,
  inputEventCount,
  inputSourceCount,
  notes,
  settings,
  enginePresets,
  runPresetId,
  onRunPresetChange,
  onProviderChange,
  onOpenSettings,
  onOpenReview,
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
  generatedAt: string | null;
  durationMs: number | null;
  inputEventCount: number | null;
  inputSourceCount: number | null;
  notes: string[];
  settings: QuickPassAnalysisSettings;
  enginePresets: EnginePreset[];
  runPresetId: string | null;
  onRunPresetChange: (id: string | null) => void;
  onProviderChange: (provider: QuickPassProviderKind) => void;
  onOpenSettings: () => void;
  onOpenReview: () => void;
  onRun: () => void;
  onClear: () => void;
}) {
  const statusText = buildAnalysisStatusText(
    status, providerLabel, providerName, error, hasAnalysis, canRun,
  );

  return (
    <div className={`analysis-strip status-${status}`}>
      <div className="analysis-strip-bar">
        <span className="analysis-strip-title">분석</span>
        <label className="analysis-strip-engine">
          <select
            value={settings.provider}
            onChange={(e) => onProviderChange(e.target.value as QuickPassProviderKind)}
          >
            <option value="deterministic">{providerKindLabel("deterministic")}</option>
            <option value="ollama">{providerKindLabel("ollama")}</option>
            <option value="openAiCompatible">{providerKindLabel("openAiCompatible")}</option>
          </select>
        </label>
        <InfoHint label="분석 엔진 설명">
          <strong>규칙 기반</strong> · 네트워크 없이 기기에서 도는 휴리스틱. 빠르고 비공개이지만
          요약은 단순합니다.
          <br />
          <strong>Ollama</strong> · 기기에서 도는 로컬 LLM. 비공개로 더 풍부하게 요약하며, 모델
          설치가 필요합니다.
          <br />
          <strong>OpenAI 호환</strong> · OpenAI 형식 HTTP API(로컬 또는 원격). 원격 주소면 자료가
          외부로 전송될 수 있습니다.
        </InfoHint>
        {enginePresets.length > 0 ? (
          <select
            className="analysis-strip-preset"
            value={runPresetId ?? ""}
            onChange={(e) => onRunPresetChange(e.target.value || null)}
            aria-label="이번 실행에 사용할 프리셋"
          >
            <option value="">현재 설정</option>
            {enginePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="analysis-strip-spacer" aria-hidden="true" />
        <Button
          variant="primary"
          icon={Sparkles}
          size="sm"
          onClick={onRun}
          disabled={!canRun}
        >
          {status === "running" ? "분석 중..." : "분석 실행"}
        </Button>
        {hasAnalysis ? (
          <Button icon={RotateCcw} size="sm" onClick={onClear}>초기화</Button>
        ) : null}
        <Button icon={SettingsIcon} size="sm" onClick={onOpenSettings}>설정</Button>
      </div>
      {statusText ? (
        <p className="analysis-strip-status">{statusText}</p>
      ) : null}
      {hasAnalysis ? (
        <div className="analysis-strip-results">
          {summary ? <p className="analysis-strip-summary">{summary}</p> : null}
          <div className="analysis-strip-metrics">
            <span><strong>{issueCount}</strong> 이슈</span>
            <span><strong>{decisionCount}</strong> 결정</span>
            <span><strong>{nextActionCount}</strong> 다음 액션</span>
            <button type="button" className="analysis-strip-review" onClick={onOpenReview}>
              검토에서 자세히 보기 →
            </button>
            {generatedAt ? (
              <span className="analysis-strip-produced">
                {describeAnalysisProduction({ inputEventCount, inputSourceCount, durationMs, generatedAt })}
              </span>
            ) : null}
          </div>
          {fallbackUsed ? (
            <p className="analysis-strip-fallback">
              로컬 LLM 분석에 실패해 규칙 기반 결과를 표시하고 있습니다.
            </p>
          ) : null}
          {notes.length > 0 ? (
            <ul className="analysis-strip-notes">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildAnalysisStatusText(
  status: AnalysisRunStatus,
  providerLabel: string | null,
  providerName: string | null,
  error: string | null,
  hasAnalysis: boolean,
  canRun: boolean,
): string | null {
  if (status === "running") return `${providerLabel ?? "분석"} 실행 중...`;
  if (status === "failed") return error ?? "분석 실행에 실패했습니다.";
  if (status === "succeeded") return null;
  if (hasAnalysis) {
    return `이전 결과: ${providerLabel ?? "deterministic"} · ${providerNameLabel(providerName)}`;
  }
  if (!canRun) return "분석하려면 먼저 자료를 가져오세요.";
  return null;
}


/**
 * One quiet "how it was produced" line for a finished analysis: what was fed in
 * (turns · sources), how long it took, and when it ran. Pure factual
 * transparency from the run result, so the user can judge the output's basis.
 */
function describeAnalysisProduction({
  inputEventCount,
  inputSourceCount,
  durationMs,
  generatedAt,
}: {
  inputEventCount: number | null;
  inputSourceCount: number | null;
  durationMs: number | null;
  generatedAt: string;
}): string {
  const parts: string[] = [];
  if (inputEventCount != null) parts.push(`대화 ${inputEventCount}턴`);
  if (inputSourceCount != null) parts.push(`소스 ${inputSourceCount}개`);
  const basis = parts.length > 0 ? `${parts.join(" · ")} 분석` : "분석";
  const segments = [basis];
  if (durationMs != null && durationMs > 0) {
    segments.push(durationMs < 1000 ? "1초 미만" : `${(durationMs / 1000).toFixed(1)}초`);
  }
  const when = formatSidebarRelative(generatedAt);
  if (when) segments.push(when);
  return segments.join(" · ");
}
