import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";

const ops = vi.hoisted(() => ({ writes: [] as Array<{ kind: string; ownerId: string }>, removes: [] as Array<{ kind: string; ownerId: string }> }));
vi.mock("../storage/desktopDocumentMirror", () => ({
  getDesktopDocumentMirror: () => ({
    write: (input: { kind: string; ownerId: string }) => ops.writes.push({ kind: input.kind, ownerId: input.ownerId }),
    remove: (kind: string, ownerId: string) => ops.removes.push({ kind, ownerId }),
  }),
}));

import {
  adoptReopenDescriptors,
  forgetReopenDescriptors,
  setProtectedDescriptorIds,
  loadAutoImportMeta,
  loadAutoImportMetas,
  loadEmptySourceLabels,
  removeAutoImportMeta,
  replaceEmptySources,
  upsertAutoImportMetas,
} from "./autoImportMetaStore";
import { autoImportedSessionId } from "./autoImportSessions";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const empty = (id: string, projectPath: string) =>
  ({ id, sessionId: id, agentId: "claude", projectPath, projectName: projectPath }) as AgentWorkSessionMeta;

describe("empty-source coverage", () => {
  beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the latest poll's empty sources so the pack can still count them", () => {
    replaceEmptySources([empty("a", "/home/u/dev/home"), empty("b", "/home/u/dev/home"), empty("c", "/home/u/dev/infra")]);
    expect(loadEmptySourceLabels().sort()).toEqual(["/home/u/dev/home", "/home/u/dev/home", "/home/u/dev/infra"]);
    // A source that gained content drops out of the next poll's list.
    replaceEmptySources([empty("a", "/home/u/dev/home")]);
    expect(loadEmptySourceLabels()).toEqual(["/home/u/dev/home"]);
  });

  it("reads as none when storage is unavailable or corrupt", () => {
    window.localStorage.setItem("mori.autoImport.emptySources.v1", "{not json");
    expect(loadEmptySourceLabels()).toEqual([]);
  });
});

