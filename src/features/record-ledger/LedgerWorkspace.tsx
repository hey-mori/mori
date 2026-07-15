/**
 * 기록 · the document workspace (v2, docs/design/record-workspace/
 * v2-document-workspace.md).
 *
 * Two panes, no right panel: a project-grouped note explorer on the left and
 * a center editor that reads and edits the selected record in place, or hosts
 * a new capture. Records that need a decision (policy-held candidates and
 * date-undecided notes) surface in the explorer's pinned 확인할 것 group and
 * are resolved in the editor. The calendar is a separate global view.
 */
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { useAppStore } from "../../app/store";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger } from "./useRecordLedger";
import { NoteExplorer } from "./NoteExplorer";
import { DocumentEditor } from "./DocumentEditor";
import { isDateUndecided } from "./dateResolution";
import type { ExplorerSort } from "./noteExplorerModel";
import { displayTime, ledgerVisibleRecords } from "./recordPresentation";

export function LedgerWorkspace() {
  const ledger = useRecordLedger();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ExplorerSort>("date");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const now = useMemo(() => new Date(), []);
  const openRecordId = useAppStore((state) => state.openRecordId);
  const clearOpenRecord = useAppStore((state) => state.clearOpenRecord);

  // The global calendar can ask 기록 to open a specific record.
  useEffect(() => {
    if (!openRecordId) return;
    setSelectedId(openRecordId);
    setComposing(false);
    clearOpenRecord();
  }, [openRecordId, clearOpenRecord]);

  const candidates = useMemo(
    () => byNewest(ledger.records.filter((record) => record.status === "candidate")),
    [ledger.records],
  );
  const dateUnknown = useMemo(
    () => byNewest(ledgerVisibleRecords(ledger.records).filter(isDateUndecided)),
    [ledger.records],
  );
  const selected = useMemo(
    () => ledger.records.find((record) => record.id === selectedId) ?? null,
    [ledger.records, selectedId],
  );

  const openRecord = (recordId: string) => {
    setSelectedId(recordId);
    setComposing(false);
  };
  const startNew = () => {
    setComposing(true);
    setSelectedId(null);
  };
  const onSaved = (savedRecordIds: string[]) => {
    if (savedRecordIds.length > 0) {
      setComposing(false);
      setSelectedId(savedRecordIds[0]);
    }
  };

  // A selected record that vanishes (discarded from the editor) clears the pane.
  useEffect(() => {
    if (selectedId && !ledger.loading && !selected) setSelectedId(null);
  }, [selectedId, selected, ledger.loading]);

  return (
    <PageShell maxWidth="full">
      <div className="ledger ledger-docs">
        <NoteExplorer
          ledger={ledger}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          selectedId={selectedId}
          candidates={candidates}
          dateUnknown={dateUnknown}
          composing={composing}
          onSelect={openRecord}
          onNew={startNew}
          now={now}
        />
        <DocumentEditor
          record={selected}
          composing={composing}
          ledger={ledger}
          onUpdate={(patch) => {
            if (selected) void ledger.updateRecord(selected, patch);
          }}
          onSaved={onSaved}
          now={now}
        />
      </div>
    </PageShell>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}
