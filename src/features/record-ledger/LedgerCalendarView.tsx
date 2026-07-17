/**
 * LedgerCalendarView · the month grid (기록 v8 §6). Cells show the day's records
 * by kind-coloured, titled entries, with agent sessions collapsed into one
 * 세션 N chip so a backfill cannot flood a cell.
 *
 * The grid is now ONLY the grid: the month band, the day agenda and the 날짜
 * 미정 tray moved out (to the pane band, the rail, and a strip under the band),
 * because stacking all four made reading one day a trip from the top of the
 * window to the bottom.
 *
 * A cell shows what FITS and then `+N`. It used to scroll internally, which is a
 * scrollbar inside 90px of a cell: real content, hidden behind a gesture nobody
 * makes on a calendar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { kindColorClass } from "./recordPresentation";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** Entry row + gap, and the space the date number takes. Used to decide how many
 *  entries fit before `+N`, so the answer follows the real cell height. */
const ENTRY_H = 18;
const CELL_CHROME = 26;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function LedgerCalendarView({
  cursor,
  byDate,
  undecided,
  selectedDate,
  dropTarget,
  onSelectDate,
  onDropTarget,
  onAssignDate,
  now,
}: {
  cursor: { year: number; month: number };
  byDate: Map<string, MoriRecord[]>;
  undecided: MoriRecord[];
  selectedDate: string | null;
  dropTarget: string | null;
  onSelectDate: (date: string) => void;
  onDropTarget: (date: string | null) => void;
  onAssignDate: (record: MoriRecord, date: string) => void;
  now: Date;
}) {
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

  // How many entries fit in a cell, measured rather than guessed: the grid
  // divides the pane's height by its week rows, so the answer changes with the
  // window and with the number of weeks the month spans.
  const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(3);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const cell = grid.querySelector(".cal-cell");
      if (!cell) return;
      const height = cell.getBoundingClientRect().height;
      setFit(Math.max(1, Math.floor((height - CELL_CHROME) / ENTRY_H)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [cells.length]);

  const assignFromDrag = (event: React.DragEvent, date: string) => {
    event.preventDefault();
    onDropTarget(null);
    const id = event.dataTransfer.getData("text/plain");
    const record = undecided.find((candidate) => candidate.id === id);
    if (record) onAssignDate(record, date);
  };

  return (
    <div className="cal-grid-wrap">
      <div className="cal-weekdays">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="cal-grid" ref={gridRef}>
        {cells.map((cell, index) =>
          cell === null ? (
            <span key={`blank-${index}`} className="cal-cell is-blank" />
          ) : (
            <CalendarCell
              key={cell.date}
              day={cell.day}
              date={cell.date}
              records={byDate.get(cell.date) ?? []}
              fit={fit}
              isToday={cell.date === todayIso}
              isSelected={cell.date === selectedDate}
              isDrop={dropTarget === cell.date}
              todayIso={todayIso}
              canDrop={undecided.length > 0}
              onSelect={() => onSelectDate(cell.date)}
              onDropTarget={onDropTarget}
              onDrop={(event) => assignFromDrag(event, cell.date)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function CalendarCell({
  day,
  date,
  records,
  fit,
  isToday,
  isSelected,
  isDrop,
  todayIso,
  canDrop,
  onSelect,
  onDropTarget,
  onDrop,
}: {
  day: number;
  date: string;
  records: MoriRecord[];
  fit: number;
  isToday: boolean;
  isSelected: boolean;
  isDrop: boolean;
  todayIso: string;
  canDrop: boolean;
  onSelect: () => void;
  onDropTarget: (date: string | null) => void;
  onDrop: (event: React.DragEvent) => void;
}) {
  const sessions = records.filter((record) => record.schemaId === "agent-session");
  const others = records.filter((record) => record.schemaId !== "agent-session");
  // The session chip is one row when present, so it competes for the same space.
  const room = Math.max(1, sessions.length > 0 ? fit - 1 : fit);
  const shown = others.slice(0, room);
  const hidden = others.length - shown.length;

  return (
    <div
      className={`cal-cell${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${
        isDrop ? " is-drop" : ""
      }`}
      onDragOver={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        onDropTarget(date);
      }}
      onDragLeave={() => onDropTarget(null)}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="cal-cell-num"
        onClick={onSelect}
        aria-label={`${day}일 · 기록 ${records.length}건`}
      >
        {day}
      </button>
      <div className="cal-cell-entries">
        {shown.map((record) => (
          <button
            key={record.id}
            type="button"
            className={`cal-entry${
              (record.occurredStart?.slice(0, 10) ?? "") > todayIso ? " is-planned" : ""
            }`}
            onClick={onSelect}
            title={record.title}
          >
            <span
              className={`cal-entry-dot ${kindColorClass(record.schemaId)}`}
              aria-hidden="true"
            />
            <span className="cal-entry-title">{record.title}</span>
          </button>
        ))}
        {sessions.length > 0 ? (
          <button type="button" className="cal-entry is-session" onClick={onSelect}>
            <span className="cal-entry-dot is-work" aria-hidden="true" />
            <span className="cal-entry-title">세션 {sessions.length}</span>
          </button>
        ) : null}
        {hidden > 0 ? (
          // Selecting the day is what reveals the rest, in the rail, where they
          // are readable. The grid never hides content behind its own scrollbar.
          <button type="button" className="cal-more" onClick={onSelect}>
            +{hidden}
          </button>
        ) : null}
      </div>
    </div>
  );
}
