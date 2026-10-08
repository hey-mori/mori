/**
 * The offline backfill dry run (#148), against synthetic SQLite databases built
 * from the PRODUCTION migrations and seeded through the production record
 * factory and row converters. Synthetic data proves the tool's behaviour, never
 * anything about a real user's data.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { applyAgentSessionStatusBackfill } from "../../lib/record-kernel/agentSessionStatusBackfill";
import { KernelRepository } from "../../lib/record-kernel/kernelRepository";
import { KernelBrowserStore } from "../../lib/record-kernel/kernelStore";
import { MemoryKeyValueStorage } from "../../lib/storage/memoryStorage";
import type { KernelRevision, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { applyRecordPatch, createRecord, type CreateRecordInput } from "../../lib/record-kernel/recordFactory";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { toSqliteKernelRecordRow, toSqliteKernelRevisionRow } from "../../lib/sqlite/kernelRows";
import {
  createReadOnlyKernelRepository,
  DryRunError,
  isInside,
  liveStorageDir,
  nodeVersionSupported,
  planReadOnly,
  runSnapshotDryRun,
} from "./snapshotDryRun";

const MIGRATIONS = join(__dirname, "../../../src-tauri/migrations");
const registry = createSchemaRegistry();
const provenance = { sourceCommit: "test", sourceDirty: false };
const SECRET = "AKIAIOSFODNN7EXAMPLE";
const TITLE_MARK = "TITLE-MARK-인증-마이그레이션";
const BODY_MARK = "BODY-MARK-본문은-나가지-않는다";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "mori-dry-run-test-"));
}

const at = (iso: string) => () => new Date(iso);

function insertRow(db: DatabaseSync, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(
    ...(keys.map((key) => row[key]) as never[]),
  );
}

/** A Mori database with the real schema, closed cleanly unless `keepOpen`. */
function buildDatabase(
  path: string,
  options: { migrations?: string[]; seed?: (db: DatabaseSync) => void; keepOpen?: boolean } = {},
): DatabaseSync | null {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("CREATE TABLE _mori_migrations (version TEXT PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT);");
  const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  const wanted = options.migrations ?? files.map((file) => file.slice(1, 4));
  for (const file of files) {
    const version = file.slice(1, 4);
    if (!wanted.includes(version) && Number(version) > Math.max(...wanted.map(Number))) continue;
    db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
    if (wanted.includes(version)) {
      db.prepare("INSERT INTO _mori_migrations VALUES (?, ?, 'synthetic', '2026-10-08')").run(version, file);
    }
  }
  options.seed?.(db);
  if (options.keepOpen) return db;
  db.close();
  return null;
}

function seedRecord(db: DatabaseSync, record: MoriRecord, revision: KernelRevision) {
  insertRow(db, "kernel_records", toSqliteKernelRecordRow(record) as never);
  insertRow(db, "kernel_revisions", toSqliteKernelRevisionRow(revision) as never);
}

function session(db: DatabaseSync, id: string, overrides: Partial<CreateRecordInput> = {}): MoriRecord {
  const { record, revision } = createRecord(
    {
      id,
      schemaId: "agent-session",
      title: `${TITLE_MARK} ${id}`,
      body: `${BODY_MARK} ${SECRET}`,
      status: "provisional",
      origin: "automation",
      occurredStart: "2026-08-01T09:00:00.000Z",
      timeBasis: "source-observed",
      properties: { agentId: "claude" },
      now: at("2026-08-01T10:00:00.000Z"),
      ...overrides,
    },
    registry,
  );
  seedRecord(db, record, revision);
  return record;
}

function edit(db: DatabaseSync, record: MoriRecord, actor: "user" | "ai" | "rule") {
  const { record: next, revision } = applyRecordPatch(
    record,
    { title: `${record.title} 수정` },
    actor,
    registry,
    at("2026-08-02T10:00:00.000Z"),
  );
  seedRecord(db, next, revision);
}

