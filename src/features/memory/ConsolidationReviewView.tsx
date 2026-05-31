import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BrainCircuit, X } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { BaseSection } from "../../components/ui/BaseSection";
import { ActionBar } from "../../components/layout/ActionBar";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import { useAppStore } from "../../app/store";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import type {
  StoredAcceptedProjectMemory,
  StoredMoriPackageDraft,
  StoredSessionImport,
  StoredSessionSummary,
} from "../../lib/storage/storageTypes";
import { buildProjectMemoryViewModel } from "../../lib/project-memory/projectMemoryViewModel";
import { getProjectMemoryDataBasisTone } from "../../lib/project-memory/projectMemoryModel";
import {
  buildProjectMemoryConsolidationState,
  describeProposalKind,
} from "../../lib/project-memory/projectMemoryConsolidationState";
import {
  buildAcceptedMemoriesFromReviewDraft,
  type AcceptedMemoryApplySummary,
} from "../../lib/project-memory/acceptedMemoryPersistence";
import {
  describeAcceptedMemoryStorageSource,
  getAcceptedMemoryRepository,
  type AcceptedMemoryStorageSource,
} from "../../lib/project-memory/acceptedMemoryRepository";
import {
  parseImportedMemoryProposals,
  parseImportedMemoryProposalsFromZip,
  type ParseImportedMemoryResult,
} from "../../lib/project-memory/importedMemoryReview";
import { isTauriRuntime, tauriCommands } from "../../lib/desktop";
import type {
  MemoryProposalKind,
  MemoryProposal,
} from "../../lib/project-memory/consolidationProposals";
import {
  acceptProposal,
  countConsolidationReviewStatuses,
  deferProposal,
  discardProposal,
  editProposal,
  getReviewEntry,
  initializeConsolidationReviewState,
  keepWatchingProposal,
  resetConsolidationReviewState,
  resetProposal,
  type ConsolidationReviewEntry,
  type ConsolidationReviewState,
} from "../../lib/project-memory/consolidationReviewState";
import { ConsolidationProposalCard } from "./ConsolidationProposalCard";
import { ConsolidationEvidencePanel } from "./ConsolidationEvidencePanel";

const KIND_ORDER: MemoryProposalKind[] = [
  "promotedDecision",
  "recurringIssue",
  "keyEvidence",
  "unresolvedRisk",
  "contradiction",
  "staleMemory",
  "nextSessionRecommendation",
];

const KIND_HINT: Record<MemoryProposalKind, string> = {
  promotedDecision: "세션 간 결정을 프로젝트 메모리로 승격합니다.",
  recurringIssue: "여러 세션에서 반복되는 이슈를 묶어 추적합니다.",
  keyEvidence: "참조가 많은 핵심 자료를 표시합니다.",
  unresolvedRisk: "해소되지 않은 위험을 검토합니다.",
  contradiction: "충돌하는 결정 / 메모리를 검토합니다.",
  staleMemory: "오래된 메모리를 검토합니다.",
  nextSessionRecommendation: "다음 세션에서 다룰 작업을 제안합니다.",
};

type ImportPackageMessage =
  | { kind: "idle" }
  | {
      kind: "ok";
      packageId: string;
      added: number;
      skipped: number;
      memoryCount: number;
      isClientSafe: boolean;
    }
  | { kind: "error"; message: string };

