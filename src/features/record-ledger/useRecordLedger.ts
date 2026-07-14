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
  agentSessionToProposals,
  renameEntity as buildEntityRename,
  runCapturePipeline,
  type AgentSessionInput,
  type CaptureInput,
  type CaptureOutcome,
} from "../../lib/capture";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { applyRecordPatch, createKernelId } from "../../lib/record-kernel/recordFactory";
import { createSchemaRegistry, type SchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import type {
  KernelContext,
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
  contexts: KernelContext[];
  loading: boolean;
  reload: () => Promise<void>;
  capture: (input: CaptureInput) => Promise<CaptureOutcome>;
  /** Converts an agent work session into ledger records. */
  captureAgentSession: (input: AgentSessionInput) => Promise<CaptureOutcome>;
  setStatus: (record: MoriRecord, status: RecordStatus) => Promise<void>;
  /** Renames an entity by id (ID-stable) and teaches Mori the old name as an
   *  alias, so every record referencing it reads the new name. */
  renameEntity: (entityId: string, newName: string) => Promise<void>;
  /** Creates a routine context and relates the given records to it. */
  createRoutine: (name: string, recordIds: string[]) => Promise<void>;
};

export function useRecordLedger(): RecordLedger {
  const [records, setRecords] = useState<MoriRecord[]>([]);
  const [userSchemas, setUserSchemas] = useState<SchemaDefinition[]>([]);
  const [rules, setRules] = useState<KernelRule[]>([]);
  const [entities, setEntities] = useState<KernelEntity[]>([]);
  const [relations, setRelations] = useState<KernelRelation[]>([]);
  const [contexts, setContexts] = useState<KernelContext[]>([]);
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
    const [recordsResult, schemasResult, rulesResult, entitiesResult, relationsResult, contextsResult] =
      await Promise.all([
        repo.listRecords(),
        repo.listUserSchemas(),
        repo.listRules(),
        repo.listEntities(),
        repo.listRelations(),
        repo.listContexts(),
      ]);
    setUserSchemas(schemasResult.data);
    setRules(rulesResult.data);
    setEntities(entitiesResult.data);
    setRelations(relationsResult.data);
    setContexts(contextsResult.data);
    setRecords(recordsResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persistOutcome = useCallback(async (outcome: CaptureOutcome) => {
    const repo = getKernelRepository();
    // Source first: the raw trace is preserved before any interpretation,
    // so a later failure never loses what was captured.
    await repo.saveSource(outcome.source);
    for (const entity of outcome.newEntities) await repo.saveEntity(entity);
    for (const item of outcome.records) {
      await repo.saveRecord(item.created.record, item.created.revision);
      await repo.saveSourceLink(item.sourceLink);
      for (const relation of item.relations) await repo.saveRelation(relation);
    }
    await reload();
  }, [reload]);

  const capture = useCallback(
    async (input: CaptureInput) => {
      // The pipeline honours the user's saved personalization rules (classify,
      // context-binding, automation level). Rule creation arrives with the
      // entity / rename surface; captures already respect any stored rules.
      const outcome = runCapturePipeline(input, registry, { rules, entities });
      await persistOutcome(outcome);
      return outcome;
    },
    [registry, rules, entities, persistOutcome],
  );

  const captureAgentSession = useCallback(
    async (input: AgentSessionInput) => {
      // Convert the session to record proposals and run them through the same
      // pipeline (source preservation, entity resolution, apply policy) with a
      // fixed agent-session source rather than the text proposer.
      const outcome = runCapturePipeline(
        { kind: "agent-session", content: input.summary ?? input.title, locator: input.sessionId },
        registry,
        { rules, entities, propose: () => agentSessionToProposals(input) },
      );
      await persistOutcome(outcome);
      return outcome;
    },
    [registry, rules, entities, persistOutcome],
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

  const createRoutine = useCallback(
    async (name: string, recordIds: string[]) => {
      if (name.trim().length === 0 || recordIds.length === 0) return;
      const repo = getKernelRepository();
      const context: KernelContext = {
        id: createKernelId("ctx"),
        type: "routine",
        name: name.trim(),
        createdAt: new Date().toISOString(),
      };
      await repo.saveContext(context);
      for (const recordId of recordIds) {
        await repo.saveRelation({
          id: createKernelId("rel"),
          fromRecordId: recordId,
          type: "belongs-to",
          toContextId: context.id,
          createdAt: context.createdAt,
        });
      }
      await reload();
    },
    [reload],
  );

  return {
    records,
    registry,
    entities,
    relations,
    contexts,
    loading,
    reload,
    capture,
    captureAgentSession,
    setStatus,
    renameEntity,
    createRoutine,
  };
}
