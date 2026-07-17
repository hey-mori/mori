/**
 * DocumentEditor · the center pane of the document workspace (v2). Hosts a
 * new capture (the composer) or the selected record as an editable document:
 * title, an inline meta row (date · project · type), and a full-height body,
 * with 원문 and 이력 as quiet disclosures instead of a fixed panel. No right
 * panel. Long notes open in full.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordPatch } from "../../lib/record-kernel/recordFactory";
import type { RecordLedger } from "./useRecordLedger";
import { RecordComposer } from "./composer/RecordComposer";
import { ActivityDateEditor, InlineEditable, RecordHistory } from "./recordEditing";
import { kindColorClass, schemaLabel, sourceKindLabel } from "./recordPresentation";
import { recordSnippet, timeOfDayLabel } from "./noteExplorerModel";
import { useRecordProvenance } from "./useRecordProvenance";

export function DocumentEditor({
  record,
  composing,
  ledger,
  todayRecords,
  onOpenRecord,
  onUpdate,
  onSaved,
  onDiscarded,
  now,
}: {
  record: MoriRecord | null;
  composing: boolean;
  ledger: RecordLedger;
  /** Today's ledger-visible records, newest first — the canvas's 오늘 section. */
  todayRecords: MoriRecord[];
  onOpenRecord: (recordId: string) => void;
  onUpdate: (patch: RecordPatch) => void;
  onSaved: (savedRecordIds: string[]) => void;
  /** Fires when this record is thrown away, so the workspace can offer the
   *  되돌리기 this screen cannot: discarding clears the pane it lives in. */
  onDiscarded: (recordId: string, title: string) => void;
  now: Date;
}) {
  // Idle and composing are one state: the capture canvas (v3). "오늘" anchors
  // the day (the ledger's rhythm carried onto the front door, Apple-Journal
  // style); the composer is the hero input, and the day builds right under it.
  if (composing || !record) {
    const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(now);
    const dateLine = `${now.getMonth() + 1}월 ${now.getDate()}일 ${weekday}`;
    return (
      <div className="doc-editor">
        <div className="doc-canvas base-scroll">
          <div className="doc-canvas-inner">
            <header className="doc-canvas-head">
              <div className="doc-canvas-heading">
                <h2 className="doc-canvas-title">오늘</h2>
                <p className="doc-canvas-date">{dateLine}</p>
              </div>
              {todayRecords.length > 0 ? (
                <span className="doc-canvas-count">기록 {todayRecords.length}건</span>
              ) : null}
            </header>

            <RecordComposer ledger={ledger} onSaved={onSaved} />

            {todayRecords.length > 0 ? (
              <ul className="doc-today-list" aria-label="오늘 남긴 기록">
                {todayRecords.map((item) => {
                  const snippet = recordSnippet(item);
                  const time = item.occurredStart ? timeOfDayLabel(item.occurredStart) : "";
                  return (
                    <li key={item.id}>
                      <button type="button" className="doc-today-item" onClick={() => onOpenRecord(item.id)}>
                        <span className={`note-item-dot ${kindColorClass(item.schemaId)}`} aria-hidden="true" />
                        <span className="doc-today-text">
                          <span className="doc-today-title">{item.title}</span>
                          {snippet ? <span className="doc-today-snippet">{snippet}</span> : null}
                        </span>
                        {time ? <span className="note-item-time">{time}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="doc-today-empty">적으면 오늘의 기록이 여기에 쌓입니다.</p>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <RecordDocument
      key={record.id}
      record={record}
      ledger={ledger}
      onUpdate={onUpdate}
      onDiscarded={onDiscarded}
      now={now}
    />
  );
}

function RecordDocument({
  record,
  ledger,
  onUpdate,
  onDiscarded,
  now,
}: {
  record: MoriRecord;
  ledger: RecordLedger;
  onUpdate: (patch: RecordPatch) => void;
  onDiscarded: (recordId: string, title: string) => void;
  now: Date;
}) {
  const { source, revisions } = useRecordProvenance(record.id, record.updatedAt);
  const [showRaw, setShowRaw] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const contextName = useMemo(() => {
    for (const id of record.contextIds) {
      const found = ledger.contexts.find((context) => context.id === id);
      if (found) return found.name;
    }
    return null;
  }, [record.contextIds, ledger.contexts]);

  const isCandidate = record.status === "candidate";
  const isDerived = record.origin === "derived";
  return (
    <div className="doc-editor">
      <div className="doc-editor-bar">
        <span className="doc-crumb">
          {contextName ? `${contextName} · ` : ""}
          {schemaLabel(record, ledger.registry)}
        </span>
        <span className={`doc-prov${isDerived ? " is-mori" : " is-user"}`}>
          <span className="doc-prov-dot" aria-hidden="true" />
          {isDerived ? "Mori가 정리" : "직접 입력"}
        </span>
        <span className="doc-bar-sp" />
        {source?.rawBody ? (
          <button type="button" className="doc-bar-act" onClick={() => setShowRaw((v) => !v)}>
            원문
          </button>
        ) : null}
        {revisions.length > 0 ? (
          <button type="button" className="doc-bar-act" onClick={() => setShowHistory((v) => !v)}>
            이력
          </button>
        ) : null}
        {/* A record could be opened, edited and read here but never thrown away:
            the only 버리기 lived on the note that produced it, and a record
            captured any other way had no door at all. */}
        <button
          type="button"
          className="doc-bar-act is-discard"
          onClick={() => {
            onDiscarded(record.id, record.title);
            void ledger.discardRecords([record.id]);
          }}
        >
          버리기
        </button>
      </div>

      {isCandidate ? (
        <div className="doc-candidate">
          <span>확인이 필요한 기록입니다.</span>
          <span className="doc-bar-sp" />
          <Button variant="primary" size="sm" icon={Check} onClick={() => void ledger.setStatus(record, "active")}>
            반영
          </Button>
          <Button variant="ghost" size="sm" icon={X} onClick={() => void ledger.setStatus(record, "discarded")}>
            무시
          </Button>
        </div>
      ) : null}

      <div className="doc-editor-main">
        <div className="doc-title">
          <InlineEditable value={record.title} ariaLabel="제목 편집" onSave={(next) => onUpdate({ title: next })} />
        </div>
        <div className="doc-meta">
          <ActivityDateEditor record={record} onUpdate={onUpdate} />
          {contextName ? <span className="doc-chip is-proj">{contextName}</span> : null}
          <KindPicker record={record} ledger={ledger} onUpdate={onUpdate} />
        </div>

        <div className="doc-body">
          <InlineEditable
            value={record.body}
            multiline
            placeholder="내용을 추가하세요"
            ariaLabel="내용 편집"
            className="doc-body-edit"
            onSave={(next) => onUpdate({ body: next })}
          />
        </div>

        {showRaw && source?.rawBody ? (
          <section className="doc-disclosure">
            <h4>원문 · {sourceKindLabel(source.kind)}</h4>
            <pre className="doc-raw">{source.rawBody}</pre>
          </section>
        ) : null}

        {showHistory && revisions.length > 0 ? (
          <section className="doc-disclosure">
            <h4>기록 이력</h4>
            <RecordHistory revisions={revisions} onRevert={onUpdate} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Kinds that are derived from an external source (imported / distilled) and so
 *  are not offered as a manual retype target for a note. */
const DERIVED_KINDS = new Set(["agent-session", "source-document", "qa"]);

/**
 * The record's kind, as a picker. Retyping a record is a kernel-supported patch
 * (`applyRecordPatch` validates against the schema it becomes), so this just
 * emits `onUpdate({ schemaId })`. Schemas come from the registry (schemas-as-
 * data), so a new user kind appears here with no code change.
 */
function KindPicker({
  record,
  ledger,
  onUpdate,
}: {
  record: MoriRecord;
  ledger: RecordLedger;
  onUpdate: (patch: RecordPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options = useMemo(
    () => ledger.registry.list().filter((schema) => !DERIVED_KINDS.has(schema.id)),
    [ledger.registry],
  );

  return (
    <span className="doc-kind-picker" ref={ref}>
      <button
        type="button"
        className={`doc-chip is-kind is-picker ${kindColorClass(record.schemaId)}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="종류 변경"
      >
        {schemaLabel(record, ledger.registry)}
        <ChevronDown size={11} aria-hidden="true" />
      </button>
      {open ? (
        <div className="doc-kind-menu" role="menu">
          {options.map((schema) => {
            const current = schema.id === record.schemaId;
            return (
              <button
                key={schema.id}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className={`doc-kind-opt${current ? " is-current" : ""}`}
                onClick={() => {
                  if (!current) onUpdate({ schemaId: schema.id });
                  setOpen(false);
                }}
              >
                <span className={`doc-kind-dot ${kindColorClass(schema.id)}`} aria-hidden="true" />
                {schema.name}
                {current ? <Check size={12} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </span>
  );
}
