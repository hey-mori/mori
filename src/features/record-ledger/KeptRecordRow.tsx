/**
 * KeptRecordRow · one record kept out of a note, under the document (기록 v8 §3).
 *
 * Clicking it EXPANDS IT IN PLACE. It used to navigate to the record's own
 * document, which was a whole screen that answered nothing this row had not
 * already answered: a kept record is one line of the note's text, so it has no
 * substance of its own to travel to (v8 §0, the layer rule). Everything the user
 * actually wants here is a correction (wrong kind, wrong date, wrong project),
 * a throw-back, or a look at the sentence it came from, and all four can happen
 * without leaving the note.
 *
 * The record's own document (`DocumentEditor`) still exists and is still right
 * when the record is reached from 캘린더 or 검색, where the note is not open.
 */
import { useMemo, useState } from "react";
import { ChevronRight, Crosshair, Trash2 } from "lucide-react";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordLedger } from "./useRecordLedger";
import { ActivityDateEditor } from "./recordEditing";
import { ContextPicker } from "./ContextPicker";
import { kindColorClass, retypeTargets, schemaLabel } from "./recordPresentation";

export function KeptRecordRow({
  record,
  noteBody,
  ledger,
  open,
  onToggle,
  onRevealSpan,
  onDiscarded,
}: {
  record: MoriRecord;
  /** The live note text, so 본문에서 보기 can locate this record's source line. */
  noteBody: string;
  ledger: RecordLedger;
  open: boolean;
  onToggle: () => void;
  onRevealSpan: (span: { start: number; end: number }) => void;
  onDiscarded: (recordId: string, title: string) => void;
}) {
  const kinds = useMemo(() => retypeTargets(ledger.registry), [ledger.registry]);

  // The record's body is the slice of the note it was kept from, so locating it
  // is a plain search. An edited note may no longer contain it: then the
  // affordance is absent rather than present and broken.
  const span = useMemo(() => {
    const needle = record.body.trim();
    if (!needle) return null;
    const start = noteBody.indexOf(needle);
    return start < 0 ? null : { start, end: start + needle.length };
  }, [record.body, noteBody]);

  return (
    <div className={`note-foot-row${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="note-foot-open"
        onClick={onToggle}
        aria-expanded={open}
      >
        <ChevronRight size={12} aria-hidden="true" className="note-foot-caret" />
        <span className={`note-item-dot ${kindColorClass(record.schemaId)}`} aria-hidden="true" />
        <span className="note-foot-kind">{schemaLabel(record, ledger.registry)}</span>
        <span className="note-foot-title">{record.title}</span>
      </button>

      {open ? (
        <div className="note-foot-edit">
          <label className="note-foot-field">
            <span className="note-foot-field-label">종류</span>
            <select
              value={record.schemaId}
              onChange={(event) =>
                void ledger.updateRecord(record, { schemaId: event.target.value })
              }
              aria-label="종류"
            >
              {kinds.map((schema) => (
                <option key={schema.id} value={schema.id}>
                  {schema.name}
                </option>
              ))}
            </select>
          </label>

          <div className="note-foot-field">
            <span className="note-foot-field-label">날짜</span>
            {/* The same editor the record's own document uses, so a date is
                corrected identically wherever the record is met. */}
            <ActivityDateEditor
              record={record}
              onUpdate={(patch) => void ledger.updateRecord(record, patch)}
            />
          </div>

          <div className="note-foot-field">
            <span className="note-foot-field-label">프로젝트</span>
            <ContextPicker record={record} ledger={ledger} />
          </div>

          <div className="note-foot-edit-actions">
            {span ? (
              <button
                type="button"
                className="note-foot-locate"
                onClick={() => onRevealSpan(span)}
              >
                <Crosshair size={12} aria-hidden="true" />
                본문에서 보기
              </button>
            ) : null}
            {/* Keeping was one click, so unkeeping must be too. */}
            <button
              type="button"
              className="note-foot-discard"
              onClick={() => {
                void ledger.discardRecords([record.id]);
                onDiscarded(record.id, record.title);
              }}
            >
              <Trash2 size={12} aria-hidden="true" />
              버리기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
