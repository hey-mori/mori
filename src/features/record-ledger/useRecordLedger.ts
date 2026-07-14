/**
 * useRecordLedger · the React seam over the record kernel for the 오늘 and
 * 인박스 surfaces.
 *
 * Loads records + user schemas through `KernelRepository`, runs the capture
 * pipeline on new input, and persists the outcome (source first, then each
 * record with its revision and origin link) so the raw-input-retention and
 * visible-and-reversible invariants hold at the write boundary. Status
 * changes (confirm a candidate, revert a provisional) go through
 * `applyRecordPatch` so every transition is an audited revision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  renameEntity as buildEntityRename,
  runCapturePipeline,
  type CaptureInput,
  type CaptureOutcome,
} from "../../lib/capture";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { applyRecordPatch } from "../../lib/record-kernel/recordFactory";
import { createSchemaRegistry, type SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import type {
  KernelEntity,
  KernelRelation,
  KernelRule,
  MoriRecord,
  RecordStatus,
  SchemaDefinition,
} from "../../lib/record-kernel/kernelTypes";

export type RecordLedger = {
  records: MoriRecord[];
  registry: SchemaRegistry;
  entities: KernelEntity[];
  relations: KernelRelation[];
  loading: boolean;
  reload: () => Promise<void>;
  capture: (input: CaptureInput) => Promise<CaptureOutcome>;
  setStatus: (record: MoriRecord, status: RecordStatus) => Promise<void>;
  /** Renames an entity by id (ID-stable) and teaches Mori the old name as an
   *  alias, so every record referencing it reads the new name. */
  renameEntity: (entityId: string, newName: string) => Promise<void>;
};

export function useRecordLedger(): RecordLedger {
  const [records, setRecords] = useState<MoriRecord[]>([]);
  const [userSchemas, setUserSchemas] = useState<SchemaDefinition[]>([]);
  const [rules, setRules] = useState<KernelRule[]>([]);
  const [entities, setEntities] = useState<KernelEntity[]>([]);
  const [relations, setRelations] = useState<KernelRelation[]>([]);
  const [loading, setLoading] = useState(true);

  const registry = useMemo(() => {
    try {
      return createSchemaRegistry(userSchemas);
    } catch {
      // A corrupt persisted user schema must not brick the ledger; fall back
      // to the system registry and surface the schema issue elsewhere.
      return createSchemaRegistry();
    }
  }, [userSchemas]);

  const reload = useCallback(async () => {
    const repo = getKernelRepository();
    const [recordsResult, schemasResult, rulesResult, entitiesResult, relationsResult] =
      await Promise.all([
        repo.listRecords(),
        repo.listUserSchemas(),
        repo.listRules(),
        repo.listEntities(),
        repo.listRelations(),
      ]);
    setUserSchemas(schemasResult.data);
    setRules(rulesResult.data);
    setEntities(entitiesResult.data);
    setRelations(relationsResult.data);
    setRecords(recordsResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const capture = useCallback(
    async (input: CaptureInput) => {
      const repo = getKernelRepository();
      // The pipeline honours the user's saved personalization rules (classify,
      // context-binding, automation level). Rule creation arrives with the
      // entity / rename surface; captures already respect any stored rules.
      const outcome = runCapturePipeline(input, registry, { rules, entities });
      // Source first: the raw trace is preserved before any interpretation,
      // so a later failure never loses what the user typed.
      await repo.saveSource(outcome.source);
      for (const entity of outcome.newEntities) await repo.saveEntity(entity);
      for (const item of outcome.records) {
        await repo.saveRecord(item.created.record, item.created.revision);
        await repo.saveSourceLink(item.sourceLink);
        for (const relation of item.relations) await repo.saveRelation(relation);
      }
      await reload();
      return outcome;
    },
    [registry, rules, entities, reload],
  );

  const renameEntity = useCallback(
    async (entityId: string, newName: string) => {
      const entity = entities.find((candidate) => candidate.id === entityId);
      if (!entity || newName.trim().length === 0 || newName.trim() === entity.canonicalName) return;
      const repo = getKernelRepository();
      const { entity: renamed, aliasRule } = buildEntityRename(entity, newName);
      await repo.saveEntity(renamed);
      await repo.saveRule(aliasRule);
      await reload();
    },
    [entities, reload],
  );

  const setStatus = useCallback(
    async (record: MoriRecord, status: RecordStatus) => {
      if (record.status === status) return;
      const repo = getKernelRepository();
      const { record: next, revision } = applyRecordPatch(record, { status }, "user", registry);
      await repo.saveRecord(next, revision);
      await reload();
    },
    [registry, reload],
  );

  return {
    records,
    registry,
    entities,
    relations,
    loading,
    reload,
    capture,
    setStatus,
    renameEntity,
  };
}
