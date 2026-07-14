/**
 * LedgerCalendar · a collapsible month calendar over the ledger. Collapsed by
 * default (a slim bar), it expands to a month grid where days that hold
 * records are marked and clicking a day filters the feed to it. Temporal
 * navigation without a whole separate 캘린더 menu (IA consolidation).
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { recordCountByDate } from "./calendarGrouping";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function LedgerCalendar({
  records,
  selectedDate,
  onSelectDate,
}: {
  records: MoriRecord[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  // The visible month, seeded from the selected date or today.
  const [cursor, setCursor] = useState(() => {
    const base = selectedDate ? new Date(`${selectedDate}T00:00:00`) : today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const counts = useMemo(() => recordCountByDate(records), [records]);
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

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
  const shiftMonth = (delta: number) =>
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  return (
    <div className={`ledger-cal${open ? " is-open" : ""}`}>
      <div className="ledger-cal-bar">
        <button
          type="button"
          className="ledger-cal-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <CalendarDays size={14} aria-hidden="true" />
          <span>{monthLabel}</span>
          <ChevronDown size={14} aria-hidden="true" className="ledger-cal-chevron" />
        </button>
        {selectedDate ? (
          <button type="button" className="ledger-cal-clear" onClick={() => onSelectDate(null)}>
            {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8, 10))}일 보기
            <X size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="ledger-cal-grid-wrap">
          <div className="ledger-cal-nav">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="ledger-cal-nav-label">{monthLabel}</span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="ledger-cal-weekdays">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="ledger-cal-grid">
            {cells.map((cell, index) =>
              cell === null ? (
                <span key={`blank-${index}`} className="ledger-cal-cell is-blank" />
              ) : (
                <button
                  key={cell.date}
                  type="button"
                  className={`ledger-cal-cell${cell.date === selectedDate ? " is-selected" : ""}${
                    cell.date === todayIso ? " is-today" : ""
                  }`}
                  onClick={() => onSelectDate(cell.date === selectedDate ? null : cell.date)}
                >
                  {cell.day}
                  {(counts.get(cell.date) ?? 0) > 0 ? (
                    <span className="ledger-cal-dot" aria-hidden="true" />
                  ) : null}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
