/**
 * RecordInspector · the on-demand detail for a ledger record.
 *
 * Shows what the record is, its schema properties, its honest activity vs
 * capture times, the preserved raw source it came from (origin as a
 * relationship, revealed on request), and its append-only history. Read-only
 * for now; the rename / re-type affordances land with the entity surface.
 */
import { useState } from "react";
import {
  BaseInspectorPanel,
  InspectorCard,
  InspectorFields,
  InspectorNote,
  InspectorSection,
} from "../../components/ui/BaseInspectorPanel";
import { BaseStatusBadge } from "../../components/ui/BaseStatusBadge";
import { formatClaudeRelativeKo } from "../../lib/claude/claudeTauri";
import type { MoriRecord } from "../../lib/record-kernel/kernelTypes";
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
  onClose,
}: {
  record: MoriRecord;
  registry: SchemaRegistry;
  onClose: () => void;
}) {
  const { source, revisions, loading } = useRecordProvenance(record.id);
  const [showRaw, setShowRaw] = useState(false);

  const badge = statusBadge(record.status);
  const properties = displayProperties(record, registry);
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
