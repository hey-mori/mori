/**
 * LedgerTimeline · the day-grouped journal body of 기록 (R3), replacing the
 * old flat FeedBody. Applied records grouped by activity day, newest first,
 * filtered by the selected calendar day and the search query, rendered as
 * rich `LedgerTimelineRow`s. Just-saved records highlight so their placement
 * is visible.
 */
import { useMemo } from "react";
import { useNow } from "../../lib/time/useNow";
import { Sparkles } from "lucide-react";
import { EmptyState } from "../../components/layout/EmptyState";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import { LedgerTimelineRow } from "./LedgerTimelineRow";
import { dayLabel, groupByActivityDay } from "./calendarGrouping";
import { ledgerVisibleRecords, schemaLabel } from "./recordPresentation";

export function LedgerTimeline({
  ledger,
  query,
  selectedDate,
  selectedId,
  newIds,
  onSelect,
}: {
  ledger: RecordLedger;
  query: string;
  selectedDate: string | null;
  selectedId: string | null;
  /** Ids just saved by the composer, highlighted in place. */
  newIds: string[];
  onSelect: (id: string) => void;
}) {
  const contextNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const context of ledger.contexts) map.set(context.id, context.name);
    return map;
  }, [ledger.contexts]);

  const groups = useMemo(() => {
    let visible = ledgerVisibleRecords(ledger.records);
    if (selectedDate) {
      visible = visible.filter((record) => record.occurredStart?.slice(0, 10) === selectedDate);
    }
    const text = query.trim().toLowerCase();
    if (text) {
      visible = visible.filter(
        (record) =>
          record.title.toLowerCase().includes(text) ||
          record.body.toLowerCase().includes(text) ||
          schemaLabel(record, ledger.registry).toLowerCase().includes(text),
      );
    }
    return groupByActivityDay(visible);
  }, [ledger.records, ledger.registry, selectedDate, query]);
  const now = useNow();
  const newIdSet = useMemo(() => new Set(newIds), [newIds]);

  const contextNameFor = (record: MoriRecord): string | null => {
    for (const id of record.contextIds) {
      const name = contextNameById.get(id);
      if (name) return name;
    }
    return null;
  };

  if (groups.length === 0) {
    const searching = query.trim().length > 0 || selectedDate;
    return searching ? (
      <EmptyState compact icon={Sparkles} title="조건에 맞는 기록이 없습니다" />
    ) : (
      <EmptyState
        compact
        icon={Sparkles}
        title="아직 기록이 없습니다"
        description="위에 무엇이든 적으면 Mori가 활동·지식·기록으로 정리해 여기에 쌓습니다."
      />
    );
  }

  return (
    <div className="timeline">
      {groups.map((group) => (
        <section key={group.date ?? "unknown"} className="timeline-day">
          <h2 className="timeline-day-head">
            {group.date ? dayLabel(group.date, now) : "날짜 미정"}
            <span className="timeline-day-count">{group.records.length}</span>
          </h2>
          <ul className="timeline-list">
            {group.records.map((record) => (
              <LedgerTimelineRow
                key={record.id}
                record={record}
                registry={ledger.registry}
                contextName={contextNameFor(record)}
                selected={record.id === selectedId}
                isNew={newIdSet.has(record.id)}
                onSelect={() => onSelect(record.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
