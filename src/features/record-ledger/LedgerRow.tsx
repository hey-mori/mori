/**
 * LedgerRow · one record row, shared by 오늘 and 캘린더 so the two surfaces
 * never drift. A button (selectable) showing the schema, title, status badge,
 * and optionally the time.
 */
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { displayTime, schemaLabel, statusBadge } from "./recordPresentation";

export function LedgerRow({
  record,
  registry,
  selected,
  onSelect,
  showTime = true,
}: {
  record: MoriRecord;
  registry: SchemaRegistry;
  selected: boolean;
  onSelect: () => void;
  /** Hide the row time when a day header already conveys the date. */
  showTime?: boolean;
}) {
  const badge = statusBadge(record.status);
  const time = displayTime(record);
  return (
    <li>
      <button
        type="button"
        className={`ledger-row${selected ? " is-selected" : ""}`}
        onClick={onSelect}
      >
        <div className="ledger-row-head">
          <span className="ledger-row-kind">{schemaLabel(record, registry)}</span>
          <span className="ledger-row-title">{record.title}</span>
          {badge ? <BaseStatusBadge tone={badge.tone}>{badge.label}</BaseStatusBadge> : null}
        </div>
        {showTime ? (
          <div className="ledger-row-meta">
            <span>
              {time.isCaptureFallback ? "기록함 " : ""}
              {formatClaudeRelativeKo(time.iso)}
            </span>
          </div>
        ) : null}
      </button>
    </li>
  );
}