describe("reopen descriptors", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    ops.writes.length = 0;
    ops.removes.length = 0;
    forgetReopenDescriptors();
  });
  afterEach(() => vi.unstubAllGlobals());

  const meta = (id: string, day: number) =>
    ({
      id,
      sessionId: id,
      agentId: "claude",
      importKind: "claude-code",
      sourceFilePath: `/p/${id}.jsonl`,
      startedAt: `2026-01-01T00:00:00Z`,
      updatedAt: new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString(),
    }) as AgentWorkSessionMeta;
  const row = (m: AgentWorkSessionMeta) => ({
    kind: "reopen_descriptor" as const,
    ownerId: autoImportedSessionId(m),
    schemaVersion: 1,
    bodyJson: JSON.stringify(m),
    updatedAt: m.updatedAt,
  });

  it("writes one durable document per upserted session, and deletes only on removal", () => {
    upsertAutoImportMetas([meta("a", 1), meta("b", 2)]);
    expect(ops.writes.map((w) => w.ownerId).sort()).toEqual(
      [autoImportedSessionId(meta("a", 1)), autoImportedSessionId(meta("b", 2))].sort(),
    );
    removeAutoImportMeta(autoImportedSessionId(meta("a", 1)));
    expect(ops.removes).toEqual([{ kind: "reopen_descriptor", ownerId: autoImportedSessionId(meta("a", 1)) }]);
  });

  it("never shrinks the durable descriptors when the local map is empty or partial", () => {
    // A restored profile: SQLite holds three, localStorage nothing.
    adoptReopenDescriptors([row(meta("gone-1", 1)), row(meta("gone-2", 2)), row(meta("kept", 3))]);
    ops.writes.length = 0;
    // A launch on localStorage reads, one new session discovered.
    upsertAutoImportMetas([meta("new", 9)]);
    expect(ops.removes).toEqual([]);
    expect(ops.writes.map((w) => w.ownerId)).toEqual([autoImportedSessionId(meta("new", 9))]);
    // Every restored descriptor still opens.
    expect(loadAutoImportMeta(autoImportedSessionId(meta("gone-1", 1)))?.sourceFilePath).toBe("/p/gone-1.jsonl");
    expect(loadAutoImportMetas()).toHaveLength(4);
  });

  it("serves the newer of the local and durable copies of a session", () => {
    const id = autoImportedSessionId(meta("s", 1));
    adoptReopenDescriptors([row({ ...meta("s", 5), title: "durable newer" } as AgentWorkSessionMeta)]);
    window.localStorage.setItem("mori.autoImport.v1", JSON.stringify({ [id]: { ...meta("s", 1), title: "local older" } }));
    expect(loadAutoImportMeta(id)?.title).toBe("durable newer");
  });

  it("adopts local descriptors SQLite lacks or holds older, and nothing else", () => {
    const a = meta("a", 1);
    const b = meta("b", 5);
    window.localStorage.setItem(
      "mori.autoImport.v1",
      JSON.stringify({ [autoImportedSessionId(a)]: a, [autoImportedSessionId(b)]: b }),
    );
    const { adopted } = adoptReopenDescriptors([row(meta("b", 5))]);
    expect(adopted).toBe(1);
    expect(ops.writes.map((w) => w.ownerId)).toEqual([autoImportedSessionId(a)]);
  });

  it("never lets the recency cap drop a protected descriptor", () => {
    const old = meta("kept-old", 0);
    const keptId = autoImportedSessionId(old);
    upsertAutoImportMetas([old]);
    upsertAutoImportMetas(Array.from({ length: 1000 }, (_, i) => meta(`n${i}`, i + 10)), { protectedIds: new Set([keptId]) });
    expect(loadAutoImportMeta(keptId)?.sourceFilePath).toBe("/p/kept-old.jsonl");
    expect(ops.removes.some((r) => r.ownerId === keptId)).toBe(false);
  });

  it("evicts the oldest unprotected descriptor, local and durable, when nothing is protected", () => {
    setProtectedDescriptorIds(new Set(), { complete: true });
    const old = meta("old", 0);
    upsertAutoImportMetas([old]);
    upsertAutoImportMetas(Array.from({ length: 1000 }, (_, i) => meta(`n${i}`, i + 10)));
    expect(loadAutoImportMeta(autoImportedSessionId(old))).toBeNull();
    expect(ops.removes).toEqual([{ kind: "reopen_descriptor", ownerId: autoImportedSessionId(old) }]);
  });

  it("sets an unreadable local map aside instead of losing it or blocking every write", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    window.localStorage.setItem("mori.autoImport.v1", "{truncated");
    upsertAutoImportMetas([meta("a", 1)]);
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i));
    const aside = keys.find((k) => k?.startsWith("mori.autoImport.v1.unreadable."));
    expect(aside && window.localStorage.getItem(aside)).toBe("{truncated");
    expect(loadAutoImportMeta(autoImportedSessionId(meta("a", 1)))).not.toBeNull();
  });
});

describe("the cap while the kept set is unknown", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    ops.writes.length = 0;
    ops.removes.length = 0;
    forgetReopenDescriptors();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("trims only the local cache, never a durable descriptor", async () => {
    const { setProtectedDescriptorIds } = await import("./autoImportMetaStore");
    const meta = (id: string, day: number) =>
      ({ id, sessionId: id, agentId: "claude", importKind: "claude-code", sourceFilePath: `/p/${id}`, startedAt: "", updatedAt: new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString() }) as AgentWorkSessionMeta;
    setProtectedDescriptorIds(new Set(), { complete: false });
    upsertAutoImportMetas([meta("old", 0)]);
    upsertAutoImportMetas(Array.from({ length: 1000 }, (_, i) => meta(`n${i}`, i + 10)));
    expect(ops.removes).toEqual([]);
  });
});
