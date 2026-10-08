import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { loadEmptySourceLabels, replaceEmptySources } from "./autoImportMetaStore";

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
