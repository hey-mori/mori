/**
 * 읽기 · what Mori read out of this note (기록 v7).
 *
 * The user 쓰고, Mori 읽는다. The surface carries no title of its own: the
 * regions title themselves (요약 · 용어 · 인사이트 · 남길 기록), which is
 * Notion's model and the copy-diet rule. It sits ABOVE the document rather than
 * beside it, because vertical is the cheap axis and horizontal is the product:
 * the old 264px right panel meant the writing measure never reached its designed
 * 720px on a 1280 laptop.
 *
 * Region ORDER is load-bearing: understanding comes first and 남길 기록 comes
 * last, because for most documents the honest content of that region is nothing.
 * The old panel had it exactly backwards.
 */
import { useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import type { DocumentUnderstanding } from "../../lib/understanding/understandingTypes";
import { NOTE_NATURE_LABEL } from "./noteNature";
import { kindColorClass, schemaLabel } from "./recordPresentation";
import type { RecordLedger } from "./useRecordLedger";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";

export type ReadingState =
  | { kind: "none" }
  | { kind: "reading" }
  | { kind: "read"; understanding: DocumentUnderstanding };

export function NoteReading({
  state,
  ledger,
  onConfirmItem,
  onRevealSpan,
  confirmedTitles,
}: {
  state: ReadingState;
  ledger: RecordLedger;
  onConfirmItem: (item: DocumentUnderstanding["items"][number]) => void;
  onRevealSpan: (span: { start: number; end: number }) => void;
  /** Titles already kept out of this note, so a kept item stops offering. */
  confirmedTitles: Set<string>;
}) {
  const [open, setOpen] = useState(true);

  if (state.kind === "none") return null;

  if (state.kind === "reading") {
    return (
      <div className="note-reading is-working" aria-live="polite">
        <span className="note-reading-status">읽는 중…</span>
      </div>
    );
  }

  const { understanding } = state;
  const items = understanding.items.filter((item) => !confirmedTitles.has(item.title));
  const hasAnything =
    Boolean(understanding.summary) ||
    understanding.terms.length > 0 ||
    understanding.insights.length > 0 ||
    items.length > 0;
  // Nothing verified. Say nothing: for a short journal or a fragment, nothing IS
  // the reading, and an empty band would be chrome with no content.
  if (!hasAnything) return null;

  const natureLabel = NOTE_NATURE_LABEL[understanding.nature];
  // Low margin shows a question mark on the same chip, never a percentage and
  // never a prompt to choose. It changes nothing else.
  const unsure = understanding.natureConfidence < 0.5;

  return (
    <section className={`note-reading${open ? "" : " is-collapsed"}`} aria-label="읽기">
      <button
        type="button"
        className="note-reading-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={13} aria-hidden="true" className="note-reading-caret" />
        <span className={`note-reading-nature${unsure ? " is-unsure" : ""}`}>
          {natureLabel}
          {unsure ? "?" : ""}
        </span>
        {!open && understanding.summary ? (
          <span className="note-reading-peek">{understanding.summary}</span>
        ) : null}
      </button>

      {open ? (
        <div className="note-reading-body">
          {understanding.summary ? (
            <p className="note-reading-summary">{understanding.summary}</p>
          ) : null}

          {understanding.terms.length > 0 ? (
            <dl className="note-reading-terms">
              {understanding.terms.map((term) => (
                <div key={term.term} className="note-reading-term">
                  <dt>
                    <button type="button" onClick={() => onRevealSpan(term.span)}>
                      {term.term}
                    </button>
                  </dt>
                  <dd>{term.gloss}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {understanding.insights.length > 0 ? (
            <ul className="note-reading-insights">
              {understanding.insights.map((insight, index) => (
                <li key={index}>
                  {/* Every insight points at the span it came from, so it can be
                      checked against the note rather than believed. */}
                  <button type="button" onClick={() => onRevealSpan(insight.span)}>
                    {insight.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {items.length > 0 ? (
            <div className="note-reading-items">
              <p className="note-reading-label">남길 기록</p>
              {items.map((item, index) => (
                <div key={`${item.title}-${index}`} className="note-reading-item">
                  <span
                    className={`note-item-dot ${kindColorClass(item.schemaId)}`}
                    aria-hidden="true"
                  />
                  <span className="note-reading-item-kind">
                    {schemaLabel({ schemaId: item.schemaId } as MoriRecord, ledger.registry)}
                  </span>
                  <button
                    type="button"
                    className="note-reading-item-title"
                    onClick={() => onRevealSpan(item.span)}
                  >
                    {item.title}
                  </button>
                  <button
                    type="button"
                    className="note-reading-keep"
                    onClick={() => onConfirmItem(item)}
                  >
                    <Check size={12} aria-hidden="true" />
                    남기기
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
