/**
 * Runtime-aware kernel repository.
 *
 * Routes kernel reads and writes to the right backend so nothing above it
 * branches on runtime:
 *
 *   - **Browser mode** — `KernelBrowserStore` (localStorage).
 *   - **Tauri desktop mode** — the `kernel_*` SQLite tables behind the
 *     `*_kernel_*` Tauri commands (with FTS search).
 *
 * Desktop mode prefers SQLite; when a SQLite call fails the operation falls
 * back to localStorage and reports `fellBack: true` with a reason, never
 * silently claiming SQLite succeeded (same contract as
 * `AcceptedMemoryRepository`). Search has no browser FTS: the browser path
 * is a plain includes() filter, honestly weaker, replaced when a browser
 * search need actually appears.
 */
import { isTauriRuntime, tauriCommands } from "../desktop";
import {
  fromSqliteKernelObjectRow,
  fromSqliteKernelRecordRow,
  fromSqliteKernelRevisionRow,
  toSqliteKernelObjectRow,
  toSqliteKernelRecordRow,
  toSqliteKernelRevisionRow,
  type KernelObjectCollection,
} from "../sqlite/kernelRows";
import { KernelBrowserStore } from "./kernelStore";
import type {
  KernelContext,
  KernelEntity,
  KernelRelation,
  KernelRevision,
  KernelRule,
  KernelSource,
  MoriRecord,
  SchemaDefinition,
  SourceLink,
} from "./kernelTypes";

export type KernelRuntime = "browser" | "desktop";
export type KernelStorageSource = "browser-local-storage" | "desktop-sqlite";

export type KernelResult<T> = {
  data: T;
  source: KernelStorageSource;
  fellBack: boolean;
  fallbackReason?: string;
};

export type KernelDesktopCommands = {
  saveKernelRecordRows: typeof tauriCommands.saveKernelRecordRows;
  listKernelRecordRows: typeof tauriCommands.listKernelRecordRows;
  getKernelRecordRow: typeof tauriCommands.getKernelRecordRow;
  deleteKernelRecordRow: typeof tauriCommands.deleteKernelRecordRow;
  searchKernelRecordRows: typeof tauriCommands.searchKernelRecordRows;
  saveKernelObjectRows: typeof tauriCommands.saveKernelObjectRows;
  listKernelObjectRows: typeof tauriCommands.listKernelObjectRows;
  appendKernelRevisionRows: typeof tauriCommands.appendKernelRevisionRows;
  listKernelRevisionRows: typeof tauriCommands.listKernelRevisionRows;
};

export type KernelRepositoryOptions = {
  /** Defaults to `desktop` inside Tauri, `browser` otherwise. */
  runtime?: KernelRuntime;
  /** Browser store (browser path + desktop fallback). */
  store?: KernelBrowserStore;
  /** SQLite command bridge (desktop path). */
  commands?: KernelDesktopCommands;
};

export class KernelRepository {
  readonly runtime: KernelRuntime;
  private readonly storeOverride: KernelBrowserStore | null;
  private lazyStore: KernelBrowserStore | null = null;
  private readonly commands: KernelDesktopCommands;

  constructor(options: KernelRepositoryOptions = {}) {
    this.runtime = options.runtime ?? (isTauriRuntime() ? "desktop" : "browser");
    this.storeOverride = options.store ?? null;
    this.commands = options.commands ?? {
      saveKernelRecordRows: tauriCommands.saveKernelRecordRows,
      listKernelRecordRows: tauriCommands.listKernelRecordRows,
      getKernelRecordRow: tauriCommands.getKernelRecordRow,
      deleteKernelRecordRow: tauriCommands.deleteKernelRecordRow,
      searchKernelRecordRows: tauriCommands.searchKernelRecordRows,
      saveKernelObjectRows: tauriCommands.saveKernelObjectRows,
      listKernelObjectRows: tauriCommands.listKernelObjectRows,
      appendKernelRevisionRows: tauriCommands.appendKernelRevisionRows,
      listKernelRevisionRows: tauriCommands.listKernelRevisionRows,
    };
  }

  isDesktop(): boolean {
    return this.runtime === "desktop";
  }

