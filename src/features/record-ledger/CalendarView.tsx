/**
 * 캘린더 · the ledger's month, in two densities side by side (기록 v8 §6).
 *
 * This is a RETROSPECTIVE calendar, not a scheduler: records land on the day the
 * activity happened (architecture doc §22, activity time, never fabricated), and
 * the screen's jobs are seeing the month's rhythm, opening a day, and placing
 * the records whose date is still undecided.
 *
 * The arrangement is Fantastical's, and it is why the rail is not empty: the
 * rail carries the month as a readable agenda, the pane carries it as a grid,
 * and selecting a day scrolls the rail to it. The old screen stacked grid,
 * then agenda, then tray, so reading one day meant bouncing between the top and
 * the bottom of the window, and each cell scrolled inside 90px of itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useNow } from "../../lib/time/useNow";
import { useAppStore } from "../../app/store";
import { useRecordLedger } from "./useRecordLedger";
import { useSessionResolver } from "../session/useSessionResolver";
import { loadAutoImportMetas } from "../../lib/session/autoImportMetaStore";
import { autoImportedSessionId } from "../../lib/session/autoImportSessions";
import { ledgerVisibleRecords } from "./recordPresentation";
import { LedgerCalendarView } from "./LedgerCalendarView";
import { CalendarAgendaRail } from "./CalendarAgendaRail";
import { recordsByDate } from "./calendarGrouping";
import { isDateUndecided } from "./dateResolution";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function CalendarView() {
  const ledger = useRecordLedger();
  const navigate = useAppStore((state) => state.navigate);
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const now = useNow();
  const openSession = useAppStore((state) => state.openSession);
  const setSessionReturn = useAppStore((state) => state.setSessionReturn);
  const resolveSession = useSessionResolver();
  // The folder each discovered session ran in (its descriptor), read once.
  const folderOf = useMemo(() => {
    const byId = new Map(
      loadAutoImportMetas().map((meta) => [autoImportedSessionId(meta), folderName(meta.projectPath || meta.projectName)]),
    );
    return (sessionId: string) => byId.get(sessionId) || null;
  }, []);
  const openSessionFromCalendar = (sessionId: string) => {
    setSessionReturn(null);
    void resolveSession(sessionId).then((outcome) => {
      if (outcome === "opened") openSession("flow");
      else if (outcome === "unavailable") navigate("sessions");
    });
  };
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [trayOpen, setTrayOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const records = useMemo(() => ledgerVisibleRecords(ledger.records), [ledger.records]);
  const byDate = useMemo(() => recordsByDate(records), [records]);
  const undecided = useMemo(() => records.filter(isDateUndecided), [records]);

  const monthPrefix = `${cursor.year}-${pad(cursor.month + 1)}`;
  const monthCount = useMemo(() => {
    let total = 0;
    for (const [date, list] of byDate) if (date.startsWith(monthPrefix)) total += list.length;
    return total;
  }, [byDate, monthPrefix]);

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
    // Paging away drops the selection. It used to survive: with the tray open,
    // 이 날에 stayed live and still pointed at a day two months back that nothing
    // on screen identified, so one click filed the record onto an invisible date
    // and it read as vanishing. The keyboard path keeps grid and selection
    // together (it moves the cursor WITH the day); these buttons must too.
    setSelectedDate(null);
  };

  const goToday = () => {
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  };

  // Selecting a day in the grid scrolls the rail to it: the two densities are
  // one month, so they must never disagree about where the user is looking.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedDate) return;
    const target = railRef.current?.querySelector(`[data-day="${selectedDate}"]`);
    target?.scrollIntoView({ block: "nearest" });
  }, [selectedDate]);

  const selectDate = useCallback(
    (date: string | null) => setSelectedDate((current) => (current === date ? null : date)),
    [],
  );

  // Keyboard day navigation. A retrospective calendar is READ, and reading means
  // walking days, so arrows are the accelerator that matters here. It is an
  // accelerator only: every one of these is reachable by clicking.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Never steal a key from something being typed into. The target is not
      // always an Element (it can be the document or the window), so this asks
      // before calling closest rather than trusting a cast and throwing.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape" && selectedDate) {
        setSelectedDate(null);
        return;
      }
      if (event.key === "t" || event.key === "ㅅ") {
        event.preventDefault();
        goToday();
        return;
      }
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      // With no day picked yet, the first arrow lands on today rather than
      // nowhere: the user asked to move, so moving must produce a selection.
      const base = selectedDate
        ? new Date(`${selectedDate}T00:00:00`)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (selectedDate) base.setDate(base.getDate() + step);
      const next = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
      setSelectedDate(next);
      // Walking off the edge of the month follows the day, so the grid never
      // shows one month while the selection sits in another.
      setCursor((current) =>
        current.year === base.getFullYear() && current.month === base.getMonth()
          ? current
          : { year: base.getFullYear(), month: base.getMonth() },
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const assign = (record: MoriRecord, date: string) => {
    void ledger.setActivityDate(record, date);
    setDropTarget(null);
  };

  if (ledger.loading) return <div className="cal-workspace" />;

  return (
    <div className="cal-workspace">
      <CalendarAgendaRail
        ref={railRef}
        byDate={byDate}
        monthPrefix={monthPrefix}
        monthCount={monthCount}
        registry={ledger.registry}
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        onSelectRecord={openRecordInLedger}
        onOpenSession={openSessionFromCalendar}
        contexts={ledger.contexts}
        folderOf={folderOf}
        now={now}
      />

      <div className="cal-pane">
        <header className="cal-band">
          <div className="cal-nav">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="cal-month">
              {cursor.year}년 {cursor.month + 1}월
            </span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="cal-today" onClick={goToday}>
            오늘
          </button>
          <span className="cal-band-sp" />
          {undecided.length > 0 ? (
            <button
              type="button"
              className={`cal-tray-toggle${trayOpen ? " is-on" : ""}`}
              onClick={() => setTrayOpen((value) => !value)}
              aria-expanded={trayOpen}
            >
              <CalendarClock size={13} aria-hidden="true" />
              날짜 미정 {undecided.length}
            </button>
          ) : null}
        </header>

        {/* The tray docks under the band as a strip, never a tall bottom section:
            undated records are a small job, and they used to push the month up. */}
        {trayOpen && undecided.length > 0 ? (
          <div className="cal-tray">
            <span className="cal-tray-hint">
              {selectedDate ? "선택한 날에 배정하거나 셀로 끌어다 놓으세요" : "날짜를 고르거나 셀로 끌어다 놓으세요"}
            </span>
            <div className="cal-tray-items base-scroll">
              {undecided.map((record) => (
                <span
                  key={record.id}
                  className="cal-tray-chip"
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", record.id)}
                >
                  <button
                    type="button"
                    className="cal-tray-open"
                    onClick={() => openRecordInLedger(record.id)}
                    title={record.title}
                  >
                    {record.title}
                  </button>
                  {selectedDate ? (
                    <button
                      type="button"
                      className="cal-tray-assign"
                      onClick={() => assign(record, selectedDate)}
                    >
                      이 날에
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <LedgerCalendarView
          cursor={cursor}
          byDate={byDate}
          undecided={undecided}
          selectedDate={selectedDate}
          dropTarget={dropTarget}
          onSelectDate={selectDate}
          onDropTarget={setDropTarget}
          onAssignDate={assign}
          now={now}
        />
      </div>
    </div>
  );
}

/** The last segment of a folder path ("/home/u/dev/infra" → "infra"). */
function folderName(path: string | undefined): string {
  return (path ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}
