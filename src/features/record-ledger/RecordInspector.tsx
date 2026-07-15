/**
 * RecordInspector · the management panel for one record (R5b, screen M6).
 *
 * Not a viewer: the title, body, type, and activity date are editable in
 * place (each edit is an audited user revision), the origin is shown as a
 * provenance dot (Mori-derived vs user-entered), related entities rename, the
 * preserved raw source is revealed on request, and the history offers a
 * 되돌리기 on the most recent change. Short records live here in the rail;
 * the roomy full-detail variant is a follow-up.
 */
import { useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import {
  BaseInspectorPanel,
  InspectorCard,
  InspectorFields,
  InspectorNote,
  InspectorSection,
} from "../../components/ui/BaseInspectorPanel";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { KernelEntity, KernelRevision, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import type { RecordPatch } from "../../lib/record-kernel/recordFactory";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { useRecordProvenance } from "./useRecordProvenance";
import {
  displayProperties,
  schemaLabel,
  sourceKindLabel,
  statusBadge,
  timeBasisLabel,
} from "./recordPresentation";

const REVISION_LABEL: Record<string, string> = {
  create: "만듦",
  update: "수정",
  "status-change": "상태 변경",
  revert: "되돌림",
};

const ACTOR_LABEL: Record<string, string> = {
  user: "사용자",
  ai: "Mori",
  rule: "자동",
};

/** The record fields a 되돌리기 restores from a revision's `before` snapshot. */
function revertPatch(before: MoriRecord): RecordPatch {
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

export function RecordInspector({
  record,
  registry,
  entities,
  onRenameEntity,
  onUpdate,
  onClose,
}: {
  record: MoriRecord;
  registry: SchemaRegistry;
  entities: KernelEntity[];
  onRenameEntity: (entityId: string, newName: string) => void;
  onUpdate: (patch: RecordPatch) => void;
  onClose: () => void;
}) {
  // Re-fetch history when the record changes (an edit adds a revision).
  const { source, revisions, relations, loading } = useRecordProvenance(record.id, record.updatedAt);
  const [showRaw, setShowRaw] = useState(false);

  const badge = statusBadge(record.status);
  const properties = displayProperties(record, registry);
  const isDerived = record.origin === "derived";
  const relatedEntities = useMemo(() => {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const seen = new Set<string>();
    const result: KernelEntity[] = [];
    for (const relation of relations) {
      if (!relation.toEntityId || seen.has(relation.toEntityId)) continue;
      const entity = byId.get(relation.toEntityId);
      if (entity) {
        seen.add(entity.id);
        result.push(entity);
      }
    }
    return result;
  }, [relations, entities]);

  // The single most recent revision that changed record fields, for 되돌리기.
  const latestUndoable = useMemo(() => {
    const undoable = revisions.filter((revision) => revision.operation !== "create" && revision.before);
    return undoable.reduce<KernelRevision | null>(
      (latest, revision) => (!latest || revision.createdAt > latest.createdAt ? revision : latest),
      null,
    );
  }, [revisions]);

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="기록 상세"
      eyebrow={
        <>
          <span>{schemaLabel(record, registry)}</span>
          {badge ? <BaseStatusBadge tone={badge.tone}>{badge.label}</BaseStatusBadge> : null}
          <span className={`record-provenance${isDerived ? " is-mori" : " is-user"}`}>
            <span className="record-provenance-dot" aria-hidden="true" />
            {isDerived ? "Mori가 정리" : "직접 입력"}
          </span>
        </>
      }
      title={
        <InlineEditable
          value={record.title}
          ariaLabel="제목 편집"
          onSave={(next) => onUpdate({ title: next })}
        />
      }
      onClose={onClose}
    >
      <InspectorSection title="날짜">
        <ActivityDateEditor record={record} onUpdate={onUpdate} />
      </InspectorSection>

      <InspectorSection title="내용">
        <InspectorCard>
          <InlineEditable
            value={record.body}
            multiline
            placeholder="내용을 추가하세요"
            ariaLabel="내용 편집"
            className="record-inspector-body"
            onSave={(next) => onUpdate({ body: next })}
          />
        </InspectorCard>
      </InspectorSection>

      {properties.length > 0 ? (
        <InspectorSection title="속성">
          <InspectorFields items={properties} />
        </InspectorSection>
      ) : null}

      {relatedEntities.length > 0 ? (
        <InspectorSection title="관련 항목">
          <div className="record-inspector-entities">
            {relatedEntities.map((entity) => (
              <EntityChip key={entity.id} entity={entity} onRename={onRenameEntity} />
            ))}
          </div>
        </InspectorSection>
      ) : null}

      <InspectorSection title="출처">
        {loading ? (
          <InspectorNote>불러오는 중…</InspectorNote>
        ) : source ? (
          <>
            <InspectorFields
              items={[
                { label: "입력 방식", value: sourceKindLabel(source.kind) },
                { label: "기록한 시점", value: formatClaudeRelativeKo(source.capturedAt) },
              ]}
            />
            {source.rawBody ? (
              <div className="record-inspector-raw">
                <button
                  type="button"
                  className="record-inspector-raw-toggle"
                  onClick={() => setShowRaw((open) => !open)}
                  aria-expanded={showRaw}
                >
                  {showRaw ? "원문 숨기기" : "원문 보기"}
                </button>
                {showRaw ? <pre className="record-inspector-raw-body">{source.rawBody}</pre> : null}
              </div>
            ) : null}
          </>
        ) : (
          <InspectorNote>출처 정보를 찾지 못했습니다.</InspectorNote>
        )}
      </InspectorSection>

      {revisions.length > 0 ? (
        <InspectorSection title="기록 이력">
          <ul className="record-inspector-history">
            {revisions.map((revision) => (
              <li key={revision.id}>
                <span className="record-inspector-history-op">
                  {REVISION_LABEL[revision.operation] ?? revision.operation}
                </span>
                <span className="record-inspector-history-actor">
                  {ACTOR_LABEL[revision.actor] ?? revision.actor}
                </span>
                <span className="record-inspector-history-time">
                  {formatClaudeRelativeKo(revision.createdAt)}
                </span>
                {revision.id === latestUndoable?.id && latestUndoable.before ? (
                  <button
                    type="button"
                    className="record-inspector-history-undo"
                    onClick={() => onUpdate(revertPatch(latestUndoable.before as MoriRecord))}
                  >
                    되돌리기
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </InspectorSection>
      ) : null}
    </BaseInspectorPanel>
  );
}

/** Inline click-to-edit text. Single line by default; multiline for a body.
 *  Enter (single-line) or ⌘/Ctrl+Enter (multiline) saves; Escape cancels. */
function InlineEditable({
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
function ActivityDateEditor({
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

/** A related-entity chip. Reads the entity's current canonical name (so a
 *  rename shows everywhere at once) and offers an inline rename that teaches
 *  Mori the old name as an alias. */
function EntityChip({
  entity,
  onRename,
}: {
  entity: KernelEntity;
  onRename: (entityId: string, newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entity.canonicalName);

  if (editing) {
    const commit = () => {
      onRename(entity.id, draft);
      setEditing(false);
    };
    return (
      <span className="record-inspector-entity is-editing">
        <input
          className="record-inspector-entity-input"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setEditing(false);
          }}
          aria-label={`${entity.canonicalName} 이름 바꾸기`}
        />
        <button type="button" className="record-inspector-entity-act" onClick={commit} aria-label="변경">
          <Check size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="record-inspector-entity-act"
          onClick={() => setEditing(false)}
          aria-label="취소"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <span className="record-inspector-entity">
      {entity.canonicalName}
      <button
        type="button"
        className="record-inspector-entity-act"
        onClick={() => {
          setDraft(entity.canonicalName);
          setEditing(true);
        }}
        aria-label={`${entity.canonicalName} 이름 바꾸기`}
      >
        <Pencil size={11} aria-hidden="true" />
      </button>
    </span>
  );
}