  private store(): KernelBrowserStore {
    if (this.storeOverride) return this.storeOverride;
    if (!this.lazyStore) this.lazyStore = new KernelBrowserStore();
    return this.lazyStore;
  }

  /** Persists a record together with its revision, both backends. The pair
   *  is intentionally one call: a write without its revision would violate
   *  the visible-and-reversible invariant. */
  async saveRecord(record: MoriRecord, revision: KernelRevision): Promise<KernelResult<MoriRecord>> {
    if (!this.isDesktop()) {
      this.saveRecordPairToStore(record, revision);
      return browserResult(record);
    }
    try {
      await this.commands.saveKernelRecordRows([toSqliteKernelRecordRow(record)]);
      await this.commands.appendKernelRevisionRows([toSqliteKernelRevisionRow(revision)]);
      return desktopResult(record);
    } catch (error) {
      this.saveRecordPairToStore(record, revision);
      return fallbackResult(record, error);
    }
  }

  /** Browser-store record+revision write, atomic from the caller's view.
   *  Revision-first so a quota failure cannot persist a record without its
   *  audit trail; if the record write itself fails, the just-written
   *  revision is removed best-effort and the error propagates. */
  private saveRecordPairToStore(record: MoriRecord, revision: KernelRevision): void {
    const store = this.store();
    store.appendRevision(revision);
    try {
      store.saveRecord(record);
    } catch (error) {
      store.removeRevision(revision);
      throw error;
    }
  }

