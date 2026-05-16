import { BookCheck, Clock4, Eye } from "lucide-react";
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
}: {
  memories: StoredAcceptedProjectMemory[];
  reviewActionCount: number;
  storageSource: AcceptedMemoryStorageSource;
  storageFellBack: boolean;
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
      ariaLabel="Accepted Project Memories"
      title={
        <span className="memory-accepted-title">
          <BookCheck size={14} aria-hidden="true" /> Accepted Project Memories
        </span>
      }
      hint={
        <span>
          승인한 consolidation 결과를 로컬에 영구 저장합니다. Resume Prompt / Reports와의 연동은
          별도 capability에서 구현됩니다.
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
          아직 저장된 accepted memory가 없습니다. Memory Consolidation 카드에서 Review를 열고 제안을
          승인하면 여기 누적됩니다.
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
            return (
            <li key={memory.id} className={`lifecycle-${group}`}>
              <header>
                <strong title={memory.title}>{memory.title}</strong>
                <span className="memory-accepted-meta">
                  <MoriStatusBadge tone={proposalKindTone(memory.kind)}>
                    {describeProposalKind(memory.kind)}
                  </MoriStatusBadge>
                  <MoriStatusBadge tone={getProductMemoryStatusTone(memory.status)}>
                    {getProductMemoryStatusLabel(memory.status)}
                  </MoriStatusBadge>
                </span>
              </header>
              {memory.summary ? <p className="memory-accepted-summary">{memory.summary}</p> : null}
              <small>
                <Clock4 size={11} aria-hidden="true" /> {formatShort(memory.acceptedAt)}
                {" · "}
                <Eye size={11} aria-hidden="true" /> {memory.evidenceRefs.length}건 evidence ·
                {" "}
                {memory.sourceSessionIds.length}개 session
                {" · "}
                <MoriStatusBadge tone="neutral">로컬 전용</MoriStatusBadge>
              </small>
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
