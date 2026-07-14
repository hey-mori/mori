/**
 * 캘린더 · the record ledger seen by the day the activity happened
 * (architecture doc §22: calendar keys on activity time, not capture time).
 * A date-grouped journal: each day heads a section of that day's records, and
 * records whose date Mori could not determine sit in a 날짜 미정 group rather
 * than being pinned to a fabricated day.
 */
import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { EmptyState } from "../../components/layout/EmptyState";
import { useRecordLedger } from "./useRecordLedger";
import { LedgerRow } from "./LedgerRow";
import { RecordInspector } from "./RecordInspector";
import { dayLabel, groupByActivityDay } from "./calendarGrouping";
import { ledgerVisibleRecords } from "./recordPresentation";

export function CalendarView() {
  const { records, registry, entities, loading, renameEntity } = useRecordLedger();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const groups = useMemo(() => groupByActivityDay(ledgerVisibleRecords(records)), [records]);
  const now = useMemo(() => new Date(), []);
  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="캘린더" />}>
      <div className={`ledger${selected ? " has-inspector" : ""}`}>
        <div className="ledger-main">
          {loading ? null : groups.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="아직 기록이 없습니다"
              description="오늘 화면에서 무엇이든 적으면, 활동한 날짜를 기준으로 여기에 날짜별로 모입니다."
            />
          ) : (
            groups.map((group) => (
              <section key={group.date ?? "unknown"} className="calendar-day">
                <h2 className="calendar-day-head">
                  {group.date ? dayLabel(group.date, now) : "날짜 미정"}
                  <span className="calendar-day-count">{group.records.length}</span>
                </h2>
                <ul className="ledger-list">
                  {group.records.map((record) => (
                    <LedgerRow
                      key={record.id}
                      record={record}
                      registry={registry}
                      selected={record.id === selectedId}
                      onSelect={() =>
                        setSelectedId((current) => (current === record.id ? null : record.id))
                      }
                      showTime={false}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        {selected ? (
          <RecordInspector
            record={selected}
            registry={registry}
            entities={entities}
            onRenameEntity={(entityId, newName) => void renameEntity(entityId, newName)}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
