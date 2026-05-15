import { useMemo, useState } from "react";
import { Clock4, History, StickyNote } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { MoriSection } from "../../components/ui/MoriSection";
import {
  buildMemoryAuditTrailViewModel,
  describeMemoryAuditAction,
  MEMORY_AUDIT_ACTION_TYPES,
  type MemoryAuditActionFilter,
  type MemoryAuditActionType,
} from "../../lib/project-memory/memoryAuditTrail";
import {
  describeAcceptedMemoryStorageSource,
  type AcceptedMemoryStorageSource,
} from "../../lib/project-memory/acceptedMemoryRepository";
import type { StoredMemoryReviewAction } from "../../lib/storage/storageTypes";

/**
 * Memory Audit Trail card on the Project Memory page.
 *
 * Renders the append-only review-action log produced by the
 * Consolidation Review apply path. Every row is local-only and shows
 * the action type, UTC time, affected-memory count, and an optional
 * reviewer note — never raw evidence content, transcripts, or local
 * paths. Undo / revert and SQLite-backed audit storage are separate,
 * still-planned capabilities.
 */
export function MemoryAuditTrailCard({
  actions,
  storageSource,
  storageFellBack,
}: {
  actions: StoredMemoryReviewAction[];
  storageSource: AcceptedMemoryStorageSource;
  storageFellBack: boolean;
}) {
  const [filter, setFilter] = useState<MemoryAuditActionFilter>("all");
  const viewModel = useMemo(
    () => buildMemoryAuditTrailViewModel(actions, { filter }),
    [actions, filter],
  );

  const availableFilters = MEMORY_AUDIT_ACTION_TYPES.filter(
    (type) => viewModel.actionTypeCounts[type] > 0,
  );

  return (
    <MoriSection
      className="memory-audit"
      ariaLabel="Memory Audit Trail"
      title={
        <span className="memory-audit-title">
          <History size={14} aria-hidden="true" /> Memory Audit Trail
        </span>
      }
      hint={
        <span>
          Consolidation Review에서 수행한 memory 검토 결정 기록입니다. 모두 로컬에만 저장되며 원본
          근거 내용은 표시하지 않습니다.
        </span>
      }
      actions={
        <Badge tone={viewModel.totalCount > 0 ? "green" : "gray"}>
          {viewModel.totalCount}건
        </Badge>
      }
    >
      {viewModel.isEmpty ? (
        <p className="memory-audit-empty">
          No memory review actions yet. Apply accepted memories from Consolidation Review to
          create an audit trail.
        </p>
      ) : (
        <>
          <div className="memory-audit-filters" role="group" aria-label="Filter by action type">
            <FilterChip
              label="All"
              count={viewModel.totalCount}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            {availableFilters.map((type) => (
              <FilterChip
                key={type}
                label={describeMemoryAuditAction(type)}
                count={viewModel.actionTypeCounts[type]}
                active={filter === type}
                onClick={() => setFilter(type)}
              />
            ))}
          </div>

          {viewModel.filteredCount === 0 ? (
            <p className="memory-audit-empty">선택한 작업 유형에 해당하는 기록이 없습니다.</p>
          ) : (
            <ul className="memory-audit-groups">
              {viewModel.groups.map((group) => (
                <li key={group.dateKey} className="memory-audit-group">
                  <h4 className="memory-audit-date">{group.dateLabel}</h4>
                  <ul className="memory-audit-list">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className="memory-audit-entry">
                        <header>
                          <Badge tone={actionTone(entry.actionType)}>{entry.actionLabel}</Badge>
                          <span className="memory-audit-meta">
                            <Clock4 size={11} aria-hidden="true" /> {entry.timeLabel} UTC
                            {" · "}
                            {entry.targetMemoryCount}개 memory
                          </span>
                        </header>
                        {entry.note ? (
                          <p className="memory-audit-note">
                            <StickyNote size={11} aria-hidden="true" /> {entry.note}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <footer className="memory-audit-footer">
        <small>
          <Badge tone="gray">local-only</Badge>{" "}
          <Badge tone={storageSource === "desktop-sqlite" ? "green" : "purple"}>
            {describeAcceptedMemoryStorageSource(storageSource)}
          </Badge>{" "}
          {storageFellBack
            ? "데스크톱 SQLite를 사용할 수 없어 localStorage로 대체했습니다. "
            : ""}
          {viewModel.truncated ? "최근 기록만 표시됩니다. " : ""}
          Undo / revert와 `.mori v0` auditTrail export는 별도 capability로 예정되어 있습니다.
        </small>
      </footer>
    </MoriSection>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`memory-audit-chip ${active ? "is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label} <span className="memory-audit-chip-count">{count}</span>
    </button>
  );
}

function actionTone(actionType: MemoryAuditActionType):
  | "green" | "blue" | "orange" | "red" | "gray" | "purple" {
  switch (actionType) {
    case "apply":
      return "green";
    case "accept":
      return "green";
    case "edit":
      return "blue";
    case "watch":
      return "purple";
    case "defer":
      return "orange";
    case "discard":
      return "red";
    case "reset":
    default:
      return "gray";
  }
}
