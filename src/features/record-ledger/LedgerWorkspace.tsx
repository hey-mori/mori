/**
 * 기록 · the single record-workspace surface (R3: timeline ledger + context
 * rail, docs/design/record-workspace/).
 *
 * One screen, no mode tabs: the composer captures, a 확인 필요 strip surfaces
 * anything the apply policy held back, and a day-grouped timeline is the body.
 * The right rail is one contextual slot: time context (month calendar +
 * selected-day agenda + this-week roll-up) when nothing is selected, the
 * record inspector when a record is selected. Search folds in what the old
 * 메모리 hub did (find your accumulated records).
 */
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { hasLateNightRule } from "../../lib/capture";
import { useRecordLedger } from "./useRecordLedger";
import { RecordComposer } from "./composer/RecordComposer";
import { RecordInspector } from "./RecordInspector";
import { LedgerTimeline } from "./LedgerTimeline";
import { LedgerCalendarView } from "./LedgerCalendarView";
import { ContextRail } from "./ContextRail";
import { ReviewStrip } from "./ReviewStrip";
import { DateRuleOffer } from "./DateRuleOffer";
import { isDateUndecided } from "./dateResolution";
import { bumpLateNightPrev, lateNightPrevCount, LATE_NIGHT_PREV_THRESHOLD, resetLateNightPrev } from "./dateRuleMemory";
import { displayTime, ledgerVisibleRecords } from "./recordPresentation";

export function LedgerWorkspace() {
  const ledger = useRecordLedger();
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [lateNightCount, setLateNightCount] = useState(() => lateNightPrevCount());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  const candidates = useMemo(
    () => byNewest(ledger.records.filter((record) => record.status === "candidate")),
    [ledger.records],
  );
  const selected = useMemo(
    () => ledger.records.find((record) => record.id === selectedId) ?? null,
    [ledger.records, selectedId],
  );
  const visibleRecords = useMemo(() => ledgerVisibleRecords(ledger.records), [ledger.records]);
  // Date-undecided records need a day; they share the 확인할 것 strip with the
  // policy-held candidates instead of piling up in the timeline.
  const dateUnknown = useMemo(() => byNewest(visibleRecords.filter(isDateUndecided)), [visibleRecords]);
  // Offer to learn the small-hours → previous-day rule once the same
  // correction has been made enough times and no such rule exists yet.
  const offerDateRule =
    lateNightCount >= LATE_NIGHT_PREV_THRESHOLD && !hasLateNightRule(ledger.rules);
  const acceptDateRule = async () => {
    await ledger.createDateInferenceRule();
    resetLateNightPrev();
    setLateNightCount(0);
  };
  const dismissDateRule = () => {
    resetLateNightPrev();
    setLateNightCount(0);
  };
  const onSelect = (recordId: string) =>
    setSelectedId((current) => (current === recordId ? null : recordId));

  // Esc returns the rail to time mode from the inspector (rail contract).
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  // The just-saved highlight fades on its own so placement is felt, not sticky.
  useEffect(() => {
    if (newIds.length === 0) return;
    const timer = window.setTimeout(() => setNewIds([]), 2600);
    return () => window.clearTimeout(timer);
  }, [newIds]);

  const search = (
    <ToolbarSearch
      value={query}
      onChange={setQuery}
      ariaLabel="기록 검색"
      className="search-field-fixed"
    />
  );

  return (
    <PageShell maxWidth="full" actionBar={<ActionBar label="기록" start={search} />}>
      <div className="ledger has-rail">
        <div className="ledger-main">
          <RecordComposer ledger={ledger} onSaved={setNewIds} />
          {ledger.loading ? null : (
            <>
              {offerDateRule ? (
                <DateRuleOffer onAccept={() => void acceptDateRule()} onDismiss={dismissDateRule} />
              ) : null}
              <ReviewStrip
                candidates={candidates}
                dateUnknown={dateUnknown}
                ledger={ledger}
                now={now}
                onLearnLateNightPrev={() => setLateNightCount(bumpLateNightPrev())}
              />
              {calendarOpen ? (
                <LedgerCalendarView
                  records={visibleRecords}
                  registry={ledger.registry}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  onAssignDate={(record, date) => void ledger.setActivityDate(record, date)}
                  onSelectRecord={(recordId) => setSelectedId(recordId)}
                  onClose={() => setCalendarOpen(false)}
                  now={now}
                />
              ) : (
                <LedgerTimeline
                  ledger={ledger}
                  query={query}
                  selectedDate={selectedDate}
                  selectedId={selectedId}
                  newIds={newIds}
                  onSelect={onSelect}
                />
              )}
            </>
          )}
        </div>
        {selected ? (
          <RecordInspector
            record={selected}
            registry={ledger.registry}
            entities={ledger.entities}
            onRenameEntity={(entityId, newName) => void ledger.renameEntity(entityId, newName)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <ContextRail
            records={visibleRecords}
            registry={ledger.registry}
            contexts={ledger.contexts}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSelectRecord={(recordId) => setSelectedId(recordId)}
            onExpandCalendar={() => setCalendarOpen(true)}
            showCalendar={!calendarOpen}
            now={now}
          />
        )}
      </div>
    </PageShell>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}
