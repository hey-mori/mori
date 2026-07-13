import { ArrowRight, BookCheck, ChevronRight, Clock4, Download, Eye, GitMerge, ListChecks } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { BaseSection } from "../../components/ui/BaseSection";
import { formatDateTime } from "../../lib/formatting/time";
import {
  describeProposalKind,
  proposalKindTone,
} from "../../lib/project-memory/projectMemoryConsolidationState";
import {
  describeAcceptedMemoryStorageSource,
  type AcceptedMemoryStorageSource,
} from "../../lib/project-memory/acceptedMemoryRepository";
import {
  getProductMemoryStatusLabel,
  getProductMemoryStatusTone,
} from "../../lib/product-state/productState";
import {
  classifyMemoryLifecycle,
  describeMemoryLifecycleGroup,
  memoryLifecycleGroupTone,
  memoryLifecycleSortWeight,
  summarizeMemoryLifecycle,
  type MemoryLifecycleGroup,
} from "../../lib/project-memory/memoryLifecycle";
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";

/**
 * Compact "Accepted Project Memories" card shown on the Memory
 * page. Reads from the browser repository's
 * `listAcceptedProjectMemories(projectId)` output. No raw evidence
 * content is rendered here — each row surfaces title, status,
 * acceptedAt, and evidence count only.
 *
 * Status, kind, and lifecycle tones all come from the shared
 * product-state model (`getProductMemoryStatusTone`,
 * `proposalKindTone`, `memoryLifecycleGroupTone`) so this card uses
 * the same tone scale as `BaseStatusBadge` everywhere else.
 */
export function AcceptedMemoriesCard({
  memories,
  reviewActionCount,
  storageSource,
  storageFellBack,
  loading = false,
  onSelectMemory,
  selectedMemoryId,
  onOpenConsolidation,
}: {
  memories: StoredAcceptedProjectMemory[];
  reviewActionCount: number;
  storageSource: AcceptedMemoryStorageSource;
  storageFellBack: boolean;
  /** When true, render skeleton rows instead of the "0건" empty state so a
   *  brief async load never reads as "you have no memories". */
  loading?: boolean;
  /** Open the per-memory provenance drawer when provided. */
  onSelectMemory?: (memoryId: string) => void;
  selectedMemoryId?: string | null;
  /** Route to the Consolidation review (the empty-state CTA). */
  onOpenConsolidation?: () => void;
}) {
  // "확정 메모리" is confirmed memory only. Provisional memory is auto-created
  // and unconfirmed, so it does not belong here (and must never be counted as
  // 관찰 중); it lives in the global 메모리 hub under its own 잠정 segment.
  const confirmed = memories.filter((memory) => memory.status !== "provisional");
  // Show current memory first and archived memory last so a bounded
  // preview never buries guidance-bearing records under retired ones.
  const ordered = [...confirmed].sort(
    (a, b) => memoryLifecycleSortWeight(a.status) - memoryLifecycleSortWeight(b.status),
  );
  const recent = ordered.slice(0, 6);
  const lifecycle = summarizeMemoryLifecycle(confirmed.map((memory) => memory.status));
  return (
    <BaseSection
      className="memory-accepted"
      ariaLabel="확정된 프로젝트 메모리"
      title={
        <span className="memory-accepted-title">
          <BookCheck size={14} aria-hidden="true" /> 확정 메모리
        </span>
      }
      hint={
        <span>
          승인한 통합 결과를 로컬에 영구 저장합니다. Resume 프롬프트 · 보고서와 연동됩니다.
        </span>
      }
      actions={
        <BaseStatusBadge tone={confirmed.length > 0 ? "success" : "neutral"}>
          {confirmed.length}건
        </BaseStatusBadge>
      }
    >
      {loading && confirmed.length === 0 ? (
        <MemoryListSkeleton />
      ) : confirmed.length === 0 ? (
        <MemoryLoopEmpty onOpenConsolidation={onOpenConsolidation} />
      ) : (
        <>
          <MemoryLifecycleStrip
            current={lifecycle.current}
            advisory={lifecycle.advisory}
            attention={lifecycle.attention}
            archived={lifecycle.archived}
          />
          <ul className="memory-accepted-list">
          {recent.map((memory) => {
            const group = classifyMemoryLifecycle(memory.status);
            const isSelected = selectedMemoryId === memory.id;
            const rowBody = (
              <>
                <header>
                  <strong title={memory.title}>{memory.title}</strong>
                  <span className="memory-accepted-meta">
                    <BaseStatusBadge tone={proposalKindTone(memory.kind)}>
                      {describeProposalKind(memory.kind)}
                    </BaseStatusBadge>
                    <BaseStatusBadge tone={getProductMemoryStatusTone(memory.status)}>
                      {getProductMemoryStatusLabel(memory.status)}
                    </BaseStatusBadge>
                    {onSelectMemory ? (
                      <ChevronRight
                        size={14}
                        aria-hidden="true"
                        className="memory-accepted-chevron"
                      />
                    ) : null}
                  </span>
                </header>
                {memory.summary ? <p className="memory-accepted-summary">{memory.summary}</p> : null}
                <small>
                  <Clock4 size={11} aria-hidden="true" /> {formatShort(memory.acceptedAt)}
                  {" · "}
                  <Eye size={11} aria-hidden="true" /> 근거 {memory.evidenceRefs.length}건
                  {" · "}
                  {memory.sourceSessionIds.length}개 세션
                  {" · "}
                  <BaseStatusBadge tone="neutral">로컬 전용</BaseStatusBadge>
                </small>
              </>
            );
            return (
              <li
                key={memory.id}
                className={`lifecycle-${group} ${isSelected ? "is-selected" : ""}`}
              >
                {onSelectMemory ? (
                  <button
                    type="button"
                    className="memory-accepted-row-button"
                    aria-pressed={isSelected}
                    aria-label={`${memory.title} — 메모리 자세히 보기`}
                    onClick={() => onSelectMemory(memory.id)}
                  >
                    {rowBody}
                  </button>
                ) : (
                  rowBody
                )}
              </li>
            );
          })}
          </ul>
        </>
      )}
      <footer className="memory-accepted-footer">
        <small>
          감사 로그 {reviewActionCount}건 기록됨 · 저장 위치:{" "}
          <BaseStatusBadge tone={storageSource === "desktop-sqlite" ? "success" : "info"}>
            {describeAcceptedMemoryStorageSource(storageSource)}
          </BaseStatusBadge>
          {storageFellBack
            ? " · 데스크톱 SQLite를 사용할 수 없어 localStorage로 안전하게 대체했습니다."
            : ""}
        </small>
      </footer>
    </BaseSection>
  );
}

