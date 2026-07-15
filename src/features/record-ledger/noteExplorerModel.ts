/**
 * Note explorer model · groups ledger records for the document explorer (v2):
 * by project (context) like Obsidian folders, with a 기타 bucket for records
 * that belong to no context, sortable by date or title. Pure over records +
 * contexts + relations so the explorer holds no derivation.
 */
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { displayTime, schemaLabel } from "./recordPresentation";

export type ExplorerSort = "date" | "title";
export type ExplorerGroupMode = "project" | "recent";

export const RECENT_GROUP_ID = "__recent__";
const RECENT_ID = RECENT_GROUP_ID;

/** A record type present in the list, for the 종류 filter. `count` orders the
 *  chips by how common the type is, so the filter grows with the schema
 *  taxonomy (extensible: a new schema is just another facet). */
export type TypeFacet = { schemaId: string; name: string; count: number };

export function recordTypeFacets(records: MoriRecord[], registry: SchemaRegistry): TypeFacet[] {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.schemaId, (counts.get(record.schemaId) ?? 0) + 1);
  return [...counts.entries()]
    .map(([schemaId, count]) => ({ schemaId, name: schemaLabel({ schemaId } as MoriRecord, registry), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type ExplorerGroup = {
  /** Context id, or "__none__" for the 기타 bucket. */
  id: string;
  name: string;
  records: MoriRecord[];
};

const NONE_ID = "__none__";
const NONE_NAME = "기타";

/** contextId -> record ids that belong to it (explicit `contextIds` plus
 *  `belongs-to` relations), mirroring `contextGrouping`. */
function membershipByRecord(records: MoriRecord[], relations: KernelRelation[]): Map<string, Set<string>> {
  const byRecord = new Map<string, Set<string>>();
  const add = (recordId: string, contextId: string) => {
    const set = byRecord.get(recordId);
    if (set) set.add(contextId);
    else byRecord.set(recordId, new Set([contextId]));
  };
  for (const record of records) for (const contextId of record.contextIds) add(record.id, contextId);
  for (const relation of relations) {
    if (relation.type === "belongs-to" && relation.toContextId) {
      add(relation.fromRecordId, relation.toContextId);
    }
  }
  return byRecord;
}

function sortRecords(records: MoriRecord[], sort: ExplorerSort): MoriRecord[] {
  const copy = [...records];
  if (sort === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    copy.sort((a, b) => displayTime(b).iso.localeCompare(displayTime(a).iso));
  }
  return copy;
}

/**
 * Groups records by context. A record in several contexts appears under its
 * first known context; a record in none lands in 기타. Groups are ordered by
 * their newest record (기타 always last); records within a group follow the
 * sort. Contexts with no records are omitted.
 */
export function buildExplorerGroups(
  records: MoriRecord[],
  contexts: KernelContext[],
  relations: KernelRelation[],
  sort: ExplorerSort,
  groupMode: ExplorerGroupMode = "project",
): ExplorerGroup[] {
  // 최근순: one flat list, newest first, no project headers.
  if (groupMode === "recent") {
    return records.length > 0
      ? [{ id: RECENT_ID, name: "최근", records: sortRecords(records, sort) }]
      : [];
  }

  const membership = membershipByRecord(records, relations);
  const contextName = new Map(contexts.map((context) => [context.id, context.name]));
  const buckets = new Map<string, MoriRecord[]>();

  for (const record of records) {
    const contextIds = membership.get(record.id);
    // First known context wins; unknown/none → 기타.
    let target = NONE_ID;
    if (contextIds) {
      for (const id of contextIds) {
        if (contextName.has(id)) {
          target = id;
          break;
        }
      }
    }
    const bucket = buckets.get(target);
    if (bucket) bucket.push(record);
    else buckets.set(target, [record]);
  }

  const groups: ExplorerGroup[] = [];
  for (const [id, groupRecords] of buckets) {
    if (id === NONE_ID) continue;
    groups.push({ id, name: contextName.get(id) ?? id, records: sortRecords(groupRecords, sort) });
  }
  // Newest-activity group first.
  groups.sort((a, b) => newestIso(b.records).localeCompare(newestIso(a.records)));

  const none = buckets.get(NONE_ID);
  if (none) groups.push({ id: NONE_ID, name: NONE_NAME, records: sortRecords(none, sort) });

  return groups;
}

function newestIso(records: MoriRecord[]): string {
  return records.reduce((latest, record) => {
    const iso = displayTime(record).iso;
    return iso > latest ? iso : latest;
  }, "");
}
