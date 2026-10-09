/**
 * NoteEditorPane · the center + right of the 기록 v4 note workspace.
 *
 * You write a note freely (one surface, the first line is its title, it saves
 * itself); Mori reads it and shows what it read ABOVE the document (기록 v7's
 * 읽기: 요약 · 용어 · 인사이트 · 남길 기록). No composer box, no 정리 button:
 * writing is capture.
 *
 * There is no right panel. It cost 264px of a 1280 laptop to show, last, the one
 * output that is honestly empty for most documents (v7 §0). The document is the
 * product; the reading sits above it and folds.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Link2 as LinkIcon, Trash2 } from "lucide-react";
import { BaseOverflowMenu, type BaseMenuItemSpec } from "../../components/ui/BaseActionMenu";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import { deriveNoteTitle } from "./noteWorkspace";
/**
 * The markdown editor loads on demand.
 *
 * It brings CodeMirror with it, which is the bulk of the 기록 workspace chunk.
 * Imported eagerly, every visit to the workspace parsed the whole editor before
 * the explorer and the timeline could paint, even when the user was only
 * reading. Split out, that cost is paid when an editor actually renders.
 */
const NoteMarkdownEditor = lazy(() =>
  import("./NoteMarkdownEditor").then((m) => ({ default: m.NoteMarkdownEditor })),
);
import { noteBacklinks, resolveNoteByTitle, wikiLinkKey } from "./wikiLinks";
import { ContextPicker } from "./ContextPicker";
import { RecordHistory } from "./recordEditing";
import { useRecordProvenance } from "./useRecordProvenance";
import { KeptRecordRow } from "./KeptRecordRow";
import { NoteReading, type ReadingState } from "./NoteReading";
import { detectNoteNature } from "./noteNature";
import { useSessionStore } from "../../app/sessionStore";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { engineFromSettings, runUnderstanding } from "../../lib/understanding/runUnderstanding";
import { hashBody } from "../../lib/understanding/understandingParse";
import {
  isLogNature,
  type DocumentUnderstanding,
} from "../../lib/understanding/understandingTypes";

import { formatDate } from "../../lib/formatting/time";

const SAVE_DEBOUNCE_MS = 650;
/** Below this a note is a fragment, not a document: reading it costs 10-20s to
 *  learn nothing. */
const READING_MIN_CHARS = 120;
/** Idle before reading. Long enough that typing never triggers it. */
const READING_IDLE_MS = 2_500;