/** The scenario every classification test reads. */
function standardSeed(db: DatabaseSync) {
  session(db, "auto-claude-untouched");
  edit(db, session(db, "auto-claude-grown"), "rule");
  edit(db, session(db, "auto-claude-touched"), "user");
  edit(db, session(db, "auto-claude-ai"), "ai");
  session(db, "manual-capture", { origin: "user" });
  session(db, "auto-claude-active", { status: "active" });
  session(db, "auto-claude-discarded", { status: "discarded" });
  session(db, "auto-claude-archived", { status: "archived" });
  const note = createRecord({ id: "note-1", schemaId: "note", title: TITLE_MARK, status: "provisional", origin: "automation" }, registry);
  seedRecord(db, note.record, note.revision);
}

/** A fake home holding a "live" Mori database, plus a snapshot copied elsewhere. */
function liveAndSnapshot(seed: (db: DatabaseSync) => void = standardSeed) {
  const home = tempDir();
  const liveDir = join(home, "Mori", "Records");
  mkdirSync(liveDir, { recursive: true });
  const live = join(liveDir, "mori.sqlite");
  buildDatabase(live, { seed });
  const snapshotDir = join(home, "snapshots");
  mkdirSync(snapshotDir);
  const snapshot = join(snapshotDir, "mori-snapshot.sqlite");
  copyFileSync(live, snapshot);
  return { home, liveDir, live, snapshot, env: { HOME: home } as NodeJS.ProcessEnv };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((error) => error instanceof DryRunError && error.code === code);
}

const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const listing = (dir: string) => readdirSync(dir).sort();