export function ConsolidationReviewView({
  embedded = false,
  onBack,
}: { embedded?: boolean; onBack?: () => void } = {}) {
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  // Mirror MemoryView's data pipeline. Pure derivation; cheap.
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const sqliteSessions = useSqliteStore((state) => state.sessions);
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const activeSessionId = view.session.id;
  const browserSessionSummaries = useMemo<StoredSessionSummary[]>(
    () => {
      void activeSessionId;
      return repository.listStoredSessions();
    },
    [repository, activeSessionId],
  );
  const importsBySessionId = useMemo<Record<string, StoredSessionImport[]>>(() => {
    const map: Record<string, StoredSessionImport[]> = {};
    for (const summary of browserSessionSummaries) {
      map[summary.sessionId] = repository.listSessionImports(summary.sessionId);
    }
    if (!map[activeSessionId]) {
      map[activeSessionId] = repository.listSessionImports(activeSessionId);
    }
    return map;
  }, [repository, browserSessionSummaries, activeSessionId]);
  const [packageDrafts, setPackageDrafts] = useState<StoredMoriPackageDraft[]>([]);
  useEffect(() => {
    setPackageDrafts(repository.listMoriPackageDrafts());
  }, [repository, activeSessionId]);

  const viewModel = useMemo(
    () =>
      buildProjectMemoryViewModel({
        view,
        mode,
        hasAnalysis,
        savedBrowserSessions: browserSessionSummaries,
        savedSqliteSessions: sqliteSessions,
        importsBySessionId,
        moriPackages: packageDrafts,
        storageAvailable: true,
      }),
    [view, mode, hasAnalysis, browserSessionSummaries, sqliteSessions, importsBySessionId, packageDrafts],
  );

  const projectId = viewModel.projectId || "default";

  // Accepted memories drive Stale Memory Review. Loaded through the
  // runtime-aware repository so desktop mode reads from SQLite.
  const [acceptedMemories, setAcceptedMemories] = useState<StoredAcceptedProjectMemory[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getAcceptedMemoryRepository()
      .listAcceptedProjectMemories(projectId)
      .then((result) => {
        if (!cancelled) setAcceptedMemories(result.data);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const consolidationState = useMemo(
    () => buildProjectMemoryConsolidationState(viewModel, { acceptedMemories }),
    [viewModel, acceptedMemories],
  );

  // Proposals derived from an explicitly imported `.mori` package.
  // They are reviewed through the same surface as derived proposals —
  // imported memory is never auto-merged.
  const [importedProposals, setImportedProposals] = useState<MemoryProposal[]>([]);
  const proposals = useMemo(
    () => [...(consolidationState.preview?.proposals ?? []), ...importedProposals],
    [consolidationState, importedProposals],
  );

  // `.mori` package import — explicit paste or explicit file pick,
  // never auto-merged.
  const [packageText, setPackageText] = useState("");
  const [importMessage, setImportMessage] = useState<ImportPackageMessage>({ kind: "idle" });

  function applyImportResult(result: ParseImportedMemoryResult) {
    if (!result.ok) {
      setImportedProposals([]);
      setImportMessage({ kind: "error", message: result.error });
      return;
    }
    setImportedProposals(result.proposals);
    setImportMessage({
      kind: "ok",
      packageId: result.packageId,
      added: result.proposals.length,
      skipped: result.skipped.length,
      memoryCount: result.memoryCount,
      isClientSafe: result.isClientSafe,
    });
  }

  function runImport(text: string) {
    applyImportResult(parseImportedMemoryProposals(text, acceptedMemories));
  }

  // A real `.mori` zip starts with the `PK` local-file-header magic.
  function isZipPackage(bytes: Uint8Array): boolean {
    return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  }

  // Route picked package bytes: a real `.mori` zip is unzipped and
  // validated; anything else is decoded as JSON / pasted package text.
  function runImportBytes(bytes: Uint8Array) {
    if (isZipPackage(bytes)) {
      applyImportResult(parseImportedMemoryProposalsFromZip(bytes, acceptedMemories));
      return;
    }
    const text = new TextDecoder().decode(bytes);
    setPackageText(text);
    runImport(text);
  }

  function reportImportError(error: unknown) {
    setImportedProposals([]);
    setImportMessage({
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  function handleImportPackage() {
    runImport(packageText);
  }

  function handleImportPackageFile(file: File) {
    // Reads only the file the user explicitly picked — no directory
    // scan, no watcher. Bytes are read so a real `.mori` zip and a
    // plain JSON package both route through the same review path.
    file
      .arrayBuffer()
      .then((buffer) => runImportBytes(new Uint8Array(buffer)))
      .catch(reportImportError);
  }

  function handlePickNativePackageFile() {
    // Desktop: a native Open dialog picks one `.mori` file, read as raw
    // bytes so a zip or a JSON package both work. A cancelled dialog
    // leaves the panel untouched.
    void tauriCommands
      .pickMoriPackageFile()
      .then(async (picked) => {
        if (picked.cancelled || !picked.path) return;
        const bytes = await tauriCommands.readMoriPackageFile(picked.path);
        runImportBytes(Uint8Array.from(bytes));
      })
      .catch(reportImportError);
  }

  function handleClearImport() {
    setPackageText("");
    setImportedProposals([]);
    setImportMessage({ kind: "idle" });
  }

  // Local-only review draft. Re-initialises when the proposal set changes
  // (e.g. user imports a new session in another tab).
  const [reviewState, setReviewState] = useState<ConsolidationReviewState>(
    () => initializeConsolidationReviewState(proposals),
  );
  const [reviewProposalKey, setReviewProposalKey] = useState(() => proposalSignature(proposals));
  useEffect(() => {
    const nextKey = proposalSignature(proposals);
    if (nextKey !== reviewProposalKey) {
      setReviewState(resetConsolidationReviewState(proposals));
      setReviewProposalKey(nextKey);
      setSelectedId(proposals[0]?.id ?? null);
    }
  }, [proposals, reviewProposalKey]);

  const [selectedId, setSelectedId] = useState<string | null>(() => proposals[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Apply-pass state. Lives entirely in component memory; on success
  // the surface shows a banner with counts + a link back to Memory.
  const [applyState, setApplyState] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | {
        kind: "saved";
        summary: AcceptedMemoryApplySummary;
        savedMemories: StoredAcceptedProjectMemory[];
        source: AcceptedMemoryStorageSource;
        fellBack: boolean;
        fallbackReason?: string;
      }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Storage destination the apply pass will use, before it runs. The
  // banner shows the actual source (with a fallback note) after apply.
  const expectedStorageSource: AcceptedMemoryStorageSource = useMemo(
    () => (getAcceptedMemoryRepository().isDesktop() ? "desktop-sqlite" : "browser-local-storage"),
    [],
  );
  const hasAcceptedOrEdited = useMemo(
    () => Object.values(reviewState.entries).some((entry) =>
      entry.status === "accepted" || entry.status === "edited" ||
      entry.status === "watching" || entry.status === "deferred",
    ),
    [reviewState],
  );

  async function handleApply() {
    if (applyState.kind === "saving") return;
    setApplyState({ kind: "saving" });
    try {
      const memoryRepository = getAcceptedMemoryRepository();
      const existing = await memoryRepository.listAcceptedProjectMemories(projectId);
      const result = buildAcceptedMemoriesFromReviewDraft({
        projectId,
        reviewState,
        appliedAt: new Date().toISOString(),
        existingMemories: existing.data,
        runId: reviewState.draftId,
      });
      const savedResult = await memoryRepository.saveAcceptedProjectMemories(
        projectId,
        result.memoriesToSave,
      );
      const actionsResult = await memoryRepository.appendMemoryReviewActions(
        projectId,
        result.reviewActionsToAppend,
      );
      // The pass is honest about where it actually landed: if either
      // write fell back to localStorage, the banner says so.
      const fellBack = savedResult.fellBack || actionsResult.fellBack;
      setApplyState({
        kind: "saved",
        summary: result.summary,
        savedMemories: savedResult.data,
        source: fellBack ? "browser-local-storage" : savedResult.source,
        fellBack,
        fallbackReason: savedResult.fallbackReason ?? actionsResult.fallbackReason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApplyState({ kind: "error", message });
    }
  }

  const grouped = useMemo(() => groupByKind(proposals, reviewState), [proposals, reviewState]);
  const counts = useMemo(() => countConsolidationReviewStatuses(reviewState), [reviewState]);
  const selectedEntry: ConsolidationReviewEntry | null =
    selectedId ? getReviewEntry(reviewState, selectedId) : null;

  const dataBasisTone = getProjectMemoryDataBasisTone(consolidationState.dataBasis);

  return (
    <div className={embedded ? "consolidation-review-page is-embedded" : "page consolidation-review-page"}>
      <ActionBar
        label="메모리 통합 검토"
        start={
          <>
            <span className="action-bar-context">메모리 통합 검토</span>
            <Badge tone={dataBasisTone}>{viewModel.dataBasisLabel}</Badge>
            <Badge tone="purple">{consolidationState.proposalCount}개 제안</Badge>
          </>
        }
        end={
          embedded ? (
            onBack ? (
              <Button icon={ArrowLeft} onClick={onBack}>
                메모리로
              </Button>
            ) : undefined
          ) : (
            <Button icon={ArrowLeft} onClick={() => setCurrentView("memory")}>
              Memory로 돌아가기
            </Button>
          )
        }
      />

      {proposals.length === 0 ? (
        // Compact empty path: the standing apply banner has six zero
        // tiles + a long privacy paragraph that read as noise when there
        // is nothing to review. Drop it for a single hero empty state.
        <ConsolidationEmptyHero
          consolidationState={consolidationState}
          expectedSource={expectedStorageSource}
        />
      ) : (
        <ApplyBoundaryBanner
          counts={counts}
          canApply={hasAcceptedOrEdited}
          applyState={applyState}
          expectedSource={expectedStorageSource}
          onApply={handleApply}
          onBackToMemory={() => setCurrentView("memory")}
        />
      )}

      <ImportPackagePanel
        text={packageText}
        message={importMessage}
        onTextChange={setPackageText}
        onLoad={handleImportPackage}
        onPickFile={handleImportPackageFile}
        onPickNativeFile={handlePickNativePackageFile}
        onClear={handleClearImport}
      />

      <div className="consolidation-review-layout">
        <section className="consolidation-review-list" aria-label="제안 그룹">
          {KIND_ORDER.map((kind) => {
            const entries = grouped.get(kind) ?? [];
            if (entries.length === 0) return null;
            return (
              <BaseSection
                key={kind}
                title={
                  <span className="consolidation-group-title">
                    <BrainCircuit size={14} aria-hidden="true" /> {describeProposalKind(kind)}
                  </span>
                }
                hint={<span>{KIND_HINT[kind]}</span>}
                actions={<Badge tone="gray">{entries.length}개</Badge>}
                ariaLabel={describeProposalKind(kind)}
              >
                <div className="consolidation-group-cards">
                  {entries.map((entry) => (
                    <ConsolidationProposalCard
                      key={entry.proposal.id}
                      entry={entry}
                      isSelected={selectedId === entry.proposal.id}
                      onSelect={() => setSelectedId(entry.proposal.id)}
                      onAccept={() => setReviewState((state) => acceptProposal(state, entry.proposal.id))}
                      onDiscard={() => setReviewState((state) => discardProposal(state, entry.proposal.id))}
                      onKeepWatching={() => setReviewState((state) => keepWatchingProposal(state, entry.proposal.id))}
                      onDefer={() => setReviewState((state) => deferProposal(state, entry.proposal.id))}
                      onReset={() => setReviewState((state) => resetProposal(state, entry.proposal.id))}
                      onEdit={() => {
                        setSelectedId(entry.proposal.id);
                        setEditingId(entry.proposal.id);
                      }}
                    />
                  ))}
                </div>
              </BaseSection>
            );
          })}
          {/* When the page is empty the ConsolidationEmptyHero above
              already carries the calm "no proposals" copy — repeating it
              here just left a large unused column below the import panel.
              We keep the list section mounted (sans repeat) so the right
              evidence column stays consistent with the populated layout. */}
        </section>

        <ConsolidationEvidencePanel
          entry={selectedEntry}
          dataBasisLabel={viewModel.dataBasisLabel}
        />
      </div>

      {editingId !== null ? (
        <InlineEditor
          entry={getReviewEntry(reviewState, editingId)}
          onClose={() => setEditingId(null)}
          onSave={(edits) => {
            if (editingId) {
              setReviewState((state) => editProposal(state, editingId, edits));
            }
            setEditingId(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── pieces ─────────────────────────────────────────────────────────

function ImportPackagePanel({
  text,
  message,
  onTextChange,
  onLoad,
  onPickFile,
  onPickNativeFile,
  onClear,
}: {
  text: string;
  message: ImportPackageMessage;
  onTextChange: (value: string) => void;
  onLoad: () => void;
  onPickFile: (file: File) => void;
  onPickNativeFile: () => void;
  onClear: () => void;
}) {
  // Desktop opens a native file dialog; the browser uses the `File`
  // input. Both route the picked package through the same review path.
  const desktop = isTauriRuntime();
  return (
    <details className="consolidation-review-import">
      <summary>
        <strong>.mori 패키지에서 확정 메모리 가져오기</strong>
        <span>붙여넣거나 파일로 선택한 .mori v0 패키지의 확정 메모리를 검토 제안으로 추가합니다.</span>
      </summary>
      <p className="consolidation-review-import-note">
        가져온 메모리는 자동 병합되지 않습니다. 아래 검토 목록에 제안으로 추가되며, 수락해야만
        이 프로젝트의 메모리가 됩니다. 이미 보유한 항목(originProposalIds / 제목 일치)은
        건너뜁니다.
      </p>
      <textarea
        className="consolidation-review-import-textarea"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="여기에 .mori v0 패키지 JSON을 붙여넣거나 아래에서 파일을 선택하세요"
        rows={5}
        aria-label=".mori package JSON"
      />
      <div className="consolidation-review-import-actions">
        <Button
          variant="primary"
          onClick={onLoad}
          disabled={text.trim().length === 0}
          title={
            text.trim().length === 0
              ? "붙여넣은 .mori 패키지 JSON이 없습니다."
              : "붙여넣은 .mori v0 패키지를 검토 큐로 불러옵니다."
          }
        >
          패키지 불러오기
        </Button>
        {desktop ? (
          <Button onClick={onPickNativeFile}>파일 선택</Button>
        ) : (
          <label className="consolidation-review-import-file">
            <input
              type="file"
              accept=".mori,.json,application/json"
              aria-label=".mori package file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickFile(file);
                // Reset so picking the same file again re-triggers onChange.
                event.target.value = "";
              }}
            />
            <span>파일 선택</span>
          </label>
        )}
        <Button onClick={onClear}>지우기</Button>
      </div>
      {message.kind === "ok" ? (
        <p className="consolidation-review-import-result tone-ok">
          {message.packageId} · 확정 메모리 {message.memoryCount}건 중 제안 {message.added}건
          추가
          {message.skipped > 0 ? ` · 중복 ${message.skipped}건 건너뜀` : ""}.
        </p>
      ) : null}
      {message.kind === "ok" && message.isClientSafe ? (
        <p className="consolidation-review-import-note">
          이 패키지는 client-safe export입니다 — 내보낸 쪽에서 client-safe가 아닌 memory는
          제외되었을 수 있으므로 완전한 handoff가 아닐 수 있습니다.
        </p>
      ) : null}
      {message.kind === "error" ? (
        <p className="consolidation-review-import-result tone-error">
          패키지를 불러오지 못했습니다: {message.message}
        </p>
      ) : null}
    </details>
  );
}

function ApplyBoundaryBanner({
  counts,
  canApply,
  applyState,
  expectedSource,
  onApply,
  onBackToMemory,
}: {
  counts: ReturnType<typeof countConsolidationReviewStatuses>;
  canApply: boolean;
  applyState:
    | { kind: "idle" }
    | { kind: "saving" }
    | {
        kind: "saved";
        summary: AcceptedMemoryApplySummary;
        savedMemories: StoredAcceptedProjectMemory[];
        source: AcceptedMemoryStorageSource;
        fellBack: boolean;
        fallbackReason?: string;
      }
    | { kind: "error"; message: string };
  expectedSource: AcceptedMemoryStorageSource;
  onApply: () => void;
  onBackToMemory: () => void;
}) {
  const applyCount = counts.accepted + counts.edited + counts.watching + counts.deferred;
  return (
    <div className="consolidation-review-apply" role="status" aria-live="polite">
      <header>
        <strong>메모리 반영</strong>
        <Badge tone="purple">{describeAcceptedMemoryStorageSource(expectedSource)}</Badge>
      </header>
      <p>
        수락 · 편집 · 관찰 · 연기한 제안이{" "}
        {expectedSource === "desktop-sqlite"
          ? "데스크톱 SQLite에 저장됩니다"
          : "브라우저 저장소에 저장됩니다"}
        . 폐기한 제안은 감사 로그에만 남습니다. 모든 검토 액션은 로컬에서만 저장됩니다.
      </p>
      <dl className="consolidation-review-counts">
        <CountTile label="제안" value={counts.proposed} />
        <CountTile label="수락" value={counts.accepted} tone="green" />
        <CountTile label="편집" value={counts.edited} tone="blue" />
        <CountTile label="관찰" value={counts.watching} tone="purple" />
        <CountTile label="연기" value={counts.deferred} tone="orange" />
        <CountTile label="폐기" value={counts.discarded} tone="red" />
      </dl>
      <footer>
        <Button
          variant="primary"
          disabled={!canApply || applyState.kind === "saving"}
          onClick={onApply}
          title={
            applyState.kind === "saving"
              ? "저장 중입니다."
              : canApply
                ? "검토 결정을 로컬 저장소에 반영합니다."
                : "수락 · 편집 · 관찰 · 연기로 표시한 제안이 없습니다."
          }
        >
          {applyState.kind === "saving"
            ? "저장 중…"
            : `메모리 반영 (${applyCount})`}
        </Button>
        <small>
          {canApply
            ? "모든 검토 액션은 로컬에서만 저장됩니다. 클라우드 동기화 / 외부 계정 접근 없음."
            : "수락 / 편집 / 관찰 / 연기한 제안이 하나도 없으면 비활성화됩니다."}
        </small>
      </footer>
      {applyState.kind === "saved" ? (
        <div className="consolidation-review-apply-result tone-ok">
          <strong>
            {applyState.summary.savedMemoryCount}건의 메모리를{" "}
            {describeAcceptedMemoryStorageSource(applyState.source)}에 저장했습니다.
          </strong>
          <span>
            감사 로그 {applyState.summary.reviewActionCount}건 기록. 메모리 페이지의 확정 메모리
            카드와 Resume 프롬프트 · 보고서에서 확인할 수 있습니다.
          </span>
          {applyState.fellBack ? (
            <span className="consolidation-review-apply-fallback">
              데스크톱 SQLite 저장에 실패해 브라우저 저장소로 안전하게 대체했습니다
              {applyState.fallbackReason ? `: ${applyState.fallbackReason}` : "."}
            </span>
          ) : null}
          <div className="consolidation-review-apply-actions">
            <Button onClick={onBackToMemory}>Memory로 돌아가기</Button>
          </div>
        </div>
      ) : null}
      {applyState.kind === "error" ? (
        <div className="consolidation-review-apply-result tone-error">
          <strong>저장에 실패했습니다.</strong>
          <span>{applyState.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function CountTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`consolidation-count-tile${tone ? ` tone-${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Compact hero shown above the import panel when there are zero
 * proposals. Replaces the standing apply banner — six zero counters +
 * the privacy paragraph were noise when the user hasn't accumulated any
 * memory yet. The hero is one row: icon, headline, supporting line,
 * optional warning chip.
 */
function ConsolidationEmptyHero({
  consolidationState,
  expectedSource,
}: {
  consolidationState: ReturnType<typeof buildProjectMemoryConsolidationState>;
  expectedSource: AcceptedMemoryStorageSource;
}) {
  const warningCount = consolidationState.warnings.length;
  return (
    <section className="consolidation-empty-hero" aria-label="제안 없음">
      <div className="consolidation-empty-hero-icon" aria-hidden="true">
        <BrainCircuit size={18} />
      </div>
      <div className="consolidation-empty-hero-body">
        <strong>검토할 제안이 없습니다</strong>
        <p>
          {consolidationState.emptyReason ??
            "세션을 더 저장하거나 Quick Pass를 실행하면 새 제안이 모입니다."}{" "}
          저장 위치는 {describeAcceptedMemoryStorageSource(expectedSource)}.
        </p>
      </div>
      {warningCount > 0 ? (
        <Badge tone="orange">데이터 범위 경고 {warningCount}건</Badge>
      ) : null}
    </section>
  );
}

function InlineEditor({
  entry,
  onClose,
  onSave,
}: {
  entry: ConsolidationReviewEntry | null;
  onClose: () => void;
  onSave: (edits: { title?: string | null; summary?: string | null }) => void;
}) {
  const [title, setTitle] = useState(entry ? (entry.edits.title ?? entry.proposal.title) : "");
  const [summary, setSummary] = useState(entry ? (entry.edits.summary ?? entry.proposal.summary) : "");
  if (!entry) return null;
  return (
    <div className="consolidation-edit-modal" role="dialog" aria-modal="true">
      <div className="consolidation-edit-modal-body">
        <header>
          <strong>제안 편집</strong>
          <Button icon={X} onClick={onClose}>
            닫기
          </Button>
        </header>
        <label>
          <span>제목</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>요약</span>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} />
        </label>
        <footer>
          <Button
            variant="primary"
            onClick={() => {
              onSave({
                title: title === entry.proposal.title ? null : title,
                summary: summary === entry.proposal.summary ? null : summary,
              });
            }}
          >
            저장 (드래프트)
          </Button>
          <small>편집은 메모리 반영을 누르기 전까지 이 검토 세션에만 유지됩니다.</small>
        </footer>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────

function groupByKind(
  proposals: readonly MemoryProposal[],
  state: ConsolidationReviewState,
): Map<MemoryProposalKind, ConsolidationReviewEntry[]> {
  const map = new Map<MemoryProposalKind, ConsolidationReviewEntry[]>();
  for (const proposal of proposals) {
    const entry = state.entries[proposal.id];
    if (!entry) continue;
    const bucket = map.get(proposal.kind);
    if (bucket) bucket.push(entry);
    else map.set(proposal.kind, [entry]);
  }
  return map;
}

function proposalSignature(proposals: readonly MemoryProposal[]): string {
  return proposals.map((proposal) => proposal.id).join("|");
}
