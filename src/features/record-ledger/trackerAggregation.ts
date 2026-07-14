/**
 * Tracker aggregation · rolls the ledger up by schema and entity so a
 * repeated activity reads as a total, not a list (운동 5회 · 58분, 러닝 3회
 * · 45분). Pure derivation over records + relations + entities.
 *
 * Entity rows resolve each relation's target to its CURRENT canonical name,
 * so a rename (달리기 → 러닝) reflects in the totals immediately. A schema's
 * total can exceed the sum of its entity rows: records captured before entity
 * resolution have no relation, so they count toward the total honestly
 * without a per-entity attribution.
 */
import type {
  KernelEntity,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";

export type TrackerEntityRow = {
  entity: KernelEntity;
  count: number;
  totalMetric: number;
};

export type TrackerGroup = {
  schemaId: string;
  name: string;
  recordCount: number;
  /** Sum of the schema's first metric property across records, when any. */
  totalMetric: number;
  metricUnit?: string;
  hasMetric: boolean;
  entities: TrackerEntityRow[];
};

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function aggregateTrackers(
  records: MoriRecord[],
  relations: KernelRelation[],
  entities: KernelEntity[],
  registry: SchemaRegistry,
): TrackerGroup[] {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const entityIdsByRecord = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.type !== "references" || !relation.toEntityId) continue;
    const list = entityIdsByRecord.get(relation.fromRecordId);
    if (list) list.push(relation.toEntityId);
    else entityIdsByRecord.set(relation.fromRecordId, [relation.toEntityId]);
  }

  const bySchema = new Map<string, MoriRecord[]>();
  for (const record of records) {
    const list = bySchema.get(record.schemaId);
    if (list) list.push(record);
    else bySchema.set(record.schemaId, [record]);
  }

  const groups: TrackerGroup[] = [];
  for (const [schemaId, schemaRecords] of bySchema) {
    const schema = registry.get(schemaId);
    const metricProp = schema?.properties.find((property) => property.metric);
    const hasMetric = Boolean(metricProp);

    let totalMetric = 0;
    const entityAgg = new Map<string, TrackerEntityRow>();
    for (const record of schemaRecords) {
      const metric = metricProp ? numericValue(record.properties[metricProp.key]) : 0;
      totalMetric += metric;
      for (const entityId of entityIdsByRecord.get(record.id) ?? []) {
        const entity = entitiesById.get(entityId);
        if (!entity) continue;
        const row = entityAgg.get(entityId);
        if (row) {
          row.count += 1;
          row.totalMetric += metric;
        } else {
          entityAgg.set(entityId, { entity, count: 1, totalMetric: metric });
        }
      }
    }

    groups.push({
      schemaId,
      name: schema?.name ?? schemaId,
      recordCount: schemaRecords.length,
      totalMetric,
      metricUnit: metricProp?.unit,
      hasMetric,
      entities: [...entityAgg.values()].sort((a, b) => b.count - a.count),
    });
  }

  return groups.sort((a, b) => b.recordCount - a.recordCount);
}
