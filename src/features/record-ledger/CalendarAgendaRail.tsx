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
import { forwardRef, useState } from "react";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { readableAgentText } from "../../lib/session/agentText";
import { groupDaySessions } from "./calendarDaySessions";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { continuesFrom, dayLabel, timeOnDay } from "./calendarGrouping";
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
    /** Opens a session listed under a day, naming the day for the way back. */
    onOpenSession: (sessionId: string, date: string) => void;
    /** A day whose sessions start unfolded (the day a session was opened from). */
    unfoldDate?: string | null;
    contexts: readonly KernelContext[];
    /** The folder a session ran in, for sessions no project was confirmed for. */
    folderOf: (sessionId: string) => string | null;
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
    onOpenSession,
    contexts,
    folderOf,
    unfoldDate,
    now,
  },
  ref,
) {
  // Days whose sessions are unfolded. A day's sessions start folded so a busy
  // day does not bury what was written that day.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(
    () => new Set(unfoldDate ? [unfoldDate] : []),
  );
  const toggle = (date: string) =>
    setUnfolded((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
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
                  <>
                    <button
                      type="button"
                      className="cal-day-row"
                      aria-expanded={unfolded.has(date)}
                      onClick={() => toggle(date)}
                    >
                      <span className="cal-day-session-icon" aria-hidden="true">
                        <Radio size={11} />
                      </span>
                      <span className="cal-day-title">세션 {sessions.length}건</span>
                      <span className="cal-day-kind" aria-hidden="true">
                        {unfolded.has(date) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    </button>
                    {unfolded.has(date)
                      ? groupDaySessions(sessions, contexts, folderOf, (session) => timeOnDay(session, date)).map((group) => (
                          <div key={group.key || "none"} className="cal-day-sessions">
                            <p className="cal-day-group">
                              {group.label}
                              {group.kind === "folder" ? <span> 폴더</span> : null} <span>{group.sessions.length}</span>
                            </p>
                            {group.sessions.map((session) => (
                              <button
                                key={session.id}
                                type="button"
                                className="cal-day-row"
                                onClick={() => onOpenSession(session.id, date)}
                              >
                                <span className="cal-day-time">{clock(timeOnDay(session, date))}</span>
                                <span className="cal-day-title">
                                  {readableAgentText(session.title) || "제목 없음"}
                                </span>
                                {continuesFrom(session, date) ? (
                                  <span className="cal-day-kind">{startedLabel(continuesFrom(session, date)!)}</span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ))
                      : null}
                  </>
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
});

/** "10월 8일 시작", for a multi-day session on its last-activity day, as the
 *  project chronology writes it. Read from the YYYY-MM-DD key itself. */
function startedLabel(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${month}월 ${date}일 시작`;
}

function clock(iso: string | undefined): string {
  // A bare day claims no time of day.
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) return "";
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
