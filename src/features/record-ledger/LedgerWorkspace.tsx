/**
 * 기록 · the daily-ledger workspace (v3, docs/design/record-workspace/
 * v3-daily-ledger.md).
 *
 * A full-bleed two-pane surface, the same skeleton as 세션: a flush ledger rail
 * on the left (day-grouped records) and a document/capture canvas filling the
 * rest: no floating card, no PageShell. Records that need a decision surface in
 * the rail's pinned 확인할 것 group; the calendar is a separate global view.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../../lib/time/useNow";
import { useAppStore } from "../../app/store";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger } from "./useRecordLedger";
import { NoteExplorer } from "./NoteExplorer";
import { NoteEditorPane } from "./NoteEditorPane";
import { DocumentEditor } from "./DocumentEditor";
import { isDateUndecided } from "./dateResolution";
import type { ExplorerSort } from "./noteExplorerModel";
import { displayTime, ledgerVisibleRecords } from "./recordPresentation";

export function LedgerWorkspace() {
  const ledger = useRecordLedger();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ExplorerSort>("date");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 기록 opens ready to capture (approved design: capture/organize/review are one
  // flow on one screen). The explorer still opens any existing note; a calendar
  // deep-link (openRecordId) overrides this on mount to show that record.
  const [composing, setComposing] = useState(true);
  const now = useNow();
  const openRecordId = useAppStore((state) => state.openRecordId);
  const clearOpenRecord = useAppStore((state) => state.clearOpenRecord);
  const newRecordRequest = useAppStore((state) => state.newRecordRequest);
  const clearNewRecordRequest = useAppStore((state) => state.clearNewRecordRequest);

  // Both global entry points route through the same actions the in-workspace
  // controls use, rather than setting state behind their backs. That is what
  // re-keys the pane: without it the sidebar ＋ over an open draft left the old
  // pane mounted, so it silently kept the draft and never took focus.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- actions are
  // re-created each render; the effect no-ops unless its request is set.
  useEffect(() => {
    if (!openRecordId) return;
    openRecord(openRecordId);
    clearOpenRecord();
  }, [openRecordId, clearOpenRecord]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- see above.
  useEffect(() => {
    if (!newRecordRequest) return;
    startNew();
    clearNewRecordRequest();
  }, [newRecordRequest, clearNewRecordRequest]);

  // Extractions (derived-from a note) are sub-items of their note, resolved in
  // the note's 추출 panel, never as standalone 확인할 것 rows.
  const derivedIds = useMemo(
    () =>
      new Set(
        ledger.relations
          .filter((relation) => relation.type === "derived-from")
          .map((relation) => relation.fromRecordId),
      ),
    [ledger.relations],
  );
  const candidates = useMemo(
    () =>
      byNewest(
        ledger.records.filter(
          (record) => record.status === "candidate" && !derivedIds.has(record.id),
        ),
      ),
    [ledger.records, derivedIds],
  );
  const dateUnknown = useMemo(
    () =>
      byNewest(
        ledgerVisibleRecords(ledger.records).filter(
          (record) => isDateUndecided(record) && !derivedIds.has(record.id),
        ),
      ),
    [ledger.records, derivedIds],
  );
  // A discarded record reads as gone, so the effect below clears the pane the
  // moment its note is thrown away. Candidates must still resolve (the 확인할 것
  // group opens them), so this drops only the discarded.
  const selected = useMemo(
    () =>
      ledger.records.find(
        (record) => record.id === selectedId && record.status !== "discarded",
      ) ?? null,
    [ledger.records, selectedId],
  );

  // The editor remounts only on a USER-driven switch (open another note, 새
  // 기록), never on the fresh-note → created transition, which would unmount
  // the pane mid-typing and drop the keystrokes typed during the save window.
  const [editorNonce, setEditorNonce] = useState(0);
  // The nonce doubles as the mounted pane's identity, and a ref mirrors it so a
  // pane that has already unmounted can still be recognised as stale from its
  // captured closure.
  const nonceRef = useRef(0);
  const remount = () => {
    nonceRef.current += 1;
    setEditorNonce(nonceRef.current);
  };
  const openRecord = (recordId: string) => {
    if (recordId !== selectedId || composing) remount();
    setSelectedId(recordId);
    setComposing(false);
  };
  const startNew = () => {
    remount();
    setComposing(true);
    setSelectedId(null);
  };
  const handleNoteCreated = (recordId: string, paneId: number) => {
    // Adopt the created id in place: same pane instance, typing continues.
    // Only the pane that is STILL mounted may do so. Navigating away from a
    // brand-new note (clicking a [[wiki-link]] or another row) unmounts its
    // pane, and that pane's pending save still lands, creating the note and
    // calling back here. Without this guard that late callback would win the
    // last write and yank the user back to the note they just left.
    if (paneId !== nonceRef.current) return;
    setComposing(false);
    setSelectedId(recordId);
  };

  // A selected record that vanishes (discarded from the editor) clears the pane.
  useEffect(() => {
    if (selectedId && !ledger.loading && !selected) setSelectedId(null);
  }, [selectedId, selected, ledger.loading]);

  // The note workspace shows the note editor + 추출 panel when writing a new
  // note, when nothing is selected, or when the selection is a note. A non-note
  // record (a standalone workout / imported item / an extraction opened by id)
  // reads as a document instead.
  const editingNote = !composing && selected?.schemaId === "note" ? selected : null;
  const showNoteEditor = composing || !selected || selected.schemaId === "note";

  return (
    <div className="ledger-workspace">
      <NoteExplorer
        ledger={ledger}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        selectedId={selectedId}
        candidates={candidates}
        dateUnknown={dateUnknown}
        onSelect={openRecord}
        onNew={startNew}
        now={now}
      />
      {showNoteEditor ? (
        <NoteEditorPane
          key={editorNonce}
          paneId={editorNonce}
          note={editingNote}
          ledger={ledger}
          onNoteCreated={handleNoteCreated}
          onOpenRecord={openRecord}
          now={now}
        />
      ) : (
        <DocumentEditor
          record={selected}
          composing={false}
          ledger={ledger}
          todayRecords={[]}
          onOpenRecord={openRecord}
          onUpdate={(patch) => {
            if (selected) void ledger.updateRecord(selected, patch);
          }}
          onSaved={() => {}}
          now={now}
        />
      )}
    </div>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}
