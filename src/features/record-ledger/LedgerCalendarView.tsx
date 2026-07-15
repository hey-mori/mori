/**
 * LedgerCalendarView · the ledger calendar (R5, screen M4). A body takeover
 * opened from the rail mini-calendar: month cells show the day's records
 * (kind-colored marks + leading titles + a more count), not an empty grid.
 * Selecting a day filters the rail agenda; the 날짜 미정 tray under the grid
 * assigns a day by click (the guaranteed path) or drag (an accelerator).
 * Returns to the timeline via the header.
 */
import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, ListTree } from "lucide-react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { recordsByDate } from "./calendarGrouping";
import { isDateUndecided } from "./dateResolution";
import { kindColorClass, schemaLabel } from "./recordPresentation";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_TITLES = 2;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function LedgerCalendarView({
  records,
  registry,
  selectedDate,
  onSelectDate,
  onAssignDate,
  onSelectRecord,
  onClose,
  now,
}: {
  records: MoriRecord[];
  registry: SchemaRegistry;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onAssignDate: (record: MoriRecord, date: string) => void;
  onSelectRecord: (recordId: string) => void;
  onClose: () => void;
  now: Date;
}) {
  const [cursor, setCursor] = useState(() => {
    const base = selectedDate ? new Date(`${selectedDate}T00:00:00`) : now;
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const byDate = useMemo(() => recordsByDate(records), [records]);
  const undecided = useMemo(() => records.filter(isDateUndecided), [records]);
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());

  const cells = useMemo(() => {
    const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) out.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push({ day, date: iso(cursor.year, cursor.month, day) });
    }
    return out;
  }, [cursor]);

  const monthLabel = `${cursor.year}년 ${cursor.month + 1}월`;
  const monthCount = useMemo(() => {
    const prefix = `${cursor.year}-${pad(cursor.month + 1)}`;
    let total = 0;
    for (const [date, list] of byDate) if (date.startsWith(prefix)) total += list.length;
    return total;
  }, [byDate, cursor]);

  const shiftMonth = (delta: number) =>
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const assignFromDrag = (event: React.DragEvent, date: string) => {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData("text/plain");
    const record = undecided.find((candidate) => candidate.id === id);
    if (record) onAssignDate(record, date);
  };

  return (
    <div className="ledger-calendar">
      <header className="ledger-calendar-head">
        <button type="button" className="ledger-calendar-back" onClick={onClose}>
          <ListTree size={14} aria-hidden="true" />
          기록으로
        </button>
        <div className="ledger-calendar-nav">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="ledger-calendar-month">{monthLabel}</span>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <span className="ledger-calendar-count">기록 {monthCount}건</span>
      </header>

      <div className="ledger-calendar-weekdays">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="ledger-calendar-grid">
        {cells.map((cell, index) =>
          cell === null ? (
            <span key={`blank-${index}`} className="ledger-calendar-cell is-blank" />
          ) : (
            <div
              key={cell.date}
              className={`ledger-calendar-cell${cell.date === selectedDate ? " is-selected" : ""}${
                cell.date === todayIso ? " is-today" : ""
              }${dropTarget === cell.date ? " is-drop" : ""}`}
              onDragOver={(event) => {
                if (undecided.length > 0) {
                  event.preventDefault();
                  setDropTarget(cell.date);
                }
              }}
              onDragLeave={() => setDropTarget((current) => (current === cell.date ? null : current))}
              onDrop={(event) => assignFromDrag(event, cell.date)}
            >
              <button
                type="button"
                className="ledger-calendar-num"
                onClick={() => onSelectDate(cell.date === selectedDate ? null : cell.date)}
                aria-label={`${cell.day}일 선택`}
              >
                {cell.day}
              </button>
              <CellEntries
                records={byDate.get(cell.date) ?? []}
                registry={registry}
                todayIso={todayIso}
                onSelectRecord={onSelectRecord}
              />
            </div>
          ),
        )}
      </div>

      {undecided.length > 0 ? (
        <section className="ledger-tray">
          <header className="ledger-tray-head">
            <CalendarClock size={14} aria-hidden="true" />
            <span>날짜 미정 {undecided.length}건</span>
            <span className="ledger-tray-hint">
              {selectedDate ? "선택한 날에 배정하거나 셀로 끌어다 놓으세요" : "날짜를 고르면 배정할 수 있어요"}
            </span>
          </header>
          <ul className="ledger-tray-list">
            {undecided.map((record) => (
              <li
                key={record.id}
                className="ledger-tray-item"
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", record.id)}
              >
                <button
                  type="button"
                  className="ledger-tray-open"
                  onClick={() => onSelectRecord(record.id)}
                  title="열기"
                >
                  <span className={`ledger-cell-dot ${kindColorClass(record.schemaId)}`} aria-hidden="true" />
                  <span className="ledger-tray-title">{record.title}</span>
                </button>
                {selectedDate ? (
                  <button
                    type="button"
                    className="ledger-tray-assign"
                    onClick={() => onAssignDate(record, selectedDate)}
                  >
                    이 날에
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CellEntries({
  records,
  registry,
  todayIso,
  onSelectRecord,
}: {
  records: MoriRecord[];
  registry: SchemaRegistry;
  todayIso: string;
  onSelectRecord: (recordId: string) => void;
}) {
  if (records.length === 0) return null;
  const shown = records.slice(0, MAX_TITLES);
  const more = records.length - shown.length;
  return (
    <div className="ledger-cell-entries">
      {shown.map((record) => {
        const planned = (record.occurredStart?.slice(0, 10) ?? "") > todayIso;
        return (
          <button
            key={record.id}
            type="button"
            className={`ledger-cell-entry${planned ? " is-planned" : ""}`}
            onClick={() => onSelectRecord(record.id)}
            title={record.title}
          >
            <span className={`ledger-cell-dot ${kindColorClass(record.schemaId)}`} aria-hidden="true" />
            <span className="ledger-cell-title">{record.title}</span>
          </button>
        );
      })}
      {more > 0 ? <span className="ledger-cell-more">+{more}</span> : null}
      <span className="ledger-cell-sr">{schemaLabel(records[0], registry)}</span>
    </div>
  );
}