  async listRecords(): Promise<KernelResult<MoriRecord[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.store().listRecords());
    }
    try {
      const rows = await this.commands.listKernelRecordRows();
      return desktopResult(rows.map(fromSqliteKernelRecordRow));
    } catch (error) {
      return fallbackResult(this.store().listRecords(), error);
    }
  }

  async getRecord(id: string): Promise<KernelResult<MoriRecord | null>> {
    if (!this.isDesktop()) {
      return browserResult(this.store().getRecord(id));
    }
    try {
      const row = await this.commands.getKernelRecordRow(id);
      return desktopResult(row ? fromSqliteKernelRecordRow(row) : null);
    } catch (error) {
      return fallbackResult(this.store().getRecord(id), error);
    }
  }

  async deleteRecord(id: string): Promise<KernelResult<boolean>> {
    if (!this.isDesktop()) {
      this.store().deleteRecord(id);
      return browserResult(true);
    }
    try {
      const deleted = await this.commands.deleteKernelRecordRow(id);
      return desktopResult(deleted > 0);
    } catch (error) {
      this.store().deleteRecord(id);
      return fallbackResult(true, error);
    }
  }

  /** FTS on desktop; a plain text filter in the browser (honestly weaker). */
  async searchRecords(query: string, limit = 50): Promise<KernelResult<MoriRecord[]>> {
    const text = query.trim();
    if (text.length === 0) return this.isDesktop() ? desktopResult([]) : browserResult([]);
    if (!this.isDesktop()) {
      return browserResult(browserTextSearch(this.store().listRecords(), text, limit));
    }
    try {
      const rows = await this.commands.searchKernelRecordRows(text, limit);
      return desktopResult(rows.map(fromSqliteKernelRecordRow));
    } catch (error) {
      return fallbackResult(browserTextSearch(this.store().listRecords(), text, limit), error);
    }
  }

  async saveContext(context: KernelContext): Promise<KernelResult<KernelContext>> {
    if (!this.isDesktop()) {
      this.store().saveContext(context);
      return browserResult(context);
    }
    try {
      await this.commands.saveKernelObjectRows([
        toSqliteKernelObjectRow("context", context.id, context),
      ]);
      return desktopResult(context);
    } catch (error) {
      this.store().saveContext(context);
      return fallbackResult(context, error);
    }
  }

  async listContexts(): Promise<KernelResult<KernelContext[]>> {
    return this.listObjects<KernelContext>("context", () => this.store().listContexts());
  }

  /** Persists a raw source. The pipeline calls this before its records so the
   *  origin is never lost, even if a later write fails. */
  async saveSource(source: KernelSource): Promise<KernelResult<KernelSource>> {
    if (!this.isDesktop()) {
      this.store().saveSource(source);
      return browserResult(source);
    }
    try {
      await this.commands.saveKernelObjectRows([
        toSqliteKernelObjectRow("source", source.id, source),
      ]);
      return desktopResult(source);
    } catch (error) {
      this.store().saveSource(source);
      return fallbackResult(source, error);
    }
  }

  async saveSourceLink(link: SourceLink): Promise<KernelResult<SourceLink>> {
    const id = `${link.sourceId}.${link.recordId}.${link.role}`;
    if (!this.isDesktop()) {
      this.store().saveSourceLink(link);
      return browserResult(link);
    }
    try {
      await this.commands.saveKernelObjectRows([toSqliteKernelObjectRow("sourceLink", id, link)]);
      return desktopResult(link);
    } catch (error) {
      this.store().saveSourceLink(link);
      return fallbackResult(link, error);
    }
  }

  async getSource(id: string): Promise<KernelResult<KernelSource | null>> {
    if (!this.isDesktop()) {
      return browserResult(this.store().getSource(id));
    }
    const listed = await this.listObjects<KernelSource>("source", () => {
      const source = this.store().getSource(id);
      return source ? [source] : [];
    });
    return { ...listed, data: listed.data.find((source) => source.id === id) ?? null };
  }

  async listSourceLinksForRecord(recordId: string): Promise<KernelResult<SourceLink[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.store().listSourceLinksForRecord(recordId));
    }
    const listed = await this.listObjects<SourceLink>("sourceLink", () =>
      this.store().listSourceLinksForRecord(recordId),
    );
    return { ...listed, data: listed.data.filter((link) => link.recordId === recordId) };
  }

  async saveUserSchema(schema: SchemaDefinition): Promise<KernelResult<SchemaDefinition>> {
    if (!this.isDesktop()) {
      this.store().saveUserSchema(schema);
      return browserResult(schema);
    }
    try {
      await this.commands.saveKernelObjectRows([
        toSqliteKernelObjectRow("userSchema", schema.id, schema),
      ]);
      return desktopResult(schema);
    } catch (error) {
      this.store().saveUserSchema(schema);
      return fallbackResult(schema, error);
    }
  }

  async listUserSchemas(): Promise<KernelResult<SchemaDefinition[]>> {
    return this.listObjects<SchemaDefinition>("userSchema", () => this.store().listUserSchemas());
  }

  async saveEntity(entity: KernelEntity): Promise<KernelResult<KernelEntity>> {
    if (!this.isDesktop()) {
      this.store().saveEntity(entity);
      return browserResult(entity);
    }
    try {
      await this.commands.saveKernelObjectRows([
        toSqliteKernelObjectRow("entity", entity.id, entity),
      ]);
      return desktopResult(entity);
    } catch (error) {
      this.store().saveEntity(entity);
      return fallbackResult(entity, error);
    }
  }

  async listEntities(): Promise<KernelResult<KernelEntity[]>> {
    return this.listObjects<KernelEntity>("entity", () => this.store().listEntities());
  }

  async saveRelation(relation: KernelRelation): Promise<KernelResult<KernelRelation>> {
    if (!this.isDesktop()) {
      this.store().saveRelation(relation);
      return browserResult(relation);
    }
    try {
      await this.commands.saveKernelObjectRows([
        toSqliteKernelObjectRow("relation", relation.id, relation),
      ]);
      return desktopResult(relation);
    } catch (error) {
      this.store().saveRelation(relation);
      return fallbackResult(relation, error);
    }
  }

  async listRelations(): Promise<KernelResult<KernelRelation[]>> {
    return this.listObjects<KernelRelation>("relation", () => this.store().listRelations());
  }

  /**
   * A record's reading (기록 v7). Keyed by RECORD id, so a note has exactly one
   * and a re-read overwrites in place rather than accumulating, which is the
   * mistake revision history made.
   *
   * A reading is derived, never authored. A failure here is therefore never data
   * loss: the worst case is a re-read, so unlike saveRecord this swallows rather
   * than propagating, and the caller treats a miss as "not read yet".
   */
  async saveReading(recordId: string, reading: unknown): Promise<void> {
    if (!this.isDesktop()) {
      try {
        this.store().saveReading(recordId, reading);
      } catch {
        // Storage full: the note's own words matter, a reading does not.
      }
      return;
    }
    try {
      await this.commands.saveKernelObjectRows([
        toSqliteKernelObjectRow("reading", recordId, reading),
      ]);
    } catch {
      try {
        this.store().saveReading(recordId, reading);
      } catch {
        // Same: derived, so losing it costs a re-read and nothing else.
      }
    }
  }

  async getReading<T>(recordId: string): Promise<T | null> {
    if (!this.isDesktop()) return this.store().readReading<T>(recordId);
    try {
      const rows = await this.commands.listKernelObjectRows("reading");
      const row = rows.find((candidate) => candidate.id === recordId);
      return row ? (JSON.parse(row.payload_json) as T) : null;
    } catch {
      return this.store().readReading<T>(recordId);
    }
  }

  async listRelationsForRecord(recordId: string): Promise<KernelResult<KernelRelation[]>> {
    if (!this.isDesktop()) {
      return browserResult(
        this.store().listRelations().filter((relation) => relation.fromRecordId === recordId),
      );
    }
    const listed = await this.listRelations();
    return { ...listed, data: listed.data.filter((relation) => relation.fromRecordId === recordId) };
  }

  async saveRule(rule: KernelRule): Promise<KernelResult<KernelRule>> {
    if (!this.isDesktop()) {
      this.store().saveRule(rule);
      return browserResult(rule);
    }
    try {
      await this.commands.saveKernelObjectRows([toSqliteKernelObjectRow("rule", rule.id, rule)]);
      return desktopResult(rule);
    } catch (error) {
      this.store().saveRule(rule);
      return fallbackResult(rule, error);
    }
  }

  async listRules(): Promise<KernelResult<KernelRule[]>> {
    return this.listObjects<KernelRule>("rule", () => this.store().listRules());
  }

  async listRevisions(recordId: string): Promise<KernelResult<KernelRevision[]>> {
    if (!this.isDesktop()) {
      return browserResult(this.store().listRevisions(recordId));
    }
    try {
      const rows = await this.commands.listKernelRevisionRows(recordId);
      return desktopResult(rows.map(fromSqliteKernelRevisionRow));
    } catch (error) {
      return fallbackResult(this.store().listRevisions(recordId), error);
    }
  }

  private async listObjects<T>(
    collection: KernelObjectCollection,
    browserRead: () => T[],
  ): Promise<KernelResult<T[]>> {
    if (!this.isDesktop()) {
      return browserResult(browserRead());
    }
    try {
      const rows = await this.commands.listKernelObjectRows(collection);
      const parsed = rows
        .map((row) => fromSqliteKernelObjectRow<T>(row))
        .filter((item): item is T => item !== null);
      return desktopResult(parsed);
    } catch (error) {
      return fallbackResult(browserRead(), error);
    }
  }
}

function browserTextSearch(records: MoriRecord[], text: string, limit: number): MoriRecord[] {
  const needle = text.toLowerCase();
  return records
    .filter(
      (record) =>
        record.title.toLowerCase().includes(needle) || record.body.toLowerCase().includes(needle),
    )
    .slice(0, limit);
}

function browserResult<T>(data: T): KernelResult<T> {
  return { data, source: "browser-local-storage", fellBack: false };
}

function desktopResult<T>(data: T): KernelResult<T> {
  return { data, source: "desktop-sqlite", fellBack: false };
}

function fallbackResult<T>(data: T, error: unknown): KernelResult<T> {
  return {
    data,
    source: "browser-local-storage",
    fellBack: true,
    fallbackReason: error instanceof Error ? error.message : String(error),
  };
}

// ─── singleton accessor ───────────────────────────────────────────────

let repositorySingleton: KernelRepository | null = null;

export function getKernelRepository(): KernelRepository {
  if (!repositorySingleton) repositorySingleton = new KernelRepository();
  return repositorySingleton;
}

export function setKernelRepositoryForTesting(repository: KernelRepository | null): void {
  repositorySingleton = repository;
}
