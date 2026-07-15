/**
 * DocumentEditor · the center pane of the document workspace (v2). Hosts a
 * new capture (the composer) or the selected record as an editable document:
 * title, an inline meta row (date · project · type), and a full-height body,
 * with 원문 and 이력 as quiet disclosures instead of a fixed panel. No right
 * panel. Long notes open in full.
 */
import { useMemo, useState } from "react";
import { Check, FileText, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { KernelRevision, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordPatch } from "../../lib/record-kernel/recordFactory";
import type { RecordLedger } from "./useRecordLedger";
import { RecordComposer } from "./composer/RecordComposer";
import { ActivityDateEditor, InlineEditable, revertPatch } from "./recordEditing";
import { kindColorClass, schemaLabel, sourceKindLabel } from "./recordPresentation";
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
  onUpdate,
  onSaved,
  now,
}: {
  record: MoriRecord | null;
  composing: boolean;
  ledger: RecordLedger;
  onUpdate: (patch: RecordPatch) => void;
  onSaved: (savedRecordIds: string[]) => void;
  now: Date;
}) {
  if (composing) {
    return (
      <div className="doc-editor">
        <div className="doc-editor-main is-center">
          <RecordComposer ledger={ledger} onSaved={onSaved} />
        </div>
      </div>
    );
  }
  if (!record) {
    return (
      <div className="doc-editor">
        <div className="doc-editor-empty">
          <FileText size={26} aria-hidden="true" />
          <p className="doc-editor-empty-title">메모를 선택하거나 새 기록을 시작하세요</p>
          <p className="doc-editor-empty-sub">왼쪽에서 메모를 고르면 여기서 바로 읽고 고칠 수 있어요.</p>
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
          <span className={`doc-chip is-kind ${kindColorClass(record.schemaId)}`}>
            {schemaLabel(record, ledger.registry)}
          </span>
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