describe("snapshot dry run · classification through the production planner", () => {
  it("reports the planner's verdicts, separately from SQL context counts", async () => {
    const { snapshot, env } = liveAndSnapshot();
    const report = await runSnapshotDryRun({ snapshotPath: snapshot, env, provenance });

    expect(report.planner).toEqual({
      scanned: 5,
      eligible: 2,
      skipped: { "user-touched": 1, "not-automation-owned": 2 },
    });
    expect(report.repeatable).toBe(true);
    expect(report.repository).toEqual({ runtime: "desktop", source: "desktop-sqlite", fellBack: false });
    expect(report.integrity).toBe("ok");
    expect(report.schema.migrations.at(-1)).toBe("013");
    // SQL context is not planner output: it counts the active, discarded and
    // archived sessions the planner never scans, and the non-session record.
    expect(report.sqlContext).toEqual({
      kernelRecords: 9,
      kernelRevisions: 12,
      agentSessionByStatus: { active: 1, archived: 1, discarded: 1, provisional: 5 },
      nonAgentSessionRecords: 1,
    });
  });

  it("puts no title, body, secret, id, or path in the report", async () => {
    const { snapshot, env, home } = liveAndSnapshot();
    const text = JSON.stringify(await runSnapshotDryRun({ snapshotPath: snapshot, env, provenance }));
    for (const forbidden of [TITLE_MARK, BODY_MARK, SECRET, "auto-claude-", "manual-capture", home, "mori-snapshot"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("classifies a malformed revision by its actor without crashing", async () => {
    const { snapshot, env } = liveAndSnapshot((db) => {
      const record = session(db, "auto-claude-odd");
      insertRow(db, "kernel_revisions", {
        id: "rev-odd",
        record_id: record.id,
        actor: "system",
        operation: "update",
        before_json: "{not json",
        after_json: "also not json",
        created_at: "2026-08-03T00:00:00.000Z",
      });
      session(db, "auto-claude-plain");
    });
    const report = await runSnapshotDryRun({ snapshotPath: snapshot, env, provenance });
    expect(report.planner).toEqual({ scanned: 2, eligible: 1, skipped: { "not-automation-owned": 1 } });
  });
});

describe("snapshot dry run · the live database and the snapshot stay untouched", () => {
  it("never changes the live database or creates files beside it or beside the snapshot", async () => {
    const { live, liveDir, snapshot, env } = liveAndSnapshot();
    const liveBefore = { sha: sha(live), files: listing(liveDir) };
    const snapshotDir = join(snapshot, "..");
    const snapshotFilesBefore = listing(snapshotDir);

    const report = await runSnapshotDryRun({ snapshotPath: snapshot, env, provenance });

    expect({ sha: sha(live), files: listing(liveDir) }).toEqual(liveBefore);
    expect(listing(snapshotDir)).toEqual(snapshotFilesBefore);
    expect(report.snapshot).toMatchObject({ sha256: sha(snapshot), unchangedByRun: true, sidecarsCreatedBesideIt: false });
  });

  it("refuses the live database itself and anything inside the live directory", async () => {
    const { live, liveDir, env } = liveAndSnapshot();
    await expectCode(runSnapshotDryRun({ snapshotPath: live, env, provenance }), "SNAPSHOT_IS_LIVE_DB");
    const nested = join(liveDir, "copies", "mori.sqlite");
    mkdirSync(join(liveDir, "copies"));
    copyFileSync(live, nested);
    await expectCode(runSnapshotDryRun({ snapshotPath: nested, env, provenance }), "SNAPSHOT_IS_LIVE_DB");
  });

  it("refuses a symlink that leads into the live directory", async () => {
    const { live, liveDir, home, env } = liveAndSnapshot();
    const fileLink = join(home, "looks-like-a-snapshot.sqlite");
    symlinkSync(live, fileLink);
    await expectCode(runSnapshotDryRun({ snapshotPath: fileLink, env, provenance }), "SNAPSHOT_IS_LIVE_DB");
    const dirLink = join(home, "backup-dir");
    symlinkSync(liveDir, dirLink, "dir");
    await expectCode(runSnapshotDryRun({ snapshotPath: join(dirLink, "mori.sqlite"), env, provenance }), "SNAPSHOT_IS_LIVE_DB");
  });

  it("follows a storage override the way the Rust resolver does", async () => {
    const { home, live, env } = liveAndSnapshot();
    const moved = join(home, "elsewhere");
    mkdirSync(moved);
    const movedDb = join(moved, "mori.sqlite");
    copyFileSync(live, movedDb);
    mkdirSync(join(home, ".mori"));
    writeFileSync(join(home, ".mori", "storage_location"), `  ${moved}\n`);
    expect(liveStorageDir(env)).toBe(moved);
    await expectCode(runSnapshotDryRun({ snapshotPath: movedDb, env, provenance }), "SNAPSHOT_IS_LIVE_DB");
    // With the override in place, the old default directory is no longer live.
    const report = await runSnapshotDryRun({ snapshotPath: live, env, provenance });
    expect(report.planner.scanned).toBe(5);
  });

  it("falls back to USERPROFILE when HOME is unset, as on Windows", () => {
    const profile = tempDir();
    expect(liveStorageDir({ USERPROFILE: profile })).toBe(join(profile, "Mori", "Records"));
    expect(liveStorageDir({})).toBeNull();
  });

  it("compares Windows paths case-insensitively and POSIX paths exactly", () => {
    expect(isInside("C:\\Users\\Isaac\\Mori\\Records\\mori.sqlite", "c:\\users\\isaac\\mori\\records", "win32")).toBe(true);
    expect(isInside("/home/isaac/Mori/Records/mori.sqlite", "/home/isaac/mori/records", "linux")).toBe(false);
    expect(isInside("/home/isaac/snapshots/mori.sqlite", "/home/isaac/Mori/Records", "linux")).toBe(false);
    expect(isInside("D:\\backup\\mori.sqlite", "C:\\Users\\isaac\\Mori\\Records", "win32")).toBe(false);
    expect(isInside("C:\\Users\\isaac\\Mori\\Records-old\\mori.sqlite", "C:\\Users\\isaac\\Mori\\Records", "win32")).toBe(false);
  });
});

describe("snapshot dry run · snapshot consistency", () => {
  it("refuses a snapshot taken with data still in a non-empty -wal", async () => {
    const dir = tempDir();
    const live = join(dir, "live.sqlite");
    const writer = buildDatabase(live, { seed: standardSeed, keepOpen: true }) as DatabaseSync;
    writer.exec("PRAGMA wal_autocheckpoint = 0;");
    session(writer, "auto-claude-late");
    // The writer is still open, so the late row sits in the log. Copying the
    // file pair now is exactly the inconsistent snapshot the tool must refuse.
    const snapshot = join(dir, "snap.sqlite");
    copyFileSync(live, snapshot);
    copyFileSync(`${live}-wal`, `${snapshot}-wal`);
    expect(readFileSync(`${snapshot}-wal`).length).toBeGreaterThan(0);
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SNAPSHOT_HAS_UNCHECKPOINTED_WAL");
    writer.close();
  });

  it("accepts a cleanly closed WAL database whose sidecars are empty", async () => {
    const dir = tempDir();
    const snapshot = join(dir, "snap.sqlite");
    buildDatabase(snapshot, { seed: standardSeed });
    writeFileSync(`${snapshot}-wal`, "");
    writeFileSync(`${snapshot}-shm`, "");
    const report = await runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance });
    expect(report.planner.scanned).toBe(5);
  });

  it("refuses a file that is not SQLite", async () => {
    const file = join(tempDir(), "notes.sqlite");
    writeFileSync(file, "this is not a database");
    await expectCode(runSnapshotDryRun({ snapshotPath: file, env: {}, provenance }), "SNAPSHOT_NOT_SQLITE");
  });

  it("refuses a snapshot whose pages are corrupt", async () => {
    const snapshot = join(tempDir(), "snap.sqlite");
    buildDatabase(snapshot, { seed: standardSeed });
    const bytes = readFileSync(snapshot);
    const pageSize = bytes.readUInt16BE(16) || 65536;
    // Overwrite the third page onward with noise, leaving the header intact.
    bytes.fill(0xa5, pageSize * 2, Math.min(bytes.length, pageSize * 6));
    writeFileSync(snapshot, bytes);
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SNAPSHOT_INTEGRITY_FAILED");
  });

  it("refuses a snapshot whose integrity check reports problems without throwing", async () => {
    const snapshot = join(tempDir(), "snap.sqlite");
    buildDatabase(snapshot, { seed: standardSeed });
    // Swap the index's column order in its stored SQL text, byte for byte (the
    // same length, so every page stays structurally valid). The tables still
    // read, but the index no longer matches its definition, which the check
    // reports as result rows rather than by throwing. No writable_schema, so
    // this works on every Node that node:sqlite supports.
    const bytes = readFileSync(snapshot);
    const from = Buffer.from("kernel_revisions(record_id, created_at)");
    const to = Buffer.from("kernel_revisions(created_at, record_id)");
    const offset = bytes.indexOf(from);
    expect(offset).toBeGreaterThan(0);
    to.copy(bytes, offset);
    writeFileSync(snapshot, bytes);
    const check = new DatabaseSync(snapshot, { readOnly: true });
    const rows = check.prepare("PRAGMA integrity_check").all();
    check.close();
    expect(rows.length === 1 && Object.values(rows[0] as object)[0] === "ok").toBe(false);
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SNAPSHOT_INTEGRITY_FAILED");
  });

  it("refuses a path that is not a file", async () => {
    await expectCode(runSnapshotDryRun({ snapshotPath: join(tempDir(), "missing.sqlite"), env: {}, provenance }), "SNAPSHOT_NOT_FOUND");
  });
});

describe("snapshot dry run · schema compatibility fails closed", () => {
  const snapshotWith = (mutate: (db: DatabaseSync) => void, migrations?: string[]) => {
    const snapshot = join(tempDir(), "snap.sqlite");
    buildDatabase(snapshot, { migrations, seed: (db) => mutate(db) });
    return snapshot;
  };

  it("refuses a migration this tool does not know", async () => {
    const snapshot = snapshotWith((db) => {
      standardSeed(db);
      db.prepare("INSERT INTO _mori_migrations VALUES ('014', 'V014__future.sql', 'x', 'x')").run();
    });
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SCHEMA_NEWER_THAN_TOOL");
  });

  it("refuses a gap in the applied migrations", async () => {
    const snapshot = snapshotWith((db) => {
      standardSeed(db);
      db.prepare("DELETE FROM _mori_migrations WHERE version = '005'").run();
    });
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SCHEMA_GAP");
  });

  it("refuses a database from before the record kernel", async () => {
    const snapshot = snapshotWith(() => {}, ["001", "002", "003", "004", "005", "006", "007"]);
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SCHEMA_TOO_OLD");
  });

  it("refuses a database without migration metadata", async () => {
    const snapshot = snapshotWith((db) => db.exec("DROP TABLE _mori_migrations;"));
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SCHEMA_NO_MIGRATION_TABLE");
  });

  it("refuses a missing kernel table", async () => {
    const snapshot = snapshotWith((db) => db.exec("DROP TABLE kernel_revisions;"));
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SCHEMA_MISSING_TABLE");
  });

  it("refuses a kernel table missing a column the planner reads", async () => {
    const snapshot = snapshotWith((db) => db.exec("ALTER TABLE kernel_records DROP COLUMN ownership;"));
    await expectCode(runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance }), "SCHEMA_MISSING_COLUMN");
  });

  it("accepts an older but kernel-bearing schema (V008 to V012)", async () => {
    const snapshot = join(tempDir(), "snap.sqlite");
    buildDatabase(snapshot, {
      migrations: ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012"],
      seed: standardSeed,
    });
    const report = await runSnapshotDryRun({ snapshotPath: snapshot, env: {}, provenance });
    expect(report.schema.migrations.at(-1)).toBe("012");
    expect(report.planner.eligible).toBe(2);
  });
});

