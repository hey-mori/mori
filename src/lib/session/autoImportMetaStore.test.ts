import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";

const mirrored = vi.hoisted(() => [] as Array<{ kind: string; body: unknown }>);
vi.mock("../storage/desktopDocumentMirror", () => ({
  mirrorAppScopedDocument: (kind: string, body: unknown) => mirrored.push({ kind, body }),
}));

import {
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
    mirrored.length = 0;
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

  it("mirrors the whole map to SQLite on every write", () => {
    upsertAutoImportMetas([meta("a", 1)]);
    const id = autoImportedSessionId(meta("a", 1));
    expect(mirrored.at(-1)).toMatchObject({ kind: "auto_import_descriptors" });
    expect(Object.keys(mirrored.at(-1)!.body as object)).toEqual([id]);
    removeAutoImportMeta(id);
    expect(mirrored.at(-1)!.body).toEqual({});
  });

  it("never lets the recency cap drop a protected descriptor", () => {
    const old = meta("kept-old", 0);
    const keptId = autoImportedSessionId(old);
    upsertAutoImportMetas([old]);
    const fresh = Array.from({ length: 1000 }, (_, i) => meta(`n${i}`, i + 10));
    upsertAutoImportMetas(fresh, { protectedIds: new Set([keptId]) });
    expect(loadAutoImportMeta(keptId)?.sourceFilePath).toBe("/p/kept-old.jsonl");
    expect(loadAutoImportMetas()).toHaveLength(1000);
  });

  it("evicts the oldest unprotected descriptor when nothing is protected", () => {
    const old = meta("old", 0);
    upsertAutoImportMetas([old]);
    upsertAutoImportMetas(Array.from({ length: 1000 }, (_, i) => meta(`n${i}`, i + 10)));
    expect(loadAutoImportMeta(autoImportedSessionId(old))).toBeNull();
  });

  it("does not replace a stored map it cannot read", () => {
    window.localStorage.setItem("mori.autoImport.v1", "{truncated");
    upsertAutoImportMetas([meta("a", 1)]);
    removeAutoImportMeta("anything");
    expect(window.localStorage.getItem("mori.autoImport.v1")).toBe("{truncated");
    expect(mirrored).toHaveLength(0);
  });
});