/**
 * Empty state for the accepted-memory card. Rather than a single bare line,
 * it shows the four-step loop by which durable memory accumulates, so a
 * first-run / demo user understands *how* this surface fills — and gives a
 * direct route into the Consolidation review where memory is approved.
 */
function MemoryLoopEmpty({ onOpenConsolidation }: { onOpenConsolidation?: () => void }) {
  const steps: { icon: typeof Download; title: string; note: string }[] = [
    { icon: Download, title: "가져오기", note: "작업 소스를 세션으로 가져옵니다" },
    { icon: ListChecks, title: "검토", note: "이슈·결정을 확인합니다" },
    { icon: GitMerge, title: "통합", note: "세션 간 메모리를 검토합니다" },
    { icon: BookCheck, title: "확정 메모리", note: "승인하면 여기에 누적됩니다" },
  ];
  return (
    <div className="memory-loop">
      <p className="memory-loop-lead">
        아직 확정된 메모리가 없습니다. 메모리는 검토를 거쳐 이렇게 쌓입니다.
      </p>
      <ol className="memory-loop-steps">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          return (
            <li key={step.title} className={isLast ? "is-destination" : ""}>
              <span className="memory-loop-icon" aria-hidden="true">
                <Icon size={14} />
              </span>
              <span className="memory-loop-text">
                <strong>{step.title}</strong>
                <small>{step.note}</small>
              </span>
            </li>
          );
        })}
      </ol>
      {onOpenConsolidation ? (
        <Button variant="primary" size="sm" icon={ArrowRight} onClick={onOpenConsolidation}>
          메모리 통합 열기
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Lifecycle health strip above the accepted-memory list: how much of
 * the project's memory still carries guidance weight vs. needs review
 * vs. is archived. Reads the same lifecycle grouping the list rows use.
 */
function MemoryLifecycleStrip({
  current,
  advisory,
  attention,
  archived,
}: {
  current: number;
  advisory: number;
  attention: number;
  archived: number;
}) {
  const cells: { group: MemoryLifecycleGroup; count: number }[] = [
    { group: "current", count: current },
    { group: "attention", count: attention },
    { group: "advisory", count: advisory },
    { group: "archived", count: archived },
  ];
  return (
    <div className="memory-lifecycle-strip" role="group" aria-label="확정 메모리 수명 주기 상태">
      {cells.map((cell) => (
        <div key={cell.group} className={`memory-lifecycle-cell lifecycle-${cell.group}`}>
          <BaseStatusBadge tone={memoryLifecycleGroupTone(cell.group)}>
            {cell.count}
          </BaseStatusBadge>
          <span>{describeMemoryLifecycleGroup(cell.group)}</span>
        </div>
      ))}
    </div>
  );
}

function formatShort(iso: string): string {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

/**
 * Three muted placeholder rows shown while the repository read is in
 * flight. Calm enough to read as loading, not as content — three rows is
 * enough for the user to perceive "list is coming" without filling the
 * card on a surface that may turn out to be empty.
 */
function MemoryListSkeleton() {
  return (
    <ul
      className="memory-accepted-list memory-accepted-list-skeleton"
      aria-live="polite"
      aria-busy="true"
    >
      {[0, 1, 2].map((index) => (
        <li key={index} className="memory-accepted-skeleton-row">
          <span className="memory-accepted-skeleton-line memory-accepted-skeleton-line-title" />
          <span className="memory-accepted-skeleton-line memory-accepted-skeleton-line-meta" />
        </li>
      ))}
    </ul>
  );
}
