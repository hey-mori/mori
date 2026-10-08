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
import { Trash2, X } from "lucide-react";
import { useAppStore } from "../../app/store";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { useRecordLedger } from "./useRecordLedger";
import { NoteExplorer } from "./NoteExplorer";
import { NoteEditorPane } from "./NoteEditorPane";
import { withProject } from "./ContextPicker";
import { DocumentEditor } from "./DocumentEditor";
import { isDateUndecided } from "./dateResolution";
import type { ExplorerSort } from "./noteExplorerModel";
import { displayTime, ledgerVisibleRecords } from "./recordPresentation";
import { useSessionResolver } from "../session/useSessionResolver";

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
  const newRecordProjectId = useAppStore((state) => state.newRecordProjectId);
  const projectScope = useAppStore((state) => state.ledgerProjectScope);
  const clearProjectScope = useAppStore((state) => state.clearLedgerProjectScope);
  const openSession = useAppStore((state) => state.openSession);
  const resolveSession = useSessionResolver();
  // A note requested from a project page is born filed there. It cannot be filed
  // at request time because an untyped note has no record yet, so the intent is
  // held until the first save mints one.
  const pendingProjectRef = useRef<string | null>(null);

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
    pendingProjectRef.current = newRecordProjectId;
    startNew();
    clearNewRecordRequest();
  }, [newRecordRequest, newRecordProjectId, clearNewRecordRequest]);

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
  // An agent session row opens the session itself (its transcript and flow),
  // which is what the row stands for; the thin kernel record is only the
  // fallback when the session can no longer be resolved, so a found result is
  // never a dead end.
  const selectRecord = (recordId: string) => {
    const record = ledger.records.find((entry) => entry.id === recordId);
    if (record?.schemaId !== "agent-session") {
      openRecord(recordId);
      return;
    }
    void resolveSession(recordId).then((ok) => {
      if (ok) openSession("flow");
      else openRecord(recordId);
    });
  };
  const startNew = () => {
    remount();
    setComposing(true);
    setSelectedId(null);
  };
  // 버리기 is menu-gated, but a status change the user cannot see undone is still
  // a one-way door: every surface filters discarded records out, so the record
  // survives in the kernel while vanishing from the product. This is the door
  // back, offered where the note used to be.
  const [discarded, setDiscarded] = useState<{ id: string; title: string; reopen: boolean } | null>(
    null,
  );
  const handleDiscarded = (recordId: string, title: string) => {
    setDiscarded({ id: recordId, title, reopen: true });
    remount();
    setComposing(true);
    setSelectedId(null);
  };

  // A record KEPT out of a note, discarded from under the document. The note
  // itself is untouched, so nothing unmounts and the undo must not navigate:
  // the user is still writing, and yanking them to the restored record would
  // punish them for correcting a mistake.
  const handleRecordDiscarded = (recordId: string, title: string) => {
    setDiscarded({ id: recordId, title, reopen: false });
  };
  const undoDiscard = async () => {
    if (!discarded) return;
    const { id, reopen } = discarded;
    setDiscarded(null);
    await ledger.restoreRecords([id]);
    if (reopen) openRecord(id);
  };

  const handleNoteCreated = (recordId: string, paneId: number, created: MoriRecord) => {
    // Adopt the created id in place: same pane instance, typing continues.
    // Only the pane that is STILL mounted may do so. Navigating away from a
    // brand-new note (clicking a [[wiki-link]] or another row) unmounts its
    // pane, and that pane's pending save still lands, creating the note and
    // calling back here. Without this guard that late callback would win the
    // last write and yank the user back to the note they just left.
    if (paneId !== nonceRef.current) return;
    setComposing(false);
    setSelectedId(recordId);

    // The note now exists, so the project intent held since the request can land.
    // It files the record the save returned: looking it up in ledger.records
    // read this render's list, captured before the save's reload, so it always
    // missed and a note started from a project page was born unfiled.
    const projectId = pendingProjectRef.current;
    pendingProjectRef.current = null;
    if (!projectId) return;
    void ledger.updateRecord(created, {
      contextIds: withProject(created, ledger.contexts, projectId),
    });
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
      {discarded ? (
        <div className="ledger-undo" role="status">
          {/* No 을/를 on a user string: the particle depends on the title's final
              consonant, so the label carries none. */}
          <span className="ledger-undo-text">
            <Trash2 size={13} aria-hidden="true" />
            버렸어요
            {discarded.title ? <span className="ledger-undo-title">{discarded.title}</span> : null}
          </span>
          <button type="button" className="ledger-undo-action" onClick={() => void undoDiscard()}>
            되돌리기
          </button>
          <button
            type="button"
            className="ledger-undo-close"
            aria-label="닫기"
            onClick={() => setDiscarded(null)}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <NoteExplorer
        ledger={ledger}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        selectedId={selectedId}
        candidates={candidates}
        dateUnknown={dateUnknown}
        onSelect={selectRecord}
        onNew={startNew}
        now={now}
        projectScopeId={projectScope}
        onClearProjectScope={clearProjectScope}
      />
      {showNoteEditor ? (
        <NoteEditorPane
          key={editorNonce}
          paneId={editorNonce}
          note={editingNote}
          ledger={ledger}
          onNoteCreated={handleNoteCreated}
          onDiscarded={handleDiscarded}
          onRecordDiscarded={handleRecordDiscarded}
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
          onDiscarded={handleDiscarded}
          now={now}
        />
      )}
    </div>
  );
}

function byNewest(records: MoriRecord[]): MoriRecord[] {
  return [...records].sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
}
