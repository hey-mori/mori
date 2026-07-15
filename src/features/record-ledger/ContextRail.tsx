/**
 * ContextRail · the time-mode content of the workspace's right rail (R3).
 *
 * When no record is selected the rail is the time anchor: a month calendar,
 * this week's roll-up (the old 합계 panel's one-line heir), and, when a day
 * is picked, that day's agenda. Selecting a record swaps this whole slot for
 * the RecordInspector (handled by the workspace); deselecting returns here
 * with the picked day intact.
 */
import { useMemo } from "react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";
import { MiniCalendar } from "./MiniCalendar";
import { buildWeekSummary } from "./ledgerRailSummary";
import { dayLabel } from "./calendarGrouping";
import { displayTime, schemaLabel } from "./recordPresentation";

export function ContextRail({
  records,
  registry,
  contexts,
  selectedDate,
  onSelectDate,
  onSelectRecord,
  now,
}: {
  /** Ledger-visible records (active + provisional). */
  records: MoriRecord[];
  registry: SchemaRegistry;
  contexts: KernelContext[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onSelectRecord: (recordId: string) => void;
  now: Date;
}) {
  const week = useMemo(() => buildWeekSummary(records, registry, now), [records, registry, now]);

  const dayRecords = useMemo(() => {
    if (!selectedDate) return [];
    return records
      .filter((record) => record.occurredStart?.slice(0, 10) === selectedDate)
      .sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
  }, [records, selectedDate]);

  return (
    <aside className="context-rail base-scroll" aria-label="시간 맥락">
      <MiniCalendar records={records} selectedDate={selectedDate} onSelectDate={onSelectDate} />

      {selectedDate ? (
        <section className="rail-section">
          <header className="rail-section-head">
            <span>{dayLabel(selectedDate, now)}</span>
            <button type="button" className="rail-clear" onClick={() => onSelectDate(null)}>
              전체 보기
            </button>
          </header>
          {dayRecords.length > 0 ? (
            <ul className="rail-agenda">
              {dayRecords.map((record) => (
                <li key={record.id}>
                  <button type="button" className="rail-agenda-item" onClick={() => onSelectRecord(record.id)}>
                    <span className="rail-agenda-kind">{schemaLabel(record, registry)}</span>
                    <span className="rail-agenda-title">{record.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rail-empty">이 날에는 기록이 없습니다.</p>
          )}
        </section>
      ) : null}

      <section className="rail-section">
        <header className="rail-section-head">
          <span>이번 주</span>
          {week.total > 0 ? <span className="rail-section-count">{week.total}건</span> : null}
        </header>
        {week.total > 0 ? (
          <div className="rail-week">
            <p className="rail-week-kinds">
              {week.kinds.map((kind) => `${kind.name} ${kind.count}`).join(" · ")}
            </p>
            {week.metricLine ? <p className="rail-week-metric">{week.metricLine}</p> : null}
          </div>
        ) : (
          <p className="rail-empty">이번 주 기록이 아직 없습니다.</p>
        )}
      </section>
    </aside>
  );
}
