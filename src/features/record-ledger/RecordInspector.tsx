/**
 * RecordInspector · the on-demand detail for a ledger record.
 *
 * Shows what the record is, its schema properties, its related entities (with
 * an ID-stable rename), its honest activity vs capture times, the preserved
 * raw source it came from (origin as a relationship, revealed on request), and
 * its append-only history.
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
import type { KernelEntity, MoriRecord } from "../../lib/record-kernel/kernelTypes";
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

export function RecordInspector({
  record,
  registry,
  entities,
  onRenameEntity,
  onClose,
}: {
  record: MoriRecord;
  registry: SchemaRegistry;
  entities: KernelEntity[];
  onRenameEntity: (entityId: string, newName: string) => void;
  onClose: () => void;
}) {
  const { source, revisions, relations, loading } = useRecordProvenance(record.id);
  const [showRaw, setShowRaw] = useState(false);

  const badge = statusBadge(record.status);
  const properties = displayProperties(record, registry);
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
  const activityTime = record.occurredStart
    ? `${formatClaudeRelativeKo(record.occurredStart)} · ${timeBasisLabel(record.timeBasis)}`
    : timeBasisLabel(record.timeBasis);

  return (
    <BaseInspectorPanel
      className="inspector"
      ariaLabel="기록 상세"
      eyebrow={
        <>
          <span>{schemaLabel(record, registry)}</span>
          {badge ? <BaseStatusBadge tone={badge.tone}>{badge.label}</BaseStatusBadge> : null}
        </>
      }
      title={record.title}
      meta={activityTime}
      onClose={onClose}
    >
      {record.body && record.body !== record.title ? (
        <InspectorSection title="내용">
          <InspectorCard>
            <p className="record-inspector-body">{record.body}</p>
          </InspectorCard>
        </InspectorSection>
      ) : null}

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
