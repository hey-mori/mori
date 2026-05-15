import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BrainCircuit, X } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { MoriSection } from "../../components/ui/MoriSection";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriSqliteStore } from "../../app/sqliteStore";
import { useMoriAppStore } from "../../app/store";
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
import { parseImportedMemoryProposals } from "../../lib/project-memory/importedMemoryReview";
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
  keyEvidence: "참조가 많은 핵심 증거 출처를 표시합니다.",
  unresolvedRisk: "해소되지 않은 위험을 검토합니다.",
  contradiction: "충돌하는 결정 / 메모리를 검토합니다.",
  staleMemory: "오래된 메모리를 검토합니다.",
  nextSessionRecommendation: "다음 세션에서 다룰 작업을 제안합니다.",
};

type ImportPackageMessage =
  | { kind: "idle" }
  | { kind: "ok"; packageId: string; added: number; skipped: number; memoryCount: number }
  | { kind: "error"; message: string };

export function ConsolidationReviewView() {
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  // Mirror MemoryView's data pipeline. Pure derivation; cheap.
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const sqliteSessions = useMoriSqliteStore((state) => state.sessions);
  const repository = useMemo(() => createBrowserDraftRepository(), []);
  const browserSessionSummaries = useMemo<StoredSessionSummary[]>(
    () => repository.listStoredSessions(),
    [repository, view.session.id],
  );
  const importsBySessionId = useMemo<Record<string, StoredSessionImport[]>>(() => {
    const map: Record<string, StoredSessionImport[]> = {};
    for (const summary of browserSessionSummaries) {
      map[summary.sessionId] = repository.listSessionImports(summary.sessionId);
    }
    if (!map[view.session.id]) {
      map[view.session.id] = repository.listSessionImports(view.session.id);
    }
    return map;
  }, [repository, browserSessionSummaries, view.session.id]);
  const [packageDrafts, setPackageDrafts] = useState<StoredMoriPackageDraft[]>([]);
  useEffect(() => {
    setPackageDrafts(repository.listMoriPackageDrafts());
  }, [repository, view.session.id]);

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

  // `.mori` package import — explicit paste, never auto-merged.
  const [packageText, setPackageText] = useState("");
  const [importMessage, setImportMessage] = useState<ImportPackageMessage>({ kind: "idle" });

  function handleImportPackage() {
    const result = parseImportedMemoryProposals(packageText, acceptedMemories);
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
    });
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
    <div className="page consolidation-review-page">
      <PageHeader
        title="Memory Consolidation Review"
        subtitle="누적된 Project Memory에서 승격할 항목을 검토합니다. 영구 메모리는 사용자가 명시적으로 승인하기 전까지 작성되지 않습니다."
        right={
          <div className="consolidation-review-header-actions">
            <Badge tone={dataBasisTone}>{viewModel.dataBasisLabel}</Badge>
            <Badge tone="purple">{consolidationState.proposalCount}개 제안</Badge>
            <Button icon={ArrowLeft} onClick={() => setCurrentView("memory")}>
              Memory로 돌아가기
            </Button>
          </div>
        }
      />

      <ApplyBoundaryBanner
        counts={counts}
        canApply={hasAcceptedOrEdited}
        applyState={applyState}
        expectedSource={expectedStorageSource}
        onApply={handleApply}
        onBackToMemory={() => setCurrentView("memory")}
      />

      <ImportPackagePanel
        text={packageText}
        message={importMessage}
        onTextChange={setPackageText}
        onLoad={handleImportPackage}
        onClear={handleClearImport}
      />

      <div className="consolidation-review-layout">
        <section className="consolidation-review-list" aria-label="Proposal groups">
          {KIND_ORDER.map((kind) => {
            const entries = grouped.get(kind) ?? [];
            if (entries.length === 0) return null;
            return (
              <MoriSection
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
              </MoriSection>
            );
          })}
          {proposals.length === 0 ? (
            <EmptyState consolidationState={consolidationState} />
          ) : null}
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
  onClear,
}: {
  text: string;
  message: ImportPackageMessage;
  onTextChange: (value: string) => void;
  onLoad: () => void;
  onClear: () => void;
}) {
  return (
    <details className="consolidation-review-import">
      <summary>
        <strong>Import accepted memory from a .mori package</strong>
        <span>붙여넣은 .mori v0 패키지의 accepted memory를 검토 제안으로 추가합니다.</span>
      </summary>
      <p className="consolidation-review-import-note">
        가져온 memory는 자동 병합되지 않습니다. 아래 검토 목록에 제안으로 추가되며, 수락해야만
        이 프로젝트의 memory가 됩니다. 이미 보유한 항목(originProposalIds / 제목 일치)은
        건너뜁니다.
      </p>
      <textarea
        className="consolidation-review-import-textarea"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="여기에 .mori v0 패키지 JSON을 붙여넣으세요"
        rows={5}
        aria-label=".mori package JSON"
      />
      <div className="consolidation-review-import-actions">
        <Button variant="primary" onClick={onLoad} disabled={text.trim().length === 0}>
          패키지 불러오기
        </Button>
        <Button onClick={onClear}>지우기</Button>
      </div>
      {message.kind === "ok" ? (
        <p className="consolidation-review-import-result tone-ok">
          {message.packageId} · accepted memory {message.memoryCount}건 중 제안 {message.added}건
          추가
          {message.skipped > 0 ? ` · 중복 ${message.skipped}건 건너뜀` : ""}.
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
        <strong>Apply accepted memories</strong>
        <Badge tone="purple">{describeAcceptedMemoryStorageSource(expectedSource)}</Badge>
      </header>
      <p>
        수락 / 편집 / 관찰 / 연기 상태의 제안이{" "}
        {expectedSource === "desktop-sqlite"
          ? "데스크톱 SQLite에 영구 저장됩니다"
          : "브라우저 localStorage에 영구 저장됩니다"}
        . 폐기한 제안은 감사 로그에만 기록됩니다. 모든 검토 액션은 로컬에만 저장됩니다 — 클라우드
        동기화 / 외부 계정 접근 없음.
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
        >
          {applyState.kind === "saving"
            ? "저장 중…"
            : `Apply accepted memories (${applyCount})`}
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
            감사 로그 {applyState.summary.reviewActionCount}건 기록됨. Project Memory의 Accepted
            Project Memories 카드와 Resume Prompt / Reports에서 확인할 수 있습니다.
          </span>
          {applyState.fellBack ? (
            <span className="consolidation-review-apply-fallback">
              데스크톱 SQLite 저장에 실패해 브라우저 localStorage로 안전하게 대체했습니다
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

function EmptyState({
  consolidationState,
}: {
  consolidationState: ReturnType<typeof buildProjectMemoryConsolidationState>;
}) {
  return (
    <MoriSection title="제안 없음" ariaLabel="No proposals">
      <p>{consolidationState.emptyReason ?? "현재 검토할 제안이 없습니다."}</p>
      <p className="consolidation-review-honesty">
        Mori는 로컬에 저장된 세션 메모리에서만 제안을 도출합니다. 더 많은 세션을 저장하거나 Quick
        Pass를 실행하면 추가 제안이 표시될 수 있습니다.
      </p>
      <p className="consolidation-review-warnings">
        {consolidationState.warnings.length > 0
          ? `${consolidationState.warnings.length}건의 데이터 범위 경고가 있습니다 — Memory 페이지의 경고 띠를 확인하세요.`
          : "데이터 범위 경고는 없습니다."}
      </p>
    </MoriSection>
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
          <small>편집은 이 검토 세션 내에서만 유지됩니다.</small>
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
