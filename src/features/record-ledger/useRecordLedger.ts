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
  buildLateNightRule,
  hasLateNightRule,
  proposeFromForm,
  renameEntity as buildEntityRename,
  runCapturePipeline,
  type AgentSessionInput,
  type CaptureInput,
  type CaptureOutcome,
  type FormEntry,
  type RecordProposal,
} from "../../lib/capture";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import {
  applyRecordPatch,
  createKernelId,
  createRecord,
  type RecordPatch,
} from "../../lib/record-kernel/recordFactory";
import { deriveNoteTitle } from "./noteWorkspace";
import { projectContextId, projectToContext } from "../../lib/record-kernel/projectContextConverter";
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
import type { CaptureRecordOutcome } from "../../lib/capture";

/** A staged user correction to one reviewed candidate (view-level; becomes a
 *  `RecordPatch` + user revision at commit). */
export type CaptureCandidateEdit = {
  schemaId?: string;
  title?: string;
  /** `null` clears the date (날짜 없이); a string sets a user-provided date. */
  occurredStart?: string | null;
  contextIds?: string[];
};

export type CaptureCommitOptions = {
  edits?: Record<string, CaptureCandidateEdit>;
  excludeRecordIds?: string[];
  /** Persist the source only, no records (원문만 저장). */
  sourceOnly?: boolean;
};

export type CaptureCommitResult = {
  savedRecordIds: string[];
};

export type RecordLedger = {
  records: MoriRecord[];
  registry: SchemaRegistry;
  entities: KernelEntity[];
  relations: KernelRelation[];
  contexts: KernelContext[];
  /** The user's personalization rules (so surfaces can tell whether a learned
   *  rule already exists, e.g. the late-night date rule). */
  rules: KernelRule[];
  loading: boolean;
  reload: () => Promise<void>;
  capture: (input: CaptureInput) => Promise<CaptureOutcome>;
  /** Phase 1 of the review flow: run the pipeline and persist the raw source
   *  immediately (원문 보관), returning the outcome for review. Nothing else
   *  is written until `commitCapture`. */
  proposeCapture: (input: CaptureInput) => Promise<CaptureOutcome>;
  /** Same phase-1 entry for a schema quick form (형식 입력). */
  proposeFormCapture: (entry: FormEntry) => Promise<CaptureOutcome>;
  /** Phase 2: persist the reviewed outcome. Edits become user revisions on
   *  top of the AI create revision; excluded candidates (and entities only
   *  they referenced) are skipped; confirm-kept records save as active
   *  because the review was the confirmation. */
  commitCapture: (
    outcome: CaptureOutcome,
    options?: CaptureCommitOptions,
  ) => Promise<CaptureCommitResult>;
  /** Post-save undo: discards the given records with a user revision each. */
  discardRecords: (recordIds: string[]) => Promise<void>;
  /** Converts an agent work session into ledger records. */
  captureAgentSession: (input: AgentSessionInput) => Promise<CaptureOutcome>;
  setStatus: (record: MoriRecord, status: RecordStatus) => Promise<void>;
  /** Resolves a date-undecided record: a date pins it (`user-provided`);
   *  null acknowledges it stays dateless (`capture-fallback`). Either way it
   *  leaves the 확인할 것 strip. */
  setActivityDate: (record: MoriRecord, date: string | null) => Promise<void>;
  /** Applies a user edit (title, body, type, context, ...) as an audited
   *  revision on top of the record's history. */
  updateRecord: (record: MoriRecord, patch: RecordPatch) => Promise<void>;
  /** Note-first (v4): create a `note` record from the just-written text. The
   *  note is the user-owned artifact; its title is the first line. Returns the
   *  created record so the editor can keep editing it. */
  createNote: (body: string) => Promise<MoriRecord | null>;
  /** Confirms a live extraction (a typed record Mori pulled out of a note) into
   *  a durable record linked back to the note with a `derived-from` relation. */
  confirmExtraction: (note: MoriRecord, proposal: RecordProposal) => Promise<MoriRecord>;
  /** Renames an entity by id (ID-stable) and teaches Mori the old name as an
   *  alias, so every record referencing it reads the new name. */
  renameEntity: (entityId: string, newName: string) => Promise<void>;
  /** Creates a routine context and relates the given records to it. */
  createRoutine: (name: string, recordIds: string[]) => Promise<void>;
  /** Makes the late-night → previous-day date correction durable as a rule;
   *  future small-hours captures are then placed automatically. */
  createDateInferenceRule: () => Promise<void>;
};

/** Turns one candidate's staged edit into a `RecordPatch`, or null when
 *  nothing changes. Retyping filters properties to what the new schema
 *  defines; a date edit is `user-provided` (or `unknown` when cleared); a
 *  kept confirm-candidate becomes active because the review confirmed it.
 *  Exported for tests; the hook is its only runtime caller. */
