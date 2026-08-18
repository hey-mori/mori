import { describe, expect, it } from "vitest";
import { resolveDurableReadSource } from "./durableReadSource";
import { MemoryKeyValueStorage } from "./memoryStorage";
import type { DurableDocumentKind, SqliteDurableDocumentRow } from "../sqlite/durableDocumentRows";

function localWith(entries: Record<string, string>): MemoryKeyValueStorage {
  const storage = new MemoryKeyValueStorage();
  for (const [key, value] of Object.entries(entries)) storage.setItem(key, value);
  return storage;
}

function documents(rows: Array<Partial<SqliteDurableDocumentRow>>) {
  const all = rows.map((row) => ({
    kind: "session_draft" as DurableDocumentKind,
    ownerId: "sess-1",
    schemaVersion: 1,
    bodyJson: "{}",
    updatedAt: "2026-08-18T09:00:00.000Z",
    ...row,
  }));
  return async (kind: DurableDocumentKind) => all.filter((row) => row.kind === kind);
}

describe("resolveDurableReadSource", () => {
  it("serves from SQLite when it holds every durable key localStorage has", async () => {
    const local = localWith({ "mori.sessionDraft.sess-1": '{"from":"local"}' });
    const result = await resolveDurableReadSource({
      local,
      listDocuments: documents([{ bodyJson: '{"from":"sqlite"}' }]),
    });

    expect(result.source).toBe("desktop-sqlite");
    expect(result.storage?.getItem("mori.sessionDraft.sess-1")).toBe('{"from":"sqlite"}');
  });

  // The property that lets this ship without a staged rollout: when the copy is
  // incomplete the worst case is today's behaviour, not missing data.
  it("stays on localStorage when SQLite is missing anything", async () => {
    const local = localWith({
      "mori.sessionDraft.sess-1": "{}",
      "mori.sessionDraft.sess-2": "{}",
    });
    const result = await resolveDurableReadSource({
      local,
      listDocuments: documents([{ ownerId: "sess-1" }]),
    });

    expect(result.source).toBe("browser-local-storage");
    expect(result.storage).toBeNull();
    expect(result.heldBack).toMatchObject({
      missingKeys: 1,
      example: "mori.sessionDraft.sess-2",
    });
  });

  it("stays on localStorage when the documents cannot be read at all", async () => {
    const local = localWith({ "mori.sessionDraft.sess-1": "{}" });
    const result = await resolveDurableReadSource({
      local,
      listDocuments: async () => {
        throw new Error("database is locked");
      },
    });

    // Unreadable is not the same as incomplete, but the response is: stay where
    // the data certainly is.
    expect(result.source).toBe("browser-local-storage");
    expect(result.heldBack?.reason).toBe("database is locked");
  });

  it("flips on a device with nothing stored yet", async () => {
    const result = await resolveDurableReadSource({
      local: localWith({}),
      listDocuments: documents([]),
    });

    // Nothing missing, so nothing to hold back for. A fresh install reads from
    // SQLite from its first launch.
    expect(result.source).toBe("desktop-sqlite");
  });

  it("carries non-durable keys across, since the adapter reads them too", async () => {
    const local = localWith({
      "mori.sessionDraft.sess-1": "{}",
      "mori.themePreference": '"dark"',
      "mori.currentSessionDraft": '{"session":{"id":"sess-1"}}',
    });
    const result = await resolveDurableReadSource({
      local,
      listDocuments: documents([{ bodyJson: '{"from":"sqlite"}' }]),
    });

    // Preferences and the open-session pointer were never part of this
    // promotion, so they must survive the move rather than vanish with it.
    expect(result.storage?.getItem("mori.themePreference")).toBe('"dark"');
    expect(result.storage?.getItem("mori.currentSessionDraft")).toBe(
      '{"session":{"id":"sess-1"}}',
    );
  });

  it("writes through to localStorage while dual-write is still on", async () => {
    const local = localWith({ "mori.sessionDraft.sess-1": "{}" });
    const result = await resolveDurableReadSource({
      local,
      listDocuments: documents([{ ownerId: "sess-1" }]),
    });
    expect(result.source).toBe("desktop-sqlite");

    result.storage?.setItem("mori.sessionDraft.sess-2", '{"new":true}');

    // Read back from the cache, and present in localStorage: R6 flips reads,
    // R7 is what stops the second write.
    expect(result.storage?.getItem("mori.sessionDraft.sess-2")).toBe('{"new":true}');
    expect(local.getItem("mori.sessionDraft.sess-2")).toBe('{"new":true}');
  });

  it("removes from both sides", async () => {
    const local = localWith({});
    const result = await resolveDurableReadSource({ local, listDocuments: documents([]) });

    result.storage?.setItem("mori.sessionDraft.sess-1", "{}");
    result.storage?.removeItem("mori.sessionDraft.sess-1");

    expect(result.storage?.getItem("mori.sessionDraft.sess-1")).toBeNull();
    expect(local.getItem("mori.sessionDraft.sess-1")).toBeNull();
  });
});
