import { describe, expect, it, vi } from "vitest";
import {
  createBrowserIntakeStore,
  createSqliteIntakeStore,
  type IntakeCommands,
} from "./intakeStoreBackends";
import { IntakeBrowserStore } from "./intakeStore";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import { MAX_ROW_AGE_MS } from "./evictIntakeRows";
import { toSqliteIntakeRow } from "../sqlite/intakeRequestRows";
import type { IntakeRequestRow } from "./intakeTypes";

const NOW = Date.parse("2026-08-18T09:00:00.000Z");

function makeRow(overrides: Partial<IntakeRequestRow> = {}): IntakeRequestRow {
  return {
    schemaVersion: 2,
    id: "/s/a.jsonl::r1",
    sessionKey: "/s/a.jsonl",
    projectPath: "C:/dev/mori",
    sessionLabel: "mori",
    title: "요청",
    titleTruncated: false,
    startedAt: new Date(NOW).toISOString(),
    endedAt: new Date(NOW).toISOString(),
    observedAt: new Date(NOW).toISOString(),
    stepCount: 1,
    tools: [],
    files: [],
    hasError: false,
    status: "completed",
    locator: { path: "/s/a.jsonl", offset: 0 },
    ...overrides,
  } as IntakeRequestRow;
}

/** A stand-in for the Tauri bridge, holding rows the way SQLite would. */
function fakeCommands() {
  let rows = new Map<string, ReturnType<typeof toSqliteIntakeRow>>();
  const commands = {
    saveIntakeRequestRows: vi.fn(async (next: ReturnType<typeof toSqliteIntakeRow>[]) => {
      for (const row of next) rows.set(row.id, row);
      return { rowsWritten: next.length };
    }),
    listIntakeRequestRowsForSession: vi.fn(async (sessionKey: string) =>
      [...rows.values()].filter((row) => row.sessionKey === sessionKey),
    ),
    listIntakeRequestRowsForProject: vi.fn(async (projectPath: string) =>
      [...rows.values()].filter((row) => row.projectPath === projectPath),
    ),
    listAllIntakeRequestRows: vi.fn(async () => [...rows.values()]),
    deleteIntakeRequestRowsForSession: vi.fn(async (sessionKey: string) => {
      const before = rows.size;
      rows = new Map([...rows].filter(([, row]) => row.sessionKey !== sessionKey));
      return before - rows.size;
    }),
  };
  return commands satisfies IntakeCommands;
}

describe("intake backends", () => {
  it("merges rather than replaces on both backends", async () => {
    for (const store of [
      createBrowserIntakeStore(new IntakeBrowserStore(new MemoryKeyValueStorage()), () => NOW),
      createSqliteIntakeStore(fakeCommands()),
    ]) {
      await store.saveSessionRows("/s/a.jsonl", [makeRow({ id: "old", title: "이전" })]);
      await store.saveSessionRows("/s/a.jsonl", [makeRow({ id: "new", title: "이후" })]);

      // The follower trims its history, so a whole-session rewrite would
      // discard what Mori already observed. Same rule on either backend.
      const titles = (await store.listSessionRows("/s/a.jsonl")).map((row) => row.title);
      expect(titles.sort()).toEqual(["이전", "이후"].sort());
    }
  });

  // The bound answers localStorage's cap. Applying it to SQLite would delete
  // observations to save space that is not scarce.
  it("bounds the browser backend by age and leaves the SQLite one unbounded", async () => {
    const ancient = new Date(NOW - MAX_ROW_AGE_MS - 1).toISOString();

    const browser = createBrowserIntakeStore(
      new IntakeBrowserStore(new MemoryKeyValueStorage()),
      () => NOW,
    );
    const browserResult = await browser.saveSessionRows("/s/a.jsonl", [
      makeRow({ id: "old", startedAt: ancient, endedAt: ancient }),
      makeRow({ id: "fresh" }),
    ]);
    expect(browserResult.dropped).toBe(1);
    expect(await browser.listSessionRows("/s/a.jsonl")).toHaveLength(1);

    const sqlite = createSqliteIntakeStore(fakeCommands());
    const sqliteResult = await sqlite.saveSessionRows("/s/a.jsonl", [
      makeRow({ id: "old", startedAt: ancient, endedAt: ancient }),
      makeRow({ id: "fresh" }),
    ]);
    expect(sqliteResult.dropped).toBe(0);
    expect(await sqlite.listSessionRows("/s/a.jsonl")).toHaveLength(2);
  });

  it("reads one project without loading the rest", async () => {
    const commands = fakeCommands();
    const store = createSqliteIntakeStore(commands);
    await store.saveSessionRows("/s/a.jsonl", [makeRow({ id: "a" })]);
    await store.saveSessionRows("/s/b.jsonl", [
      makeRow({ id: "b", sessionKey: "/s/b.jsonl", projectPath: "C:/dev/other" }),
    ]);

    expect((await store.listProjectRows("C:/dev/mori")).map((row) => row.id)).toEqual(["a"]);
    // The point of the index: the project read is a query, not a filter over
    // everything the store holds.
    expect(commands.listIntakeRequestRowsForProject).toHaveBeenCalledWith("C:/dev/mori");
  });

  it("lists distinct project paths on both backends", async () => {
    for (const store of [
      createBrowserIntakeStore(new IntakeBrowserStore(new MemoryKeyValueStorage()), () => NOW),
      createSqliteIntakeStore(fakeCommands()),
    ]) {
      await store.saveSessionRows("/s/a.jsonl", [makeRow({ id: "a" })]);
      await store.saveSessionRows("/s/b.jsonl", [
        makeRow({ id: "b", sessionKey: "/s/b.jsonl", projectPath: "C:/dev/other" }),
      ]);

      expect((await store.listProjectPaths()).sort()).toEqual(["C:/dev/mori", "C:/dev/other"]);
    }
  });

  it("clears one session on both backends", async () => {
    for (const store of [
      createBrowserIntakeStore(new IntakeBrowserStore(new MemoryKeyValueStorage()), () => NOW),
      createSqliteIntakeStore(fakeCommands()),
    ]) {
      await store.saveSessionRows("/s/a.jsonl", [makeRow({ id: "a" })]);
      await store.clearSession("/s/a.jsonl");
      expect(await store.listSessionRows("/s/a.jsonl")).toEqual([]);
    }
  });
});
