/**
 * MiniCalendar · the always-open month grid in the context rail's time mode
 * (R3). Days that hold records are marked; clicking a day selects it (and
 * filters the timeline); clicking the selected day clears it. Replaces the
 * old collapsible LedgerCalendar, which lived in the body.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { recordCountByDate } from "./calendarGrouping";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function MiniCalendar({
  records,
  selectedDate,
  onSelectDate,
}: {
  records: MoriRecord[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const today = useMemo(() => new Date(), []);
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
    <div className="mini-cal">
      <div className="mini-cal-nav">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="mini-cal-label">{monthLabel}</span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달">
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="mini-cal-weekdays">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="mini-cal-grid">
        {cells.map((cell, index) =>
          cell === null ? (
            <span key={`blank-${index}`} className="mini-cal-cell is-blank" />
          ) : (
            <button
              key={cell.date}
              type="button"
              className={`mini-cal-cell${cell.date === selectedDate ? " is-selected" : ""}${
                cell.date === todayIso ? " is-today" : ""
              }`}
              onClick={() => onSelectDate(cell.date === selectedDate ? null : cell.date)}
            >
              {cell.day}
              {(counts.get(cell.date) ?? 0) > 0 ? (
                <span className="mini-cal-dot" aria-hidden="true" />
              ) : null}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
