/**
 * Context grouping · gathers the records that belong to each context, so a
 * project (or topic / routine / person) reads as its records, not just its AI
 * sessions (architecture doc §8, 프로젝트 reframed off the session-only model).
 *
 * Membership is either explicit on the record (`contextIds`, set by a
 * context-binding rule) or a `belongs-to` relation (set when a session is
 * recorded into a project, or a routine is saved). Pure derivation.
 */
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";

export type ContextGroup = {
  context: KernelContext;
  records: MoriRecord[];
};

/** contextId -> record ids that belong to it, from both membership paths. */
function membershipIndex(records: MoriRecord[], relations: KernelRelation[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  const add = (contextId: string, recordId: string) => {
    const set = index.get(contextId);
    if (set) set.add(recordId);
    else index.set(contextId, new Set([recordId]));
  };
  for (const record of records) {
    for (const contextId of record.contextIds) add(contextId, record.id);
  }
  for (const relation of relations) {
    if (relation.type === "belongs-to" && relation.toContextId) {
      add(relation.toContextId, relation.fromRecordId);
    }
  }
  return index;
}

/**
 * Groups records by context, most records first. Only contexts that actually
 * hold records appear. Within a context, records are newest-first by capture
 * time (a stable, always-present ordering).
 */
export function groupRecordsByContext(
  contexts: KernelContext[],
  records: MoriRecord[],
  relations: KernelRelation[],
): ContextGroup[] {
  const index = membershipIndex(records, relations);
  const recordsById = new Map(records.map((record) => [record.id, record]));

  const groups: ContextGroup[] = [];
  for (const context of contexts) {
    const ids = index.get(context.id);
    if (!ids || ids.size === 0) continue;
    const memberRecords = [...ids]
      .map((id) => recordsById.get(id))
      .filter((record): record is MoriRecord => Boolean(record))
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    groups.push({ context, records: memberRecords });
  }

  return groups.sort((a, b) => b.records.length - a.records.length);
}

/** A context's records split into labeled sections by kind, so a project reads
 *  as "그 프로젝트의 세션 · 결정 · 노트 · 활동", not one undifferentiated list. */
export type RecordSection = {
  id: string;
  label: string;
  records: MoriRecord[];
};

/** Section order + the schema families each one gathers. A schema not listed
 *  here falls into 기타, so a new schema is never dropped. */
const SECTION_SPECS: ReadonlyArray<{ id: string; label: string; schemas: string[] }> = [
  { id: "session", label: "세션", schemas: ["agent-session"] },
  { id: "decision", label: "결정", schemas: ["decision", "insight"] },
  { id: "note", label: "노트", schemas: ["note", "knowledge", "qa"] },
  {
    id: "activity",
    label: "활동",
    schemas: ["activity", "task", "event", "workout", "study-session"],
  },
];

/** The section id a schema belongs to (기타 for anything unlisted). */
export function sectionForSchema(schemaId: string): string {
  for (const spec of SECTION_SPECS) {
    if (spec.schemas.includes(schemaId)) return spec.id;
  }
  return "other";
}

/**
 * Group a context's records into labeled sections in a fixed order
 * (세션 · 결정 · 노트 · 활동 · 기타). Within a section the input order is
 * preserved (the caller passes newest-first). Empty sections are dropped.
 */
export function groupRecordsBySection(records: MoriRecord[]): RecordSection[] {
  const buckets = new Map<string, MoriRecord[]>();
  for (const record of records) {
    const id = sectionForSchema(record.schemaId);
    const list = buckets.get(id);
    if (list) list.push(record);
    else buckets.set(id, [record]);
  }

  const sections: RecordSection[] = [];
  for (const spec of SECTION_SPECS) {
    const recs = buckets.get(spec.id);
    if (recs && recs.length > 0) sections.push({ id: spec.id, label: spec.label, records: recs });
  }
  const other = buckets.get("other");
  if (other && other.length > 0) sections.push({ id: "other", label: "기타", records: other });
  return sections;
}

const CONTEXT_TYPE_LABEL: Record<KernelContext["type"], string> = {
  project: "프로젝트",
  workstream: "워크스트림",
  topic: "주제",
  area: "영역",
  routine: "루틴",
  person: "사람",
  custom: "기타",
};

export function contextTypeLabel(type: KernelContext["type"]): string {
  return CONTEXT_TYPE_LABEL[type];
}