export function NoteEditorPane({
  note,
  ledger,
  onNoteCreated,
  onDiscarded,
  onRecordDiscarded,
  onOpenRecord,
  paneId,
  now,
  autoFocusEditor = true,
}: {
  /** False when the user came to find something, not to write. */
  autoFocusEditor?: boolean;
  /** The selected note record, or null for a brand-new note. */
  note: MoriRecord | null;
  ledger: RecordLedger;
  /** This pane instance's identity, echoed back on create so the workspace can
   *  ignore a save that lands after the user already navigated away. */
  paneId: number;
  /** Fires with the new record id the first time a fresh note is saved, so the
   *  workspace can select it. */
  /** The created record itself rides along: the workspace's own record list
   *  is a render behind the save, so it cannot be looked up there yet. */
  onNoteCreated: (recordId: string, paneId: number, record: MoriRecord) => void;
  /** Fires when this note is thrown away, so the workspace can offer the undo
   *  that this pane cannot: discarding unmounts it. */
  onDiscarded: (recordId: string, title: string) => void;
  /** Fires when a record KEPT out of this note is thrown away, so the workspace
   *  can offer the same 되돌리기 it offers for a discarded note. */
  onRecordDiscarded: (recordId: string, title: string) => void;
  /** Open another note by id (a clicked [[wiki-link]]); routes through the
   *  workspace so the current note flushes on the switch. */
  onOpenRecord: (recordId: string) => void;
  now: Date;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  // The id of the note record this pane is bound to (null until first save).
  const noteIdRef = useRef<string | null>(note?.id ?? null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serializes the first note creation so a debounced save and a 확인 click can
  // never mint two note records for the same fresh note.
  const createInFlight = useRef<Promise<MoriRecord | null> | null>(null);
  // Click-to-create for [[links]], keyed by title, so a double-click awaits the
  // first create instead of minting a duplicate note.
  const linkCreateInFlight = useRef(new Map<string, Promise<MoriRecord | null>>());
  // The latest typed body + the latest flushSave closure, so the unmount
  // cleanup (which captures the first render) can still persist a pending
  // edit with fresh state instead of silently discarding it.
  const latestBodyRef = useRef(note?.body ?? "");
  const flushRef = useRef<(text: string) => Promise<MoriRecord | null>>(async () => null);
  // The editor host, for "is the user typing here?" focus containment.
  const docRef = useRef<HTMLDivElement>(null);
  // "error" is not decoration: a save can genuinely fail (browser storage quota
  // is the real one), and without it a note that is NOT being persisted sits
  // there reading 쓰는 중 forever, which is the most expensive lie this pane can
  // tell. A note that is not saving must never look like one that is.
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saved" | "error">("idle");
  // 읽기 (v7): what the local engine read out of this note. Never synchronous
  // with typing, and never blocking: no engine simply means no reading.
  const [reading, setReading] = useState<ReadingState>({ kind: "none" });
  const readingForRef = useRef<string | null>(null);
  // The engine the user already configured in 설정; no local model means no
  // reading, and the surface simply shows nothing.
  const analysisSettings = useSessionStore((state) => state.analysisSettings);
  // A note's revision trail. Notes never render DocumentEditor (the workspace
  // routes schemaId === "note" here), so its 이력 button was unreachable for the
  // one kind of record the user writes by hand: every note edit was audited and
  // none of it could be read or undone.
  const [showHistory, setShowHistory] = useState(false);
  // One kept record open at a time: the strip is a correction, not a workspace.
  const [openKeptId, setOpenKeptId] = useState<string | null>(null);
  const { revisions } = useRecordProvenance(note?.id ?? null, note?.updatedAt ?? "");

  // Load a different note's body when the workspace selects one; a brand-new
  // note (note === null) starts blank. The just-created case is a no-op because
  // note.body already equals the current body.
  useEffect(() => {
    const incomingId = note?.id ?? null;
    if (incomingId === noteIdRef.current) {
      const typingHere = docRef.current?.contains(document.activeElement) ?? false;
      if (note && note.body !== body && !typingHere) {
        // An external edit (e.g. undo) to the same note, while not typing here.
        setBody(note.body);
        latestBodyRef.current = note.body;
      }
      return;
    }
    // An in-place switch: flush any pending edit to the OLD note before the
    // ref moves, so its keystroke tail is never dropped or misdirected.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void flushRef.current(latestBodyRef.current);
    }
    noteIdRef.current = incomingId;
    setBody(note?.body ?? "");
    latestBodyRef.current = note?.body ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  const flushSave = useCallback(
    async (text: string): Promise<MoriRecord | null> => {
      const id = noteIdRef.current;
      if (id) {
        const current = ledger.records.find((record) => record.id === id);
        if (
          current &&
          (current.body !== text || current.title !== (deriveNoteTitle(text) || current.title))
        ) {
          await ledger.updateRecord(current, { body: text, title: deriveNoteTitle(text) || "새 기록" });
        }
        return current ?? null;
      }
      if (text.trim().length === 0) return null;
      // If a create is already running for this fresh note, wait for it and
      // update instead of creating a second record. A rejected create must read
      // as "still no note" so the next keystroke retries, rather than poisoning
      // every later save with the same failure.
      if (createInFlight.current) {
        const created = await createInFlight.current.catch(() => null);
        if (created) {
          await ledger.updateRecord(created, { body: text, title: deriveNoteTitle(text) || "새 기록" });
        }
        return created;
      }
      const pending = ledger.createNote(text);
      createInFlight.current = pending;
      let created: MoriRecord | null;
      try {
        created = await pending;
      } finally {
        // Always clear: a create that threw used to leave this ref pointing at a
        // rejected promise forever, wedging the editor on "쓰는 중".
        createInFlight.current = null;
      }
      if (created) {
        noteIdRef.current = created.id;
        onNoteCreated(created.id, paneId, created);
      }
      return created;
    },
    [ledger, onNoteCreated, paneId],
  );

  // Keep the flush closure fresh: the unmount cleanup below has [] deps, so it
  // would otherwise capture the first render's ledger snapshot and fail to
  // find the record to update.
  flushRef.current = flushSave;

  const onChange = (text: string) => {
    setBody(text);
    latestBodyRef.current = text;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushSave(text)
        .then((saved) => {
          if (saved) setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, SAVE_DEBOUNCE_MS);
  };

  // Persist any pending edit when unmounting (switching notes, leaving 기록):
  // a pending timer means an unsaved edit, so flush it with the latest body
  // instead of discarding the keystroke tail. flushSave closes over `ledger`,
  // which survives the unmount, so the async write still lands.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        // The pane is going away, so there is nobody left to show an error to;
        // swallow explicitly rather than leaving an unhandled rejection. The
        // bell feed still raises 저장 공간 부족 from storageHealthStore.
        void flushRef.current(latestBodyRef.current).catch(() => {});
      }
    };
  }, []);


  // The records already confirmed out of this note (derived-from it).
  const confirmed = useMemo(() => {
    const id = note?.id ?? noteIdRef.current;
    if (!id) return [];
    const derivedIds = new Set(
      ledger.relations
        .filter((relation) => relation.type === "derived-from" && relation.toRecordId === id)
        .map((relation) => relation.fromRecordId),
    );
    return ledger.records.filter((record) => derivedIds.has(record.id) && record.status !== "discarded");
  }, [ledger.relations, ledger.records, note?.id]);

  // Follow a clicked [[wiki-link]]: open the matching note, or create it when
  // the name has no note yet (Obsidian's click-to-create). Routing through
  // onOpenRecord flushes the current note on the way out.
  const handleOpenLink = useCallback(
    async (title: string) => {
      const found = resolveNoteByTitle(title, ledger.records);
      if (found) {
        onOpenRecord(found.id);
        return;
      }
      // Serialize click-to-create per title: a double-click on an unresolved
      // link fires twice before the first create lands, and both would miss the
      // resolve above and mint a twin. The second click awaits the first.
      const key = wikiLinkKey(title);
      const inFlight = linkCreateInFlight.current.get(key);
      const pending = inFlight ?? ledger.createNote(title);
      if (!inFlight) linkCreateInFlight.current.set(key, pending);
      try {
        const created = await pending;
        if (created) onOpenRecord(created.id);
      } catch {
        // A failed click-to-create leaves the caret where it was; the next click
        // retries rather than opening nothing forever.
      } finally {
        if (!inFlight) linkCreateInFlight.current.delete(key);
      }
    },
    [ledger, onOpenRecord],
  );

  // Read the note when it settles, never while it is being typed. The engine
  // takes 10-20s, so the trigger is idle + a body hash: re-opening a note it has
  // already read costs nothing, and editing it re-reads once you stop.
  useEffect(() => {
    const id = note?.id;
    if (!id || body.trim().length < READING_MIN_CHARS) {
      setReading({ kind: "none" });
      return;
    }
    const engine = engineFromSettings(analysisSettings);
    if (engine.kind === "none") {
      setReading({ kind: "none" });
      return;
    }
    const hash = hashBody(body);
    const key = `${id}:${hash}`;
    if (readingForRef.current === key) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const repo = getKernelRepository();
        const cached = await repo.getReading<DocumentUnderstanding>(id);
        if (cancelled) return;
        if (cached?.bodyHash === hash) {
          readingForRef.current = key;
          setReading({ kind: "read", understanding: cached });
          return;
        }
        readingForRef.current = key;
        setReading({ kind: "reading" });
        const understanding = await runUnderstanding({
          engine,
          title: deriveNoteTitle(body),
          body,
          itemKinds: ledger.registry
            .list()
            .filter((schema) => schema.layer === "occurrence" || schema.layer === "distilled")
            .map((schema) => ({ id: schema.id, label: schema.name })),
          knownSchemaIds: ledger.registry.list().map((schema) => schema.id),
          now: new Date().toISOString(),
        });
        if (cancelled) return;
        if (!understanding) {
          setReading({ kind: "none" });
          return;
        }
        // Structure beats the reader on the two signals structure actually
        // proves (v7 §6): a note that is mostly links is a 스크랩 and a note with
        // a roster is a 회의록, whatever the model made of the prose. It claims
        // nothing else, so it can never overrule a real read of a real document.
        const structural = detectNoteNature(body);
        const settled = structural
          ? {
              ...understanding,
              nature: structural.nature,
              natureConfidence: structural.confidence,
              // 남길 기록 follows the settled nature: re-reading a 스크랩 as a log
              // would keep items the settled nature says do not belong.
              items: isLogNature(structural.nature) ? understanding.items : [],
            }
          : understanding;
        setReading({ kind: "read", understanding: settled });
        await repo.saveReading(id, settled);
      })();
    }, READING_IDLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [note?.id, body, analysisSettings, ledger.registry]);

  // Clicking any reading output jumps to the span it came from. This is what
  // makes provenance usable rather than merely stored: a claim you can check
  // against the sentence in one click is a claim that cannot quietly be wrong.
  const [pendingSpan, setPendingSpan] = useState<{ start: number; end: number } | null>(null);
  const revealSpan = useCallback((span: { start: number; end: number }) => {
    // A new object each time, so clicking the same output twice still scrolls.
    setPendingSpan({ ...span });
  }, []);

  const confirmedTitles = useMemo(
    () => new Set(confirmed.map((record) => record.title)),
    [confirmed],
  );

  const onConfirmReadingItem = useCallback(
    async (item: DocumentUnderstanding["items"][number]) => {
      const noteRecord = await flushSave(body);
      if (!noteRecord) return;
      await ledger.confirmExtraction(noteRecord, {
        schemaId: item.schemaId,
        title: item.title,
        body: body.slice(item.span.start, item.span.end),
        properties: {},
        // The engine reads what the document says; it does not date it. An
        // undated keep is honest and lands in 확인할 것 rather than inventing a day.
        timeBasis: "unknown",
        confidence: 0.8,
        rationale: "읽기에서 남긴 기록",
        entityMentions: [],
      });
    },
    [body, flushSave, ledger],
  );

  // Notes that link TO this one (derived from their bodies, no stored graph).
  const backlinks = useMemo(
    () => (note ? noteBacklinks(ledger.records, note) : []),
    [ledger.records, note],
  );

  // A note needs a way out. 기록 creates eagerly (any typed line, any clicked
  // unresolved [[link]]), so without this a mistake is permanent. Discard is a
  // status change, not a hard delete: the record and its history survive, it
  // just leaves the ledger. Menu-gated so it can never be a stray click.
  const noteActions = useMemo<BaseMenuItemSpec[]>(() => {
    const id = note?.id ?? noteIdRef.current;
    if (!id) return [];
    return [
      {
        id: "history",
        label: "이력",
        icon: History,
        onSelect: () => setShowHistory((v) => !v),
      },
      {
        id: "discard",
        label: "버리기",
        icon: Trash2,
        destructive: true,
        onSelect: () => {
          // Cancel the pending autosave first: it would otherwise re-save the
          // body onto the record we are discarding.
          if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
          }
          // The workspace owns the undo, not this pane: discarding unmounts the
          // pane, so an affordance living here would vanish with the note.
          onDiscarded(id, note?.title ?? deriveNoteTitle(latestBodyRef.current));
          void ledger.discardRecords([id]);
        },
      },
    ];
  }, [note?.id, note?.title, ledger, onDiscarded]);

  const dateLine = useMemo(() => {
    const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(now);
    return `${now.getMonth() + 1}월 ${now.getDate()}일 ${weekday}`;
  }, [now]);

  return (
    <div className="note-pane">
      <div className="note-pane-body">
        {/* The pane's share of the workspace band: pinned, not scrolling away
            with the document, so its rule lines up with the rail's and the
            panel's instead of stepping at the seam. */}
        <header className="note-pane-head">
          <span className="note-pane-date">{note ? formatDate(note.occurredStart ?? note.capturedAt) : `오늘 · ${dateLine}`}</span>
          {/* A note can belong to a project, like an agent session does. Only
              once it exists: an unsaved note has no record to file. */}
          {note ? <ContextPicker record={note} ledger={ledger} /> : null}
          <span
            className={`note-pane-status${saveState === "error" ? " is-error" : ""}`}
            aria-live="polite"
          >
            {body.length > 0 ? `${body.length.toLocaleString("ko-KR")}자` : ""}
            {saveState === "error"
              ? " · 저장 실패"
              : saveState === "saved"
                ? " · 저장됨"
                : saveState === "dirty"
                  ? " · 쓰는 중"
                  : ""}
          </span>
          {noteActions.length > 0 ? (
            <BaseOverflowMenu items={noteActions} label="기록 작업" className="note-pane-menu" />
          ) : null}
        </header>
        <div className="note-pane-doc base-scroll" ref={docRef}>
          <div className="note-pane-doc-inner">
            {/* 읽기 sits above the document, inside the measure, so it never
                costs the writing column width the way the old panel did. */}
            <NoteReading
              state={reading}
              ledger={ledger}
              confirmedTitles={confirmedTitles}
              onConfirmItem={onConfirmReadingItem}
              onRevealSpan={revealSpan}
            />
            <Suspense fallback={<div className="note-editor-loading" aria-hidden="true" />}>
            <NoteMarkdownEditor
              value={body}
              docId={note?.id ?? null}
              onChange={onChange}
              placeholder={"무엇이든 적어보세요"}
              autoFocus={autoFocusEditor}
              onOpenLink={handleOpenLink}
              revealSpan={pendingSpan}
            />
            </Suspense>

            {/* What this note already put in the ledger, and what points back at
                it. Both belong under the document (Obsidian's linked-mentions
                position), never beside it: they are consulted after reading, not
                while writing. */}
            {confirmed.length > 0 ? (
              <div className="note-foot-group">
                <p className="note-foot-label">이 기록에서 남긴 것</p>
                {confirmed.map((record) => (
                  <KeptRecordRow
                    key={record.id}
                    record={record}
                    noteBody={body}
                    ledger={ledger}
                    open={openKeptId === record.id}
                    onToggle={() =>
                      setOpenKeptId((current) => (current === record.id ? null : record.id))
                    }
                    onRevealSpan={revealSpan}
                    onDiscarded={onRecordDiscarded}
                  />
                ))}
              </div>
            ) : null}

            {showHistory && note && revisions.length > 0 ? (
              <div className="note-foot-group">
                <p className="note-foot-label">이력</p>
                {/* 되돌리기 restores the body while the editor holds the current
                    text. The pane's prop-sync adopts an external change only
                    while it is not focused, so this lands rather than fighting
                    the keyboard. */}
                <RecordHistory
                  revisions={revisions}
                  onRevert={(patch) => void ledger.updateRecord(note, patch)}
                />
              </div>
            ) : null}

            {backlinks.length > 0 ? (
              <div className="note-foot-group">
                <p className="note-foot-label">이 기록을 참조하는 {backlinks.length}개</p>
                {backlinks.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className="note-foot-row"
                    onClick={() => onOpenRecord(source.id)}
                  >
                    <LinkIcon size={12} aria-hidden="true" className="note-foot-icon" />
                    <span className="note-foot-title">{source.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
