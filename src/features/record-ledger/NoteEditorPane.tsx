/**
 * NoteEditorPane · the center + right of the 기록 v4 note workspace.
 *
 * You write a note freely (one surface, the first line is its title, it saves
 * itself); Mori extracts the typed records it can pull out of the text and shows
 * them in the right 추출 panel, where each is confirmed into a durable record
 * linked back to the note. No composer box, no 정리 button — writing is capture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import {
  buildNoteExtractionPanel,
  deriveNoteTitle,
  type NoteExtraction,
} from "./noteWorkspace";
import { kindColorClass, schemaLabel } from "./recordPresentation";
import { formatDate } from "../../lib/formatting/time";

const SAVE_DEBOUNCE_MS = 650;

export function NoteEditorPane({
  note,
  ledger,
  onNoteCreated,
  now,
}: {
  /** The selected note record, or null for a brand-new note. */
  note: MoriRecord | null;
  ledger: RecordLedger;
  /** Fires with the new record id the first time a fresh note is saved, so the
   *  workspace can select it. */
  onNoteCreated: (recordId: string) => void;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load a different note's body when the workspace selects one; a brand-new
  // note (note === null) starts blank. The just-created case is a no-op because
  // note.body already equals the current body.
  useEffect(() => {
    const incomingId = note?.id ?? null;
    if (incomingId === noteIdRef.current) {
      if (note && note.body !== body && document.activeElement !== textareaRef.current) {
        // An external edit (e.g. undo) to the same note, while not typing here.
        setBody(note.body);
      }
      return;
    }
    noteIdRef.current = incomingId;
    setBody(note?.body ?? "");
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
      // update instead of creating a second record.
      if (createInFlight.current) {
        const created = await createInFlight.current;
        if (created) {
          await ledger.updateRecord(created, { body: text, title: deriveNoteTitle(text) || "새 기록" });
        }
        return created;
      }
      const pending = ledger.createNote(text);
      createInFlight.current = pending;
      const created = await pending;
      createInFlight.current = null;
      if (created) {
        noteIdRef.current = created.id;
        onNoteCreated(created.id);
      }
      return created;
    },
    [ledger, onNoteCreated],
  );

  const onChange = (text: string) => {
    setBody(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(text), SAVE_DEBOUNCE_MS);
  };

  // Persist any pending edit when unmounting or switching notes.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Focus the writing surface on mount (a note is for writing), placing the
  // caret at the end so a just-selected note continues where it left off.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const onConfirm = useCallback(
    async (item: NoteExtraction) => {
      // The note must exist before an extraction can link to it; flushSave
      // returns the real note record (created or existing).
      const noteRecord = await flushSave(body);
      if (!noteRecord) return;
      await ledger.confirmExtraction(noteRecord, item.proposal);
    },
    [body, flushSave, ledger],
  );

  const hasExtractions = panel.confirmed.length > 0 || panel.pending.length > 0;
  const dateLine = useMemo(() => {
    const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(now);
    return `${now.getMonth() + 1}월 ${now.getDate()}일 ${weekday}`;
  }, [now]);

  return (
    <div className="note-pane">
      <div className="note-pane-doc base-scroll">
        <div className="note-pane-doc-inner">
          <header className="note-pane-head">
            <span className="note-pane-date">{note ? formatDate(note.occurredStart ?? note.capturedAt) : `오늘 · ${dateLine}`}</span>
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
          <textarea
            ref={textareaRef}
            className="note-pane-body"
            value={body}
            onChange={(event) => onChange(event.target.value)}
            placeholder="오늘 한 일, 배운 것, 떠오른 생각을 그대로 적으세요.&#10;첫 줄이 제목이 됩니다."
            aria-label="기록 작성"
            spellCheck={false}
          />
        </div>
      </div>

      {panelOpen ? (
        <aside className="note-extract" aria-label="Mori가 찾은 것">
          <header className="note-extract-head">
            <Sparkles size={14} aria-hidden="true" />
            <span>Mori가 찾은 것</span>
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
              {panel.pending.map((item) => (
                <div key={item.key} className="note-extract-card">
                  <div className="note-extract-kind">
                    <span className={`note-item-dot ${kindColorClass(item.schemaId)}`} aria-hidden="true" />
                    {ledger.registry.get(item.schemaId)?.name ?? item.schemaId}
                  </div>
                  <p className="note-extract-title">{item.title}</p>
                  <div className="note-extract-foot">
                    <span className="note-extract-meta">
                      {item.proposal.occurredStart ? formatDate(item.proposal.occurredStart) : "날짜 없음"}
                    </span>
                    <button type="button" className="note-extract-confirm" onClick={() => void onConfirm(item)}>
                      확인
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="note-extract-empty">
              쓰다 보면 Mori가 운동·할 일·결정 같은 걸 여기서 뽑아냅니다.
            </p>
          )}
        </aside>
      ) : null}
    </div>
  );
}
