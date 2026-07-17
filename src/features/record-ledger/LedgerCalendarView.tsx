/**
 * LedgerCalendarView · the ledger calendar (R5, screen M4). Month cells show
 * everything that happened that day, written notes and agent sessions alike:
 * kind-coloured marks + titles, with agent sessions collapsed into one 세션 N
 * chip so a backfill cannot flood a cell. The grid fills the viewport, each week
 * row takes an equal share with a 92px floor, and a busy cell scrolls internally
 * rather than making its row tower over the others.
 * Selecting a day filters the rail agenda; the 날짜 미정 tray under the grid
 * assigns a day by click (the guaranteed path) or drag (an accelerator).
 * Returns to the timeline via the header.
 */
import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, ListTree } from "lucide-react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { dayLabel, recordsByDate } from "./calendarGrouping";
import { isDateUndecided } from "./dateResolution";
import { kindColorClass, schemaLabel } from "./recordPresentation";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

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
  onOpenSessions,
  onClose,
  now,
}: {
  records: MoriRecord[];
  registry: SchemaRegistry;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onAssignDate: (record: MoriRecord, date: string) => void;
  onSelectRecord: (recordId: string) => void;
  onOpenSessions: () => void;
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
  const agenda = selectedDate ? (byDate.get(selectedDate) ?? []) : [];
  const isEmpty = byDate.size === 0 && undecided.length === 0;

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
                onOpenSessions={onOpenSessions}
              />
            </div>
          ),
        )}
      </div>

      {isEmpty ? (
        <div className="ledger-calendar-empty">
          <p>아직 기록이 없어요. 오늘 한 일을 남기면 이 달력에 쌓입니다.</p>
          <button type="button" className="ledger-calendar-empty-cta" onClick={onClose}>
            새 기록 쓰기
          </button>
        </div>
      ) : null}

      {selectedDate && agenda.length > 0 ? (
        <section className="ledger-agenda">
          <header className="ledger-agenda-head">
            <span className="ledger-agenda-day">{dayLabel(selectedDate, now)}</span>
            <span className="ledger-agenda-count">{agenda.length}건</span>
          </header>
          <ul className="ledger-agenda-list">
            {agenda.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  className="ledger-agenda-item"
                  onClick={() => onSelectRecord(record.id)}
                >
                  <span className={`ledger-cell-dot ${kindColorClass(record.schemaId)}`} aria-hidden="true" />
                  <span className="ledger-agenda-title">{record.title}</span>
                  <span className="ledger-agenda-kind">{schemaLabel(record, registry)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
  onOpenSessions,
}: {
  records: MoriRecord[];
  registry: SchemaRegistry;
  todayIso: string;
  onSelectRecord: (recordId: string) => void;
  onOpenSessions: () => void;
}) {
  if (records.length === 0) return null;
  // Agent sessions collapse into ONE 세션 N chip so a day with a full backfill of
  // dual-written sessions (S2) never renders dozens of chips; the chip routes to
  // the 세션 workspace. Other records keep their titled entries.
  const sessions = records.filter((record) => record.schemaId === "agent-session");
  const others = records.filter((record) => record.schemaId !== "agent-session");
  return (
    // Every entry renders. The cell owns a height from its week row and scrolls
    // past it, so a busy day is fully reachable instead of stopping at a fixed
    // two, and a quiet day still costs nothing.
    <div className="ledger-cell-entries base-scroll">
      {others.map((record) => {
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
      {sessions.length > 0 ? (
        <button
          type="button"
          className="ledger-cell-entry ledger-cell-session"
          onClick={onOpenSessions}
          title={`에이전트 세션 ${sessions.length}건`}
        >
          <span className="ledger-cell-dot is-work" aria-hidden="true" />
          <span className="ledger-cell-title">세션 {sessions.length}</span>
        </button>
      ) : null}
      <span className="ledger-cell-sr">{schemaLabel(records[0], registry)}</span>
    </div>
  );
}
