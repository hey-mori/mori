import { BookCheck, ChevronRight, Clock4, Eye } from "lucide-react";
import { MoriStatusBadge } from "../../components/ui/MoriStatusBadge";
import { MoriSection } from "../../components/ui/MoriSection";
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
 * the same tone scale as `MoriStatusBadge` everywhere else.
 */
export function AcceptedMemoriesCard({
  memories,
  reviewActionCount,
  storageSource,
  storageFellBack,
  onSelectMemory,
  selectedMemoryId,
}: {
  memories: StoredAcceptedProjectMemory[];
  reviewActionCount: number;
  storageSource: AcceptedMemoryStorageSource;
  storageFellBack: boolean;
  /** Open the per-memory provenance drawer when provided. */
  onSelectMemory?: (memoryId: string) => void;
  selectedMemoryId?: string | null;
}) {
  // Show current memory first and archived memory last so a bounded
  // preview never buries guidance-bearing records under retired ones.
  const ordered = [...memories].sort(
    (a, b) => memoryLifecycleSortWeight(a.status) - memoryLifecycleSortWeight(b.status),
  );
  const recent = ordered.slice(0, 6);
  const lifecycle = summarizeMemoryLifecycle(memories.map((memory) => memory.status));
  return (
    <MoriSection
      className="memory-accepted"
      ariaLabel="확정된 프로젝트 메모리"
      title={
        <span className="memory-accepted-title">
          <BookCheck size={14} aria-hidden="true" /> 확정 메모리
        </span>
      }
      hint={
        <span>
          승인한 통합 결과를 로컬에 영구 저장합니다. Resume 프롬프트 · 리포트와 연동됩니다.
        </span>
      }
      actions={
        <MoriStatusBadge tone={memories.length > 0 ? "success" : "neutral"}>
          {memories.length}건
        </MoriStatusBadge>
      }
    >
      {memories.length === 0 ? (
        <p className="memory-accepted-empty">
          아직 확정된 메모리가 없습니다. 메모리 통합 카드에서 검토를 열고 제안을 승인하면 여기에
          누적됩니다.
        </p>
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
                    <MoriStatusBadge tone={proposalKindTone(memory.kind)}>
                      {describeProposalKind(memory.kind)}
                    </MoriStatusBadge>
                    <MoriStatusBadge tone={getProductMemoryStatusTone(memory.status)}>
                      {getProductMemoryStatusLabel(memory.status)}
                    </MoriStatusBadge>
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
                  <MoriStatusBadge tone="neutral">로컬 전용</MoriStatusBadge>
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
          <MoriStatusBadge tone={storageSource === "desktop-sqlite" ? "success" : "info"}>
            {describeAcceptedMemoryStorageSource(storageSource)}
          </MoriStatusBadge>
          {storageFellBack
            ? " · 데스크톱 SQLite를 사용할 수 없어 localStorage로 안전하게 대체했습니다."
            : ""}
        </small>
      </footer>
    </MoriSection>
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
    <div className="memory-lifecycle-strip" role="group" aria-label="Accepted memory lifecycle health">
      {cells.map((cell) => (
        <div key={cell.group} className={`memory-lifecycle-cell lifecycle-${cell.group}`}>
          <MoriStatusBadge tone={memoryLifecycleGroupTone(cell.group)}>
            {cell.count}
          </MoriStatusBadge>
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