describe("snapshot dry run · no silent fallback, no write", () => {
  const openSnapshot = () => {
    const snapshot = join(tempDir(), "snap.sqlite");
    buildDatabase(snapshot, { seed: standardSeed });
    return new DatabaseSync(snapshot, { readOnly: true });
  };

  it("aborts when the record read fails instead of planning over the empty fallback", async () => {
    const db = openSnapshot();
    const guarded = createReadOnlyKernelRepository(db);
    db.close(); // every read now throws inside the desktop command
    await expectCode(planReadOnly(guarded), "READ_FAILED");
  });

  it("aborts when a revision read fails instead of counting it as a skip", async () => {
    const db = openSnapshot();
    const guarded = createReadOnlyKernelRepository(db);
    const repository = guarded.repository as unknown as { commands: { listKernelRevisionRows: () => Promise<never> } };
    repository.commands.listKernelRevisionRows = async () => {
      throw new Error("disk I/O error");
    };
    await expectCode(planReadOnly(guarded), "READ_FAILED");
    db.close();
  });

  it("refuses to plan unless reads really come from the desktop SQLite path", async () => {
    const db = openSnapshot();
    // A repository that silently ended up in browser mode answers from an empty
    // localStorage stand-in without falling back, so only the probe can tell.
    const browser = {
      repository: new KernelRepository({ runtime: "browser", store: new KernelBrowserStore(new MemoryKeyValueStorage()) }),
      writeAttempts: () => 0,
    };
    await expectCode(planReadOnly(browser), "READ_FAILED");
    db.close();
  });

  it("catches a write the repository would otherwise absorb into its in-memory fallback", async () => {
    const db = openSnapshot();
    const guarded = createReadOnlyKernelRepository(db);
    const plan = await (await import("../../lib/record-kernel/agentSessionStatusBackfill")).planAgentSessionStatusBackfill(
      guarded.repository,
    );
    // Negative control: the real apply writes. Through this repository each
    // write is refused at the command AND counted, even though KernelRepository
    // turns the failure into a fallback "success".
    const result = await applyAgentSessionStatusBackfill(guarded.repository, registry, plan);
    expect(result.promoted).toBe(2);
    // One refused command per promotion: saveRecord stops at the record write.
    expect(guarded.writeAttempts()).toBe(2);
    await expectCode(planReadOnly(guarded), "WRITE_ATTEMPTED");
    expect((db.prepare("SELECT COUNT(*) AS n FROM kernel_revisions").get() as { n: number }).n).toBe(12);
    db.close();
  });
});

describe("snapshot dry run · runtime requirement", () => {
  it("requires Node 22.13 or newer", () => {
    expect(nodeVersionSupported("22.12.9")).toBe(false);
    expect(nodeVersionSupported("v22.13.0")).toBe(true);
    expect(nodeVersionSupported("24.20.0")).toBe(true);
    expect(nodeVersionSupported("20.18.0")).toBe(false);
  });
});
