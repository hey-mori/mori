/**
 * Routine discovery · finds higher-order units in the ledger (architecture
 * doc §6). When an entity recurs enough (주 3회 러닝), Mori suggests turning
 * it into a routine; accepting creates a routine context the records belong
 * to. Pure derivation, suggestion-only: it never creates a routine silently.
 */
import type {
  KernelContext,
  KernelEntity,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";

export type RoutineSuggestion = {
  entity: KernelEntity;
  recordIds: string[];
  count: number;
};

const DEFAULT_MIN_OCCURRENCES = 3;

/** entityId -> record ids that reference it (within the given records). */
function entityRecordIndex(
  records: MoriRecord[],
  relations: KernelRelation[],
): Map<string, string[]> {
  const recordIds = new Set(records.map((record) => record.id));
  const index = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.type !== "references" || !relation.toEntityId) continue;
    if (!recordIds.has(relation.fromRecordId)) continue;
    const list = index.get(relation.toEntityId);
    if (list) {
      if (!list.includes(relation.fromRecordId)) list.push(relation.fromRecordId);
    } else {
      index.set(relation.toEntityId, [relation.fromRecordId]);
    }
  }
  return index;
}

/** Record ids that already belong to a routine context. */
function recordsInRoutine(relations: KernelRelation[], contexts: KernelContext[]): Set<string> {
  const routineCtxIds = new Set(
    contexts.filter((context) => context.type === "routine").map((context) => context.id),
  );
  const inRoutine = new Set<string>();
  for (const relation of relations) {
    if (relation.type === "belongs-to" && relation.toContextId && routineCtxIds.has(relation.toContextId)) {
      inRoutine.add(relation.fromRecordId);
    }
  }
  return inRoutine;
}

/** Entity ids that already have a routine (any of their records belongs to a
 *  routine context). Used to badge a tracker row and suppress its suggestion. */
export function routineEntityIds(
  records: MoriRecord[],
  relations: KernelRelation[],
  contexts: KernelContext[],
): Set<string> {
  const index = entityRecordIndex(records, relations);
  const inRoutine = recordsInRoutine(relations, contexts);
  const result = new Set<string>();
  for (const [entityId, recordIds] of index) {
    if (recordIds.some((id) => inRoutine.has(id))) result.add(entityId);
  }
  return result;
}

export function discoverRoutines(
  records: MoriRecord[],
  relations: KernelRelation[],
  entities: KernelEntity[],
  contexts: KernelContext[],
  options: { minOccurrences?: number } = {},
): RoutineSuggestion[] {
  const min = options.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const index = entityRecordIndex(records, relations);
  const inRoutine = recordsInRoutine(relations, contexts);
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));

  const suggestions: RoutineSuggestion[] = [];
  for (const [entityId, recordIds] of index) {
    if (recordIds.length < min) continue;
    // Already a routine: none of the recurrences should already belong to one.
    if (recordIds.some((id) => inRoutine.has(id))) continue;
    const entity = entitiesById.get(entityId);
    if (!entity) continue;
    suggestions.push({ entity, recordIds, count: recordIds.length });
  }

  return suggestions.sort((a, b) => b.count - a.count);
}
