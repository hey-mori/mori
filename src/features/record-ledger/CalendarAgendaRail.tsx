/**
 * CalendarAgendaRail · the visible month, readable (기록 v8 §6).
 *
 * The user's instinct was that a calendar's sidebar has nothing to put in it.
 * It has the month itself: a grid can only show that a day was busy, and this
 * says what happened. Fantastical's arrangement, where the sidebar lists the
 * current view's items and picking a day scrolls the list to it.
 *
 * Row anatomy matches the 기록 list on purpose, so a record looks the same
 * wherever it is met.
 */
import { forwardRef } from "react";
import { Radio } from "lucide-react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { dayLabel } from "./calendarGrouping";
import { kindColorClass, schemaLabel } from "./recordPresentation";

export const CalendarAgendaRail = forwardRef<
  HTMLDivElement,
  {
    byDate: Map<string, MoriRecord[]>;
    monthPrefix: string;
    monthCount: number;
    registry: SchemaRegistry;
    selectedDate: string | null;
    onSelectDate: (date: string) => void;
    onSelectRecord: (recordId: string) => void;
    onOpenSessions: () => void;
    now: Date;
  }
>(function CalendarAgendaRail(
  {
    byDate,
    monthPrefix,
    monthCount,
    registry,
    selectedDate,
    onSelectDate,
    onSelectRecord,
    onOpenSessions,
    now,
  },
  ref,
) {
  const days = [...byDate.entries()]
    .filter(([date]) => date.startsWith(monthPrefix))
    .sort((a, b) => b[0].localeCompare(a[0]));
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  return (
    <aside className="cal-rail" aria-label="이번 달 기록">
      <div className="cal-rail-band">
        <span className="cal-rail-count">이번 달 기록 {monthCount}건</span>
      </div>
      <div className="cal-rail-body base-scroll" ref={ref}>
        {days.length === 0 ? (
          <p className="cal-rail-empty">이 달에는 기록이 없습니다.</p>
        ) : (
          days.map(([date, list]) => {
            // Agent sessions collapse to one row, as in the grid: a day with a
            // backfill of dual-written sessions must not bury the day's writing.
            const sessions = list.filter((record) => record.schemaId === "agent-session");
            const others = list.filter((record) => record.schemaId !== "agent-session");
            return (
              <section
                key={date}
                data-day={date}
                className={`cal-day${date === selectedDate ? " is-selected" : ""}`}
              >
                <button
                  type="button"
                  className={`cal-day-head${date === todayIso ? " is-today" : ""}`}
                  onClick={() => onSelectDate(date)}
                >
                  <span className="cal-day-label">{dayLabel(date, now)}</span>
                  <span className="cal-day-count">{list.length}</span>
                </button>
                {others.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    className={`cal-day-row${
                      (record.occurredStart?.slice(0, 10) ?? "") > todayIso ? " is-planned" : ""
                    }`}
                    onClick={() => onSelectRecord(record.id)}
                  >
                    <span
                      className={`note-item-dot ${kindColorClass(record.schemaId)}`}
                      aria-hidden="true"
                    />
                    <span className="cal-day-title">{record.title}</span>
                    <span className="cal-day-kind">{schemaLabel(record, registry)}</span>
                  </button>
                ))}
                {sessions.length > 0 ? (
                  <button type="button" className="cal-day-row" onClick={onOpenSessions}>
                    <span className="cal-day-session-icon" aria-hidden="true">
                      <Radio size={11} />
                    </span>
                    <span className="cal-day-title">세션 {sessions.length}건</span>
                  </button>
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
});
