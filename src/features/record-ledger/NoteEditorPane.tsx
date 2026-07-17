/**
 * NoteEditorPane · the center + right of the 기록 v4 note workspace.
 *
 * You write a note freely (one surface, the first line is its title, it saves
 * itself); Mori extracts the typed records it can pull out of the text and shows
 * them in the right 추출 panel, where each is confirmed into a durable record
 * linked back to the note. No composer box, no 정리 button: writing is capture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles, PanelRightClose, PanelRightOpen, Link2 as LinkIcon, Trash2 } from "lucide-react";
import { BaseOverflowMenu, type BaseMenuItemSpec } from "../../components/ui/BaseActionMenu";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import {
  buildNoteExtractionPanel,
  deriveNoteTitle,
  type NoteExtraction,
} from "./noteWorkspace";
import { NoteMarkdownEditor } from "./NoteMarkdownEditor";
import {
  detectNoteNature,
  natureFits,
  NOTE_NATURES,
  NOTE_NATURE_LABEL,
  type NoteNature,
} from "./noteNature";
import { noteBacklinks, resolveNoteByTitle, wikiLinkKey } from "./wikiLinks";
import { kindColorClass, schemaLabel } from "./recordPresentation";
import { formatDate } from "../../lib/formatting/time";

const SAVE_DEBOUNCE_MS = 650;

export function NoteEditorPane({
  note,
  ledger,
  onNoteCreated,
  onOpenRecord,
  paneId,
  now,
}: {
  /** The selected note record, or null for a brand-new note. */
  note: MoriRecord | null;
  ledger: RecordLedger;
  /** This pane instance's identity, echoed back on create so the workspace can
   *  ignore a save that lands after the user already navigated away. */
  paneId: number;
  /** Fires with the new record id the first time a fresh note is saved, so the
   *  workspace can select it. */
  onNoteCreated: (recordId: string, paneId: number) => void;
  /** Open another note by id (a clicked [[wiki-link]]); routes through the
   *  workspace so the current note flushes on the switch. */
  onOpenRecord: (recordId: string) => void;
  now: Date;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  const [panelOpen, setPanelOpen] = useState(true);
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
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saved">("idle");
  // A user-set nature overrides the detector until the note switches. null =
  // trust the detector's read of the current body.
  const [natureOverride, setNatureOverride] = useState<NoteNature | null>(null);

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
    setNatureOverride(null);
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
        onNoteCreated(created.id, paneId);
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
      void flushSave(text).then((saved) => {
        if (saved) setSaveState("saved");
      });
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
        void flushRef.current(latestBodyRef.current);
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

  const panel = useMemo(
    () => buildNoteExtractionPanel(body, confirmed, now),
    [body, confirmed, now],
  );

  // The note's nature (일지/회의록/…): a user pick wins, else the detector reads
  // the body. It gates which pending extractions read as on-topic, and
  // ones fold under a disclosure rather than compete with the fitting ones.
  const nature = useMemo<NoteNature>(
    () => natureOverride ?? detectNoteNature(body).nature,
    [natureOverride, body],
  );
  const { fitPending, offPending } = useMemo(() => {
    const fit: NoteExtraction[] = [];
    const off: NoteExtraction[] = [];
    for (const item of panel.pending) {
      (natureFits(nature, item.schemaId) ? fit : off).push(item);
    }
    return { fitPending: fit, offPending: off };
  }, [panel.pending, nature]);

  const onConfirm = useCallback(
    async (proposal: NoteExtraction["proposal"]) => {
      // The note must exist before an extraction can link to it; flushSave
      // returns the real note record (created or existing).
      const noteRecord = await flushSave(body);
      if (!noteRecord) return;
      await ledger.confirmExtraction(noteRecord, proposal);
    },
    [body, flushSave, ledger],
  );

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
          void ledger.discardRecords([id]);
        },
      },
    ];
  }, [note?.id, ledger]);

  const hasExtractions = panel.confirmed.length > 0 || panel.pending.length > 0;
  const dateLine = useMemo(() => {
    const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(now);
    return `${now.getMonth() + 1}월 ${now.getDate()}일 ${weekday}`;
  }, [now]);

  return (
    <div className="note-pane">
      <div className="note-pane-doc base-scroll" ref={docRef}>
        <div className="note-pane-doc-inner">
          <header className="note-pane-head">
            <span className="note-pane-date">{note ? formatDate(note.occurredStart ?? note.capturedAt) : `오늘 · ${dateLine}`}</span>
            <span className="note-pane-status" aria-live="polite">
              {body.length > 0 ? `${body.length.toLocaleString("ko-KR")}자` : ""}
              {saveState === "saved" ? " · 저장됨" : saveState === "dirty" ? " · 쓰는 중" : ""}
            </span>
            {noteActions.length > 0 ? (
              <BaseOverflowMenu items={noteActions} label="기록 작업" className="note-pane-menu" />
            ) : null}
            <button
              type="button"
              className="note-pane-toggle"
              onClick={() => setPanelOpen((v) => !v)}
              aria-label={panelOpen ? "추출 패널 접기" : "추출 패널 펼치기"}
              title={panelOpen ? "추출 패널 접기" : "추출 패널 펼치기"}
            >
              {panelOpen ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
            </button>
          </header>
          <NoteMarkdownEditor
            value={body}
            onChange={onChange}
            placeholder={"무엇이든 적어보세요"}
            autoFocus
            onOpenLink={handleOpenLink}
          />
        </div>
      </div>

      {panelOpen ? (
        <aside className="note-extract" aria-label="Mori가 찾은 것">
          <header className="note-extract-head">
            <Sparkles size={14} aria-hidden="true" />
            <span>Mori가 찾은 것</span>
            <select
              className="note-nature-chip"
              value={nature}
              onChange={(event) => setNatureOverride(event.target.value as NoteNature)}
              aria-label="이 기록의 성격"
              title="이 기록의 성격 · 뽑아낼 것을 고릅니다"
            >
              {NOTE_NATURES.map((value) => (
                <option key={value} value={value}>
                  {NOTE_NATURE_LABEL[value]}
                </option>
              ))}
            </select>
          </header>
          {hasExtractions ? (
            <div className="note-extract-list">
              {panel.confirmed.map((record) => (
                <div key={record.id} className="note-extract-card is-confirmed">
                  <div className="note-extract-kind">
                    <span className={`note-item-dot ${kindColorClass(record.schemaId)}`} aria-hidden="true" />
                    {schemaLabel(record, ledger.registry)}
                    <Check size={12} aria-hidden="true" className="note-extract-confirmed-mark" />
                  </div>
                  <p className="note-extract-title">{record.title}</p>
                  <p className="note-extract-meta">
                    {record.occurredStart ? formatDate(record.occurredStart) : "날짜 없음"}
                  </p>
                </div>
              ))}
              {fitPending.map((item) => (
                <PendingExtractionCard
                  key={item.key}
                  item={item}
                  ledger={ledger}
                  onConfirm={onConfirm}
                />
              ))}
              {offPending.length > 0 ? (
                <details className="note-extract-off">
                  <summary>이 성격과 결이 다른 {offPending.length}개</summary>
                  {offPending.map((item) => (
                    <PendingExtractionCard
                      key={item.key}
                      item={item}
                      ledger={ledger}
                      onConfirm={onConfirm}
                    />
                  ))}
                </details>
              ) : null}
            </div>
          ) : (
            <p className="note-extract-empty">쓰면 여기에 정리됩니다.</p>
          )}
          {backlinks.length > 0 ? (
            <details className="note-backlinks" open>
              <summary>이 기록을 참조하는 {backlinks.length}개</summary>
              {backlinks.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="note-backlink-row"
                  onClick={() => onOpenRecord(source.id)}
                >
                  <LinkIcon size={12} aria-hidden="true" />
                  <span className="note-backlink-title">{source.title}</span>
                </button>
              ))}
            </details>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

/** Extraction kinds a note item can be corrected to: writeable schemas only
 *  (imported / derived-only kinds are not manual retype targets). */
const NON_RETYPE_KINDS = new Set(["agent-session", "source-document", "qa"]);

/**
 * One pending extraction, editable before confirming: a wrong kind (an essay
 * line read as 할 일) or a wrong date costs one correction instead of
 * polluting the ledger. Confirming applies the edits onto the proposal:
 * properties are filtered to the target schema so the record stays valid.
 */
function PendingExtractionCard({
  item,
  ledger,
  onConfirm,
}: {
  item: NoteExtraction;
  ledger: RecordLedger;
  onConfirm: (proposal: NoteExtraction["proposal"]) => void | Promise<void>;
}) {
  const [schemaId, setSchemaId] = useState(item.schemaId);
  const initialDate = item.proposal.occurredStart?.slice(0, 10) ?? "";
  const [date, setDate] = useState(initialDate);

  const kinds = useMemo(
    () =>
      ledger.registry
        .list()
        .filter(
          (schema) =>
            (schema.layer === "occurrence" || schema.layer === "distilled") &&
            !NON_RETYPE_KINDS.has(schema.id),
        ),
    [ledger.registry],
  );

  const confirm = () => {
    const proposal = { ...item.proposal };
    if (schemaId !== item.schemaId) {
      proposal.schemaId = schemaId;
      const allowed = new Set(ledger.registry.get(schemaId)?.properties.map((p) => p.key) ?? []);
      proposal.properties = Object.fromEntries(
        Object.entries(item.proposal.properties).filter(([key]) => allowed.has(key)),
      );
    }
    if (date !== initialDate) {
      if (date) {
        proposal.occurredStart = date;
        proposal.timeBasis = "user-provided";
      } else {
        proposal.occurredStart = undefined;
        proposal.timeBasis = "unknown";
      }
      proposal.timeConfidence = undefined;
      proposal.dateEvidence = undefined;
    }
    void onConfirm(proposal);
  };

  return (
    <div className="note-extract-card">
      <div className="note-extract-kind">
        <span className={`note-item-dot ${kindColorClass(schemaId)}`} aria-hidden="true" />
        <select
          className="note-extract-kind-select"
          value={schemaId}
          onChange={(event) => setSchemaId(event.target.value)}
          aria-label="종류 바꾸기"
        >
          {kinds.map((schema) => (
            <option key={schema.id} value={schema.id}>
              {schema.name}
            </option>
          ))}
        </select>
      </div>
      <p className="note-extract-title">{item.title}</p>
      <div className="note-extract-foot">
        <input
          type="date"
          className="note-extract-date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-label="날짜 바꾸기"
        />
        {item.proposal.dateEvidence && date === initialDate ? (
          <span className="note-extract-meta">"{item.proposal.dateEvidence}"에서 추정</span>
        ) : null}
        <button type="button" className="note-extract-confirm" onClick={confirm}>
          확인
        </button>
      </div>
    </div>
  );
}
