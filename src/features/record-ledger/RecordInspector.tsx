/**
 * RecordInspector · the management panel for one record (R5b, screen M6).
 *
 * Not a viewer: the title, body, type, and activity date are editable in
 * place (each edit is an audited user revision), the origin is shown as a
 * provenance dot (who actually made the record), related entities rename, the
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
import { ActivityDateEditor, InlineEditable, revertPatch, titlePatch } from "./recordEditing";
import { displayProperties, originLabel, schemaLabel, sourceKindLabel, statusBadge } from "./recordPresentation";
import { useRecordTitle } from "../../app/useDisclosedView";

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
  const recordTitle = useRecordTitle();
  const [showRaw, setShowRaw] = useState(false);

  const badge = statusBadge(record.status);
  const properties = displayProperties(record, registry);
  const provenance = originLabel(record.origin);
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
          <span className={`record-provenance is-${provenance.tone}`}>
            <span className="record-provenance-dot" aria-hidden="true" />
            {provenance.label}
          </span>
        </>
      }
      title={
        <InlineEditable
          value={record.title}
          display={recordTitle(record)}
          ariaLabel="제목 편집"
          onSave={(next) => onUpdate(titlePatch(record, next))}
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