export function buildCommitPatch(
  item: CaptureRecordOutcome,
  edit: CaptureCandidateEdit | undefined,
  registry: SchemaRegistry,
): RecordPatch | null {
  const patch: RecordPatch = {};
  const record = item.created.record;

  if (edit?.schemaId && edit.schemaId !== record.schemaId) {
    const schema = registry.get(edit.schemaId);
    if (schema) {
      patch.schemaId = edit.schemaId;
      const allowed = new Set(schema.properties.map((property) => property.key));
      const filtered: MoriRecord["properties"] = {};
      for (const [key, value] of Object.entries(record.properties)) {
        if (allowed.has(key)) filtered[key] = value;
      }
      patch.properties = filtered;
    }
  }
  if (edit?.title !== undefined && edit.title.trim().length > 0 && edit.title.trim() !== record.title) {
    patch.title = edit.title.trim();
  }
  if (edit?.occurredStart !== undefined) {
    if (edit.occurredStart === null) {
      if (record.occurredStart !== undefined) {
        patch.occurredStart = undefined;
        patch.timeBasis = "unknown";
        patch.timeConfidence = undefined;
      }
    } else if (edit.occurredStart !== record.occurredStart || record.timeBasis !== "user-provided") {
      patch.occurredStart = edit.occurredStart;
      patch.timeBasis = "user-provided";
      patch.timeConfidence = undefined;
    }
  }
  if (edit?.contextIds !== undefined) {
    patch.contextIds = edit.contextIds;
  }
  if (item.decision === "confirm" && record.status === "candidate") {
    patch.status = "active";
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

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

  const createNote = useCallback(
    async (body: string): Promise<MoriRecord | null> => {
      // NFC guards typed Korean at every write boundary (WKWebView delivers NFD).
      const text = body.normalize("NFC");
      if (text.trim().length === 0) return null;
      const repo = getKernelRepository();
      const { record, revision } = createRecord(
        {
          schemaId: "note",
          title: deriveNoteTitle(text) || "새 기록",
          body: text,
          origin: "user",
          // A note's time is when it was written: capture-fallback is a decided
          // state, so a fresh note lands on today's day group, not in 확인할 것.
          timeBasis: "capture-fallback",
        },
        registry,
      );
      await repo.saveRecord(record, revision);
      await reload();
      return record;
    },
    [registry, reload],
  );

  const confirmExtraction = useCallback(
    async (note: MoriRecord, proposal: RecordProposal): Promise<MoriRecord> => {
      const repo = getKernelRepository();
      // The extraction is Mori's derivation (origin derived), but the user
      // confirmed it, so it lands active. It inherits the note's context and is
      // linked back to the note with a derived-from relation.
      const { record, revision } = createRecord(
        {
          schemaId: proposal.schemaId,
          title: proposal.title,
          body: proposal.body,
          occurredStart: proposal.occurredStart,
          timeBasis: proposal.timeBasis,
          timeConfidence: proposal.timeConfidence,
          origin: "derived",
          status: "active",
          contextIds: note.contextIds,
          properties: proposal.properties,
        },
        registry,
      );
      await repo.saveRecord(record, revision);
      await repo.saveRelation({
        id: createKernelId("rel"),
        fromRecordId: record.id,
        type: "derived-from",
        toRecordId: note.id,
        createdAt: new Date().toISOString(),
      });
      await reload();
      return record;
    },
    [registry, reload],
  );

  const proposeWith = useCallback(
    async (input: CaptureInput, proposals?: RecordProposal[]) => {
      const repo = getKernelRepository();
      let outcome: CaptureOutcome;
      try {
        outcome = runCapturePipeline(input, registry, {
          rules,
          entities,
          ...(proposals ? { propose: () => proposals } : {}),
        });
      } catch (error) {
        // Understanding failed: the raw text is preserved anyway (approved
        // 5.1), so the composer's failed state can honestly say 원문은 보관됨.
        await repo.saveSource({
          id: createKernelId("src"),
          kind: input.kind,
          locator: input.locator ?? input.url,
          rawBody: input.content,
          capturedAt: new Date().toISOString(),
          retention: "retained",
        });
        throw error;
      }
      // 원문 먼저, 해석은 검토 뒤: the source persists at 정리 time, records
      // wait for commitCapture. A dropped review loses nothing.
      await repo.saveSource(outcome.source);
      return outcome;
    },
    [registry, rules, entities],
  );

  const proposeCapture = useCallback(
    (input: CaptureInput) => proposeWith(input),
    [proposeWith],
  );

  const proposeFormCapture = useCallback(
    (entry: FormEntry) => {
      const proposal = proposeFromForm(entry);
      return proposeWith({ kind: "text", content: proposal.body }, [proposal]);
    },
    [proposeWith],
  );

  const commitCapture = useCallback(
    async (outcome: CaptureOutcome, options: CaptureCommitOptions = {}) => {
      const repo = getKernelRepository();
      // The source was persisted by proposeCapture; this writes records only.
      if (options.sourceOnly) {
        await reload();
        return { savedRecordIds: [] };
      }
      const excluded = new Set(options.excludeRecordIds ?? []);
      const kept = outcome.records.filter((item) => !excluded.has(item.created.record.id));
      // Entities referenced only by excluded candidates are not created.
      const keptEntityIds = new Set(
        kept.flatMap((item) => item.relations.map((relation) => relation.toEntityId)),
      );
      for (const entity of outcome.newEntities) {
        if (keptEntityIds.has(entity.id)) await repo.saveEntity(entity);
      }

      const savedRecordIds: string[] = [];
      for (const item of kept) {
        // AI interpretation first (create revision), then the user's staged
        // edits as a distinct user revision, so the trail shows both acts.
        await repo.saveRecord(item.created.record, item.created.revision);
        const patch = buildCommitPatch(item, options.edits?.[item.created.record.id], registry);
        let finalRecord = item.created.record;
        if (patch) {
          const updated = applyRecordPatch(item.created.record, patch, "user", registry);
          await repo.saveRecord(updated.record, updated.revision);
          finalRecord = updated.record;
        }
        await repo.saveSourceLink(item.sourceLink);
        for (const relation of item.relations) await repo.saveRelation(relation);
        savedRecordIds.push(finalRecord.id);
      }
      await reload();
      return { savedRecordIds };
    },
    [registry, reload],
  );

  const discardRecords = useCallback(
    async (recordIds: string[]) => {
      const repo = getKernelRepository();
      const current = await repo.listRecords();
      for (const id of recordIds) {
        const record = current.data.find((candidate) => candidate.id === id);
        if (!record || record.status === "discarded") continue;
        const { record: next, revision } = applyRecordPatch(
          record,
          { status: "discarded" },
          "user",
          registry,
        );
        await repo.saveRecord(next, revision);
      }
      await reload();
    },
    [registry, reload],
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
      // Attach the session's records to their project context so a project
      // reads as its records, not just its AI sessions.
      if (input.projectKey) {
        const repo = getKernelRepository();
        const contextId = projectContextId(input.projectKey);
        if (!contexts.some((context) => context.id === contextId)) {
          await repo.saveContext(
            projectToContext({ id: input.projectKey, name: input.projectName ?? input.projectKey }),
          );
        }
        for (const item of outcome.records) {
          await repo.saveRelation({
            id: createKernelId("rel"),
            fromRecordId: item.created.record.id,
            type: "belongs-to",
            toContextId: contextId,
            createdAt: item.created.record.createdAt,
          });
        }
        await reload();
      }
      return outcome;
    },
    [registry, rules, entities, contexts, persistOutcome, reload],
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

  const setActivityDate = useCallback(
    async (record: MoriRecord, date: string | null) => {
      const repo = getKernelRepository();
      // A chosen date is user-provided (no inference confidence); "keep none"
      // moves the basis off `unknown` to `capture-fallback` so the record is
      // acknowledged as dateless (out of the strip) without inventing a day.
      const patch = date
        ? { occurredStart: date, timeBasis: "user-provided" as const, timeConfidence: undefined }
        : { timeBasis: "capture-fallback" as const };
      const { record: next, revision } = applyRecordPatch(record, patch, "user", registry);
      await repo.saveRecord(next, revision);
      await reload();
    },
    [registry, reload],
  );

  const updateRecord = useCallback(
    async (record: MoriRecord, patch: RecordPatch) => {
      const repo = getKernelRepository();
      const { record: next, revision } = applyRecordPatch(record, patch, "user", registry);
      await repo.saveRecord(next, revision);
      await reload();
    },
    [registry, reload],
  );

  const createDateInferenceRule = useCallback(async () => {
    if (hasLateNightRule(rules)) return;
    const repo = getKernelRepository();
    await repo.saveRule(buildLateNightRule(new Date().toISOString()));
    await reload();
  }, [rules, reload]);

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
    rules,
    loading,
    reload,
    capture,
    proposeCapture,
    proposeFormCapture,
    commitCapture,
    discardRecords,
    captureAgentSession,
    setStatus,
    setActivityDate,
    updateRecord,
    createNote,
    confirmExtraction,
    renameEntity,
    createRoutine,
    createDateInferenceRule,
  };
}
