/**
 * LedgerTimelineRow · one record on the 기록 timeline (R3).
 *
 * Richer than the shared `LedgerRow`: a time column (time-of-day when the
 * activity carries one), a kind chip colored by schema family, a 2-line note
 * preview, and a meta line that reads the record's honest signals, project
 * context, 추정 date basis, 잠정 status, and whether Mori did the organizing.
 * Selectable; selection swaps the context rail to the inspector.
 */
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { schemaLabel } from "./recordPresentation";

/** Schema family → a calm kind-chip color class. Anything unlisted reads as a
 *  neutral note so a new schema never renders unstyled. */
const KIND_CLASS: Record<string, string> = {
  activity: "is-work",
  "agent-session": "is-work",
  workout: "is-exercise",
  "study-session": "is-study",
  knowledge: "is-study",
  insight: "is-insight",
  decision: "is-insight",
  task: "is-task",
  event: "is-task",
  note: "is-note",
  "source-document": "is-source",
  qa: "is-source",
};

function timeOfDay(occurredStart: string | undefined): string | null {
  // Only render a clock when the activity time carries one; date-only records
  // (the pilot's common case) leave the column empty since the day header
  // already states the date.
  if (!occurredStart || !occurredStart.includes("T")) return null;
  const date = new Date(occurredStart);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LedgerTimelineRow({
  record,
  registry,
  contextName,
  selected,
  isNew,
  onSelect,
}: {
  record: MoriRecord;
  registry: SchemaRegistry;
  /** The record's first bound context name, when any (project chip). */
  contextName: string | null;
  selected: boolean;
  /** Just-saved: highlighted briefly so the placement is visible. */
  isNew: boolean;
  onSelect: () => void;
}) {
  const kindClass = KIND_CLASS[record.schemaId] ?? "is-note";
  const clock = timeOfDay(record.occurredStart);
  const hasPreview = record.body.trim().length > 0 && record.body.trim() !== record.title.trim();
  const isDerived = record.origin === "derived";
  const isInferred = record.timeBasis === "ai-inferred";
  const isProvisional = record.status === "provisional";
  const hasMeta = Boolean(contextName) || isProvisional || isInferred || isDerived;

  return (
    <li>
      <button
        type="button"
        className={`timeline-row${selected ? " is-selected" : ""}${isNew ? " is-new" : ""}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className="timeline-row-time" aria-hidden={clock ? undefined : "true"}>
          {clock}
        </span>
        <span className="timeline-row-body">
          <span className="timeline-row-head">
            <span className={`timeline-kind ${kindClass}`}>{schemaLabel(record, registry)}</span>
            <span className="timeline-row-title">{record.title}</span>
          </span>
          {hasPreview ? <span className="timeline-row-preview">{record.body}</span> : null}
          {hasMeta ? (
            <span className="timeline-row-meta">
              {contextName ? <span className="timeline-tag is-context">{contextName}</span> : null}
              {isProvisional ? <span className="timeline-tag is-provisional">잠정</span> : null}
              {isInferred ? <span className="timeline-flag is-inferred">추정</span> : null}
              {isDerived ? <span className="timeline-flag is-mori">Mori 정리</span> : null}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
