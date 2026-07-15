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
import { Check, Sparkles, X } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ActionBar } from "../../components/layout/ActionBar";
import { Button } from "../../components/ui/Button";
import { ToolbarSearch } from "../../components/ui/ToolbarSearch";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger, type RecordLedger } from "./useRecordLedger";
import { RecordComposer } from "./composer/RecordComposer";
import { RecordInspector } from "./RecordInspector";
import { LedgerTimeline } from "./LedgerTimeline";
import { ContextRail } from "./ContextRail";
import { displayTime, ledgerVisibleRecords, schemaLabel } from "./recordPresentation";

export function LedgerWorkspace() {
  const ledger = useRecordLedger();
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<string[]>([]);
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
              {candidates.length > 0 ? (
                <CandidateStrip candidates={candidates} ledger={ledger} />
              ) : null}
              <LedgerTimeline
                ledger={ledger}
                query={query}
                selectedDate={selectedDate}
                selectedId={selectedId}
                newIds={newIds}
                onSelect={onSelect}
              />
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
            now={now}
          />
        )}
      </div>
    </PageShell>
  );
}

/** Records the apply policy could not auto-organize, surfaced inline above the
 *  feed with 반영 / 무시 in place. No separate inbox mode. */
function CandidateStrip({ candidates, ledger }: { candidates: MoriRecord[]; ledger: RecordLedger }) {
  return (
    <section className="ledger-review">
      <header className="ledger-review-head">
        <h2>확인이 필요한 항목</h2>
        <span className="ledger-review-count">{candidates.length}</span>
      </header>
      <ul className="inbox-list">
        {candidates.map((record) => (
          <li key={record.id} className="inbox-card">
            <div className="inbox-card-body">
              <div className="inbox-card-head">
                <span className="inbox-card-kind">{schemaLabel(record, ledger.registry)}</span>
                <span className="inbox-card-title">{record.title}</span>
              </div>
              {record.body && record.body !== record.title ? (
                <p className="inbox-card-summary">{record.body}</p>
              ) : null}
              <span className="inbox-card-time">{formatClaudeRelativeKo(displayTime(record).iso)}</span>
            </div>
            <div className="inbox-card-actions">
              <Button variant="primary" size="sm" icon={Check} onClick={() => void ledger.setStatus(record, "active")}>
                반영
              </Button>
              <Button variant="ghost" size="sm" icon={X} onClick={() => void ledger.setStatus(record, "discarded")}>
                무시
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}
