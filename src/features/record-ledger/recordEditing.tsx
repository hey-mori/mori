/**
 * Record editing primitives · shared by the rail inspector and the center
 * document editor (v2). Inline click-to-edit text, an activity-date editor,
 * and the patch that a 되돌리기 restores. Kept here so both hosts edit a
 * record the same way.
 */
import { useState } from "react";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordPatch } from "../../lib/record-kernel/recordFactory";
import { timeBasisLabel } from "./recordPresentation";

/** The record fields a 되돌리기 restores from a revision's `before` snapshot. */
export function revertPatch(before: MoriRecord): RecordPatch {
  return {
    title: before.title,
    body: before.body,
    schemaId: before.schemaId,
    occurredStart: before.occurredStart,
    timeBasis: before.timeBasis,
    timeConfidence: before.timeConfidence,
    status: before.status,
    contextIds: before.contextIds,
    properties: before.properties,
  };
}

/** Inline click-to-edit text. Single line by default; multiline for a body.
 *  Enter (single-line) or ⌘/Ctrl+Enter (multiline) saves; Escape cancels. */
export function InlineEditable({
  value,
  multiline = false,
  placeholder,
  ariaLabel,
  className,
  onSave,
}: {
  value: string;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const begin = () => {
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    const trimmed = multiline ? draft : draft.trim();
    if (trimmed !== value && !(multiline === false && trimmed.length === 0)) onSave(trimmed);
    setEditing(false);
  };

  if (editing) {
    const shared = {
      value: draft,
      autoFocus: true,
      "aria-label": ariaLabel,
      onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
      onBlur: commit,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Escape") setEditing(false);
        if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit();
        }
      },
    };
    return multiline ? (
      <textarea className="record-inline-edit is-multiline" rows={4} {...shared} />
    ) : (
      <input className="record-inline-edit" {...shared} />
    );
  }

  const empty = value.trim().length === 0;
  return (
    <button
      type="button"
      className={`record-inline-view${empty ? " is-empty" : ""}${className ? ` ${className}` : ""}`}
      onClick={begin}
      title="클릭해서 편집"
    >
      {empty ? placeholder ?? "" : value}
    </button>
  );
}

/** The activity date, editable: pick a day (user-provided) or clear it
 *  (dateless, capture-fallback). Shows the honest basis label. */
export function ActivityDateEditor({
  record,
  onUpdate,
}: {
  record: MoriRecord;
  onUpdate: (patch: RecordPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = record.occurredStart
    ? `${formatClaudeRelativeKo(record.occurredStart)} · ${timeBasisLabel(record.timeBasis)}`
    : timeBasisLabel(record.timeBasis);

  if (!editing) {
    return (
      <div className="record-date-row">
        <span className="record-date-label">{label}</span>
        <button type="button" className="record-date-edit" onClick={() => setEditing(true)}>
          수정
        </button>
      </div>
    );
  }
  return (
    <div className="record-date-row is-editing">
      <input
        type="date"
        className="record-date-input"
        defaultValue={record.occurredStart?.slice(0, 10) ?? ""}
        autoFocus
        aria-label="활동 날짜"
        onChange={(event) => {
          if (event.target.value) {
            onUpdate({ occurredStart: event.target.value, timeBasis: "user-provided", timeConfidence: undefined });
            setEditing(false);
          }
        }}
      />
      <button
        type="button"
        className="record-date-clear"
        onClick={() => {
          onUpdate({ occurredStart: undefined, timeBasis: "capture-fallback", timeConfidence: undefined });
          setEditing(false);
        }}
      >
        날짜 없이
      </button>
      <button type="button" className="record-date-cancel" onClick={() => setEditing(false)}>
        취소
      </button>
    </div>
  );
}
