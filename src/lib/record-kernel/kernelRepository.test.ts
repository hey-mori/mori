import { describe, expect, it, vi } from "vitest";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import {
  toSqliteKernelObjectRow,
  toSqliteKernelRecordRow,
  type SqliteKernelObjectRow,
  type SqliteKernelRecordRow,
  type SqliteKernelRevisionRow,
} from "../sqlite/kernelRows";
import { KernelBrowserStore } from "./kernelStore";
import { KernelRepository, type KernelDesktopCommands } from "./kernelRepository";
import { createRecord } from "./recordFactory";
import { createSchemaRegistry } from "./schemaRegistry";

const registry = createSchemaRegistry();

function makeRecord(title = "메모") {
  return createRecord({ schemaId: "note", title, body: "러닝 기록", origin: "user" }, registry);
}

function browserRepository() {
  const store = new KernelBrowserStore(new MemoryKeyValueStorage());
  return { repository: new KernelRepository({ runtime: "browser", store }), store };
}

function desktopCommands(overrides: Partial<KernelDesktopCommands> = {}): KernelDesktopCommands {
  const records: SqliteKernelRecordRow[] = [];
  const objects: SqliteKernelObjectRow[] = [];
  const revisions: SqliteKernelRevisionRow[] = [];
  return {
    saveKernelRecordRows: vi.fn(async (rows: SqliteKernelRecordRow[]) => {
      records.push(...rows);
      return { rowsWritten: rows.length };
    }),
    listKernelRecordRows: vi.fn(async () => records),
    getKernelRecordRow: vi.fn(async (id: string) => records.find((row) => row.id === id) ?? null),
    deleteKernelRecordRow: vi.fn(async () => 1),
    searchKernelRecordRows: vi.fn(async () => records),
    saveKernelObjectRows: vi.fn(async (rows: SqliteKernelObjectRow[]) => {
      objects.push(...rows);
      return { rowsWritten: rows.length };
    }),
    listKernelObjectRows: vi.fn(async (collection: string) =>
      objects.filter((row) => row.collection === collection),
    ),
    appendKernelRevisionRows: vi.fn(async (rows: SqliteKernelRevisionRow[]) => {
      revisions.push(...rows);
      return { rowsWritten: rows.length };
    }),
    listKernelRevisionRows: vi.fn(async (recordId: string) =>
      revisions.filter((row) => row.record_id === recordId),
    ),
    ...overrides,
  };
}

describe("KernelRepository · browser mode", () => {
  it("persists a record with its revision in one call", async () => {
    const { repository, store } = browserRepository();
    const { record, revision } = makeRecord();
    const result = await repository.saveRecord(record, revision);
    expect(result.source).toBe("browser-local-storage");
    expect(store.getRecord(record.id)).toEqual(record);
    expect(store.listRevisions(record.id)).toHaveLength(1);
  });

  it("searches by plain text filter", async () => {
    const { repository } = browserRepository();
    const { record, revision } = makeRecord("운동 메모");
    await repository.saveRecord(record, revision);
    const hit = await repository.searchRecords("러닝");
    expect(hit.data).toHaveLength(1);
    const miss = await repository.searchRecords("없는말");
    expect(miss.data).toHaveLength(0);
  });
});

describe("KernelRepository · desktop mode", () => {
  it("routes records and revisions through the SQLite commands", async () => {
    const commands = desktopCommands();
    const repository = new KernelRepository({
      runtime: "desktop",
      store: new KernelBrowserStore(new MemoryKeyValueStorage()),
      commands,
    });
    const { record, revision } = makeRecord();
    const saved = await repository.saveRecord(record, revision);
    expect(saved.source).toBe("desktop-sqlite");
    expect(commands.saveKernelRecordRows).toHaveBeenCalledWith([toSqliteKernelRecordRow(record)]);
    expect(commands.appendKernelRevisionRows).toHaveBeenCalledTimes(1);

    const listed = await repository.listRecords();
    expect(listed.source).toBe("desktop-sqlite");
    expect(listed.data).toEqual([record]);

    const fetched = await repository.getRecord(record.id);
    expect(fetched.data).toEqual(record);

    const revisions = await repository.listRevisions(record.id);
    expect(revisions.data[0]?.id).toBe(revision.id);
  });

  it("round-trips contexts and user schemas through kernel objects", async () => {
    const commands = desktopCommands();
    const repository = new KernelRepository({
      runtime: "desktop",
      store: new KernelBrowserStore(new MemoryKeyValueStorage()),
      commands,
    });
    const context = { id: "ctx-1", type: "topic" as const, name: "개인 연구", createdAt: "2026-07-14" };
    await repository.saveContext(context);
    expect(commands.saveKernelObjectRows).toHaveBeenCalledWith([
      expect.objectContaining({ collection: "context", id: "ctx-1" }),
    ]);
    const listed = await repository.listContexts();
    expect(listed.data).toEqual([context]);
  });

  it("skips corrupted object payloads instead of failing the list", async () => {
    const commands = desktopCommands({
      listKernelObjectRows: vi.fn(async () => [
        toSqliteKernelObjectRow("context", "ctx-ok", { id: "ctx-ok", type: "topic", name: "ok", createdAt: "x" }),
        { collection: "context", id: "ctx-bad", payload_json: "{bad", saved_at: "x" },
      ]),
    });
    const repository = new KernelRepository({
      runtime: "desktop",
      store: new KernelBrowserStore(new MemoryKeyValueStorage()),
      commands,
    });
    const listed = await repository.listContexts();
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.id).toBe("ctx-ok");
  });

  it("falls back to the browser store honestly when SQLite fails", async () => {
    const store = new KernelBrowserStore(new MemoryKeyValueStorage());
    const commands = desktopCommands({
      saveKernelRecordRows: vi.fn(async () => {
        throw new Error("db locked");
      }),
      listKernelRecordRows: vi.fn(async () => {
        throw new Error("db locked");
      }),
    });
    const repository = new KernelRepository({ runtime: "desktop", store, commands });
    const { record, revision } = makeRecord();
    const saved = await repository.saveRecord(record, revision);
    expect(saved.source).toBe("browser-local-storage");
    expect(saved.fellBack).toBe(true);
    expect(saved.fallbackReason).toContain("db locked");
    expect(store.getRecord(record.id)).toEqual(record);
    expect(store.listRevisions(record.id)).toHaveLength(1);

    const listed = await repository.listRecords();
    expect(listed.fellBack).toBe(true);
    expect(listed.data).toEqual([record]);
  });
});
