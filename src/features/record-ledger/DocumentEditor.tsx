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
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { KernelRevision, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordPatch } from "../../lib/record-kernel/recordFactory";
import type { RecordLedger } from "./useRecordLedger";
import { RecordComposer } from "./composer/RecordComposer";
import { ActivityDateEditor, InlineEditable, revertPatch } from "./recordEditing";
import { kindColorClass, schemaLabel, sourceKindLabel } from "./recordPresentation";
import { recordSnippet, timeOfDayLabel } from "./noteExplorerModel";
import { useRecordProvenance } from "./useRecordProvenance";

const REVISION_LABEL: Record<string, string> = {
  create: "만듦",
  update: "수정",
  "status-change": "상태 변경",
  revert: "되돌림",
};
const ACTOR_LABEL: Record<string, string> = { user: "사용자", ai: "Mori", rule: "자동" };

export function DocumentEditor({
  record,
  composing,
  ledger,
  todayRecords,
  onOpenRecord,
  onUpdate,
  onSaved,
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
  now: Date;
}) {
  // Idle and composing are one state: the capture canvas (v3). The composer is
  // the screen's front door, and the day visibly builds right under it.
  if (composing || !record) {
    return (
      <div className="doc-editor">
        <div className="doc-canvas base-scroll">
          <div className="doc-canvas-inner">
            <RecordComposer ledger={ledger} onSaved={onSaved} />
            {todayRecords.length > 0 ? (
              <section className="doc-today" aria-label="오늘 남긴 기록">
                <header className="doc-today-head">
                  오늘
                  <span className="doc-today-count">{todayRecords.length}</span>
                </header>
                <ul className="doc-today-list">
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
              </section>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
  return <RecordDocument key={record.id} record={record} ledger={ledger} onUpdate={onUpdate} now={now} />;
}

function RecordDocument({
  record,
  ledger,
  onUpdate,
  now,
}: {
  record: MoriRecord;
  ledger: RecordLedger;
  onUpdate: (patch: RecordPatch) => void;
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
  const latestUndoable = useMemo(() => {
    const undoable = revisions.filter((revision) => revision.operation !== "create" && revision.before);
    return undoable.reduce<KernelRevision | null>(
      (latest, revision) => (!latest || revision.createdAt > latest.createdAt ? revision : latest),
      null,
    );
  }, [revisions]);

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
            <ul className="doc-history">
              {revisions.map((revision) => (
                <li key={revision.id}>
                  <span className="doc-history-op">{REVISION_LABEL[revision.operation] ?? revision.operation}</span>
                  <span className="doc-history-actor">{ACTOR_LABEL[revision.actor] ?? revision.actor}</span>
                  <span className="doc-history-time">{formatClaudeRelativeKo(revision.createdAt)}</span>
                  {revision.id === latestUndoable?.id && latestUndoable.before ? (
                    <button
                      type="button"
                      className="doc-history-undo"
                      onClick={() => onUpdate(revertPatch(latestUndoable.before as MoriRecord))}
                    >
                      되돌리기
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
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
