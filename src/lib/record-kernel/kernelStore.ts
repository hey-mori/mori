/**
 * Kernel store · browser persistence for kernel objects.
 *
 * Follows the house storage conventions: `mori.kernel.*` key prefixes over a
 * `KeyValueStorage`, one entry per object, schema-versioned envelopes, and
 * unknown envelope versions loading as null instead of corrupting consumers.
 *
 * This is the browser adapter. The desktop SQLite kernel tables (with FTS)
 * are the next K1 slice; a runtime-aware repository will route between the
 * two exactly like `AcceptedMemoryRepository` does today. Nothing above the
 * store may depend on which adapter is active.
 */
import type { KeyValueStorage } from "../storage/storageTypes";
import {
  isQuotaExceededError,
  notifyQuotaFailure,
  StorageQuotaError,
} from "../storage/storageQuota";
import type {
  EntityAlias,
  KernelContext,
  KernelDerivation,
  KernelEntity,
  KernelRelation,
  KernelRevision,
  KernelRule,
  KernelSource,
  MoriRecord,
  SchemaDefinition,
  SourceLink,
} from "./kernelTypes";

const KERNEL_ENVELOPE_VERSION = 1 as const;

type Envelope<T> = {
  envelopeVersion: typeof KERNEL_ENVELOPE_VERSION;
  savedAt: string;
  data: T;
};

const PREFIX = {
  record: "mori.kernel.record.",
  context: "mori.kernel.context.",
  entity: "mori.kernel.entity.",
  entityAliases: "mori.kernel.entityAliases.",
  relation: "mori.kernel.relation.",
  source: "mori.kernel.source.",
  sourceLink: "mori.kernel.sourceLink.",
  revision: "mori.kernel.revision.",
  rule: "mori.kernel.rule.",
  userSchema: "mori.kernel.userSchema.",
  reading: "mori.kernel.reading.",
} as const;

export class KernelBrowserStore {
  constructor(private readonly storage: KeyValueStorage = window.localStorage) {}

  saveRecord(record: MoriRecord): void {
    this.write(`${PREFIX.record}${record.id}`, record);
  }

  getRecord(id: string): MoriRecord | null {
    return this.read<MoriRecord>(`${PREFIX.record}${id}`);
  }

  listRecords(): MoriRecord[] {
    return this.list<MoriRecord>(PREFIX.record);
  }

  deleteRecord(id: string): void {
    this.storage.removeItem(`${PREFIX.record}${id}`);
  }

  saveContext(context: KernelContext): void {
    this.write(`${PREFIX.context}${context.id}`, context);
  }

  getContext(id: string): KernelContext | null {
    return this.read<KernelContext>(`${PREFIX.context}${id}`);
  }

  listContexts(): KernelContext[] {
    return this.list<KernelContext>(PREFIX.context);
  }

  saveEntity(entity: KernelEntity): void {
    this.write(`${PREFIX.entity}${entity.id}`, entity);
  }

  listEntities(): KernelEntity[] {
    return this.list<KernelEntity>(PREFIX.entity);
  }

  saveEntityAliases(entityId: string, aliases: EntityAlias[]): void {
    this.write(`${PREFIX.entityAliases}${entityId}`, aliases);
  }

  listEntityAliases(entityId: string): EntityAlias[] {
    return this.read<EntityAlias[]>(`${PREFIX.entityAliases}${entityId}`) ?? [];
  }

  saveRelation(relation: KernelRelation): void {
    this.write(`${PREFIX.relation}${relation.id}`, relation);
  }

  listRelations(): KernelRelation[] {
    return this.list<KernelRelation>(PREFIX.relation);
  }

  /** A record's reading (기록 v7), keyed BY RECORD so a note has exactly one and
   *  a re-read overwrites rather than accumulating. A reading is derived, never
   *  authored: losing it costs a re-read, never the user's words. */
  saveReading(recordId: string, reading: unknown): void {
    this.write(`${PREFIX.reading}${recordId}`, reading);
  }

  readReading<T>(recordId: string): T | null {
    return this.read<T>(`${PREFIX.reading}${recordId}`);
  }

  saveSource(source: KernelSource): void {
    this.write(`${PREFIX.source}${source.id}`, source);
  }

  getSource(id: string): KernelSource | null {
    return this.read<KernelSource>(`${PREFIX.source}${id}`);
  }

  listSources(): KernelSource[] {
    return this.list<KernelSource>(PREFIX.source);
  }

  saveSourceLink(link: SourceLink): void {
    this.write(`${PREFIX.sourceLink}${link.sourceId}.${link.recordId}.${link.role}`, link);
  }

  listSourceLinksForRecord(recordId: string): SourceLink[] {
    return this.list<SourceLink>(PREFIX.sourceLink).filter((link) => link.recordId === recordId);
  }

  saveDerivation(derivation: KernelDerivation): void {
    this.write(`${PREFIX.revision}derivation.${derivation.id}`, derivation);
  }

  appendRevision(revision: KernelRevision): void {
    this.write(`${PREFIX.revision}${revision.recordId}.${revision.id}`, revision);
  }

  /** Best-effort removal of one revision. Exists so the repository can roll
   *  back a revision-first save when the record write itself fails; never
   *  throws (removeItem is not quota-bound). */
  removeRevision(revision: Pick<KernelRevision, "recordId" | "id">): void {
    this.storage.removeItem(`${PREFIX.revision}${revision.recordId}.${revision.id}`);
  }

  listRevisions(recordId: string): KernelRevision[] {
    return this.list<KernelRevision>(`${PREFIX.revision}${recordId}.`).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  saveRule(rule: KernelRule): void {
    this.write(`${PREFIX.rule}${rule.id}`, rule);
  }

  listRules(): KernelRule[] {
    return this.list<KernelRule>(PREFIX.rule);
  }

  saveUserSchema(schema: SchemaDefinition): void {
    this.write(`${PREFIX.userSchema}${schema.id}`, schema);
  }

  listUserSchemas(): SchemaDefinition[] {
    return this.list<SchemaDefinition>(PREFIX.userSchema);
  }

  private write<T>(key: string, data: T): void {
    const envelope: Envelope<T> = {
      envelopeVersion: KERNEL_ENVELOPE_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };
    try {
      this.storage.setItem(key, JSON.stringify(envelope));
    } catch (error) {
      if (isQuotaExceededError(error)) {
        // Same contract as the draft repository: notify the app-level health
        // observer first, then rethrow typed. A failed kernel save must never
        // look like a successful one.
        notifyQuotaFailure({ key, at: new Date().toISOString() });
        throw new StorageQuotaError(key, { cause: error });
      }
      throw error;
    }
  }

  private read<T>(key: string): T | null {
    const raw = this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Envelope<T>;
      if (parsed.envelopeVersion !== KERNEL_ENVELOPE_VERSION) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  private list<T>(prefix: string): T[] {
    const items: T[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const item = this.read<T>(key);
      if (item !== null) items.push(item);
    }
    return items;
  }
}
