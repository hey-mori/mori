/**
 * CalendarView · the global calendar surface (v2), reached from the sidebar
 * head. It scopes over all ledger records, so it spans 기록 and AI sessions
 * (agent sessions are captured as records). Reuses `LedgerCalendarView`;
 * selecting a day filters the agenda, and opening a note routes to the 기록
 * editor with that record selected.
 */
import { useMemo, useState } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { useAppStore } from "../../app/store";
import { useRecordLedger } from "./useRecordLedger";
import { LedgerCalendarView } from "./LedgerCalendarView";
import { ledgerVisibleRecords } from "./recordPresentation";

export function CalendarView() {
  const ledger = useRecordLedger();
  const navigate = useAppStore((state) => state.navigate);
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const records = useMemo(() => ledgerVisibleRecords(ledger.records), [ledger.records]);

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="캘린더" />}>
      {ledger.loading ? null : (
        <LedgerCalendarView
          records={records}
          registry={ledger.registry}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onAssignDate={(record, date) => void ledger.setActivityDate(record, date)}
          onSelectRecord={(recordId) => openRecordInLedger(recordId)}
          onOpenSessions={() => navigate("sessions")}
          onClose={() => navigate("ledger")}
          now={now}
        />
      )}
    </PageShell>
  );
}
