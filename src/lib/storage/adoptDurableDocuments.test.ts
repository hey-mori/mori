import { describe, expect, it } from "vitest";
import {
  ADOPTION_MARKER_KEY,
  adoptDurableDocuments,
  hasAdopted,
} from "./adoptDurableDocuments";
import { MemoryKeyValueStorage } from "./memoryStorage";
import type { DocumentMirrorTarget } from "./documentMirror";
import type { SqliteDurableDocumentRow } from "../sqlite/durableDocumentRows";

function target(failAfter = Number.POSITIVE_INFINITY) {
  const saved: SqliteDurableDocumentRow[] = [];
  let batches = 0;
  const mirrorTarget: DocumentMirrorTarget = {
    async saveDocuments(documents) {
      batches += 1;
      if (batches > failAfter) throw new Error("disk full");
      saved.push(...documents);
    },
    async deleteDocument() {},
  };
  return { mirrorTarget, saved, batchCount: () => batches };
}

function storageWith(entries: Record<string, unknown>): MemoryKeyValueStorage {
  const storage = new MemoryKeyValueStorage();
  for (const [key, value] of Object.entries(entries)) {
    storage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return storage;
}

const now = () => "2026-08-18T10:00:00.000Z";

describe("adoptDurableDocuments", () => {
  it("copies a memory body and reports what moved", async () => {
    const storage = storageWith({
      "mori.sessionMemory.sess-1": { sessionId: "sess-1", savedAt: "2026-08-01T00:00:00.000Z", schemaVersion: 1 },
    });
    const { mirrorTarget, saved } = target();

    const report = await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    expect(report).toMatchObject({
      scanned: 1,
      written: 1,
      unreadable: 0,
      skippedFresher: 0,
      stoppedBecause: null,
    });
    expect(saved[0].kind).toBe("memory_body");
    expect(saved[0].ownerId).toBe("sess-1");
    // The document's own savedAt, not the clock, so ordering survives the move.
    expect(saved[0].updatedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  // The quiet trap: these two prefixes look like one contains the other. They
  // do not, because the character after "mori.sessionAnalysis" is "." in one
  // and "H" in the other. If that were ever wrong, every history would be
  // adopted as an analysis and silently overwrite it.
  it("does not confuse analysis with analysis history", async () => {
    const storage = storageWith({
      "mori.sessionAnalysis.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
      "mori.sessionAnalysisHistory.sess-1": { savedAt: "2026-08-02T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    expect(saved.map((row) => row.kind).sort()).toEqual(["analysis", "analysis_history"]);
    expect(saved.every((row) => row.ownerId === "sess-1")).toBe(true);
  });

  it("ignores keys that are not adopted classes", async () => {
    const storage = storageWith({
      "mori.themePreference": "dark",
      "mori.liveIntake.session.abc": { rows: [] },
      "mori.sessionImports.sess-1": { imports: [] },
      "mori.sessionMemory.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    const report = await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    // Live intake is a derived index and moves in R5 with its own shape;
    // preferences stay in localStorage by classification. A legacy import
    // array is adopted entry by entry, so one that is not an array is counted
    // unreadable rather than copied. (The V004 table was never written by the
    // app, so imports are a durable-document class.)
    expect(report.scanned).toBe(2);
    expect(report.unreadable).toBe(1);
    expect(saved).toHaveLength(1);
  });

  it("adopts imported transcripts, legacy import arrays entry by entry", async () => {
    const storage = storageWith({
      "mori.sessionImportEntry.sess-1.imp-a": { id: "imp-a", sessionId: "sess-1", savedAt: "2026-08-02T00:00:00.000Z", events: [] },
      "mori.sessionImports.sess-2": [
        { id: "imp-b", sessionId: "sess-2", savedAt: "2026-08-03T00:00:00.000Z", events: [] },
        { id: "imp-c", sessionId: "sess-2", savedAt: "2026-08-04T00:00:00.000Z", events: [] },
      ],
    });
    const { mirrorTarget, saved } = target();

    await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    const owners = saved.map((row) => `${row.kind} ${row.ownerId}`).sort();
    expect(owners).toEqual([
      "session_import sess-1.imp-a",
      "session_import sess-2.imp-b",
      "session_import sess-2.imp-c",
    ]);
  });

  it("does not adopt a legacy array entry twice when its per-entry key exists", async () => {
    const storage = storageWith({
      "mori.sessionImportEntry.sess-2.imp-b": { id: "imp-b", sessionId: "sess-2", savedAt: "2026-08-05T00:00:00.000Z", events: [] },
      "mori.sessionImports.sess-2": [{ id: "imp-b", sessionId: "sess-2", savedAt: "2026-08-03T00:00:00.000Z", events: [] }],
    });
    const { mirrorTarget, saved } = target();
    await adoptDurableDocuments({ storage, target: mirrorTarget, now });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.updatedAt).toBe("2026-08-05T00:00:00.000Z");
  });

  // Excluded by the shape of the prefixes rather than by a rule, which is
  // exactly the kind of correctness that goes quiet. It holds a byte-identical
  // copy of a per-session draft, so adopting it would store the same session
  // twice under an owner id that is not a session id.
  it("does not adopt the current-session pointer as a session draft", async () => {
    const storage = storageWith({
      "mori.currentSessionDraft": { session: { id: "sess-1" }, savedAt: "2026-08-01T00:00:00.000Z" },
      "mori.sessionDraft.sess-1": { session: { id: "sess-1" }, savedAt: "2026-08-01T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    const report = await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    expect(report.scanned).toBe(1);
    expect(saved.map((row) => `${row.kind} ${row.ownerId}`)).toEqual(["session_draft sess-1"]);
  });

  it("adopts every draft class R3 promotes", async () => {
    const storage = storageWith({
      "mori.sessionDraft.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
      "mori.sessionPendingReview.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
      "mori.packageDraft.pkg-1": { savedAt: "2026-08-01T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    expect(saved.map((row) => `${row.kind} ${row.ownerId}`).sort()).toEqual([
      "package_draft pkg-1",
      "pending_review sess-1",
      "session_draft sess-1",
    ]);
  });

  it("skips an unparseable value without failing the pass", async () => {
    const storage = storageWith({
      "mori.sessionMemory.broken": "{not json",
      "mori.sessionMemory.fine": { savedAt: "2026-08-01T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    const report = await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    expect(report).toMatchObject({ scanned: 2, written: 1, unreadable: 1, stoppedBecause: null });
    expect(saved).toHaveLength(1);
    // Nothing is deleted, so the unreadable value is still there to inspect.
    expect(storage.getItem("mori.sessionMemory.broken")).toBe("{not json");
  });

  // Idempotence is what makes "resume" and "start over" the same operation,
  // which is why the pass carries no progress ledger.
  it("produces the identical result when run twice", async () => {
    const entries = {
      "mori.sessionMemory.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
      "mori.sessionAnalysis.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
    };
    const first = target();
    await adoptDurableDocuments({ storage: storageWith(entries), target: first.mirrorTarget, now });
    const second = target();
    const storage = storageWith(entries);
    await adoptDurableDocuments({ storage, target: second.mirrorTarget, now });
    await adoptDurableDocuments({ storage, target: second.mirrorTarget, now });

    // Same rows, and the repeat writes the same keys again rather than new ones.
    expect(second.saved.map((row) => `${row.kind} ${row.ownerId}`)).toEqual([
      ...first.saved.map((row) => `${row.kind} ${row.ownerId}`),
      ...first.saved.map((row) => `${row.kind} ${row.ownerId}`),
    ]);
  });

  it("stops at the first failing batch and leaves the pass unfinished", async () => {
    const entries: Record<string, unknown> = {};
    for (let index = 0; index < 120; index += 1) {
      entries[`mori.sessionMemory.sess-${index}`] = { savedAt: "2026-08-01T00:00:00.000Z" };
    }
    const storage = storageWith(entries);
    const { mirrorTarget, saved } = target(1);

    const report = await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    // A full disk fails every write that follows, so pushing on would produce
    // a hundred identical failures and delay the report.
    expect(report.stoppedBecause).toBe("disk full");
    expect(saved).toHaveLength(50);
    // Not marked done, so the next launch runs it again from the start.
    expect(hasAdopted(storage)).toBe(false);
  });

  it("marks itself done only after a clean pass", async () => {
    const storage = storageWith({
      "mori.sessionMemory.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
    });
    expect(hasAdopted(storage)).toBe(false);

    await adoptDurableDocuments({ storage, target: target().mirrorTarget, now });

    expect(hasAdopted(storage)).toBe(true);
    expect(storage.getItem(ADOPTION_MARKER_KEY)).toBe("2026-08-18T10:00:00.000Z");
  });

  // The race the pass would otherwise lose: a save landing between the scan
  // and the write puts a newer document in SQLite, and a later chunk would
  // replace it with the older scanned copy, leaving localStorage ahead with
  // nothing reporting it.
  it("leaves an owner alone when SQLite already holds something newer", async () => {
    const storage = storageWith({
      "mori.sessionMemory.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
      "mori.sessionMemory.sess-2": { savedAt: "2026-08-01T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    const report = await adoptDurableDocuments({
      storage,
      target: mirrorTarget,
      now,
      listExisting: async (kind) =>
        kind === "memory_body"
          ? [
              {
                kind: "memory_body",
                ownerId: "sess-1",
                schemaVersion: 1,
                bodyJson: "{}",
                updatedAt: "2026-08-15T00:00:00.000Z",
              },
            ]
          : [],
    });

    expect(report).toMatchObject({ scanned: 2, written: 1, skippedFresher: 1 });
    expect(saved.map((row) => row.ownerId)).toEqual(["sess-2"]);
  });

  it("still adopts when SQLite holds an older copy", async () => {
    const storage = storageWith({
      "mori.sessionMemory.sess-1": { savedAt: "2026-08-20T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    const report = await adoptDurableDocuments({
      storage,
      target: mirrorTarget,
      now,
      listExisting: async (kind) =>
        kind === "memory_body"
          ? [
              {
                kind: "memory_body",
                ownerId: "sess-1",
                schemaVersion: 1,
                bodyJson: "{}",
                updatedAt: "2026-08-01T00:00:00.000Z",
              },
            ]
          : [],
    });

    expect(report).toMatchObject({ written: 1, skippedFresher: 0 });
    expect(saved).toHaveLength(1);
  });

  it("stops rather than guessing when it cannot read what SQLite holds", async () => {
    const storage = storageWith({
      "mori.sessionMemory.sess-1": { savedAt: "2026-08-01T00:00:00.000Z" },
    });
    const { mirrorTarget, saved } = target();

    const report = await adoptDurableDocuments({
      storage,
      target: mirrorTarget,
      now,
      listExisting: async () => {
        throw new Error("database is locked");
      },
    });

    // Proceeding blind would risk overwriting fresher documents, which is the
    // one outcome this pass must not have.
    expect(report.stoppedBecause).toBe("database is locked");
    expect(saved).toEqual([]);
    expect(hasAdopted(storage)).toBe(false);
  });

  it("adopts the app-scoped mappings under the reserved owner", async () => {
    const storage = storageWith({
      "mori.projectConnections.v1": [{ key: "mori" }],
      "mori.userProjects.v1": [{ key: "mori", created: true }],
    });
    const { mirrorTarget, saved } = target();

    await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    // An owner derived from the suffix of an exact key would be the empty
    // string, which would collide with any document written from an unset id.
    expect(saved.map((row) => `${row.kind} ${row.ownerId}`).sort()).toEqual([
      "project_connections @app",
      "user_projects @app",
    ]);
  });

  it("stamps an app-scoped mapping with the clock, having no savedAt of its own", async () => {
    const storage = storageWith({ "mori.userProjects.v1": [{ key: "mori" }] });
    const { mirrorTarget, saved } = target();

    await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    // The mappings are stored as bare arrays with no envelope, so there is no
    // savedAt to carry and the pass time is the honest answer.
    expect(saved[0].updatedAt).toBe("2026-08-18T10:00:00.000Z");
  });

  it("treats a body with no schema version as the first version", async () => {
    const storage = storageWith({ "mori.sessionMemory.old": { issues: [] } });
    const { mirrorTarget, saved } = target();

    await adoptDurableDocuments({ storage, target: mirrorTarget, now });

    // Records predating the versioned envelope are exactly the old data this
    // pass exists for, so a missing version is not a reason to skip them.
    expect(saved[0].schemaVersion).toBe(1);
    expect(saved[0].updatedAt).toBe("2026-08-18T10:00:00.000Z");
  });
});

describe("adoption on every launch", () => {
  const draft = (title: string) => ({ session: { id: "s1", title }, savedAt: "2026-08-01T00:00:00.000Z" });
  const held = (kind: string, ownerId: string, body: unknown, updatedAt: string) => async (k: string) =>
    k === kind ? [{ kind, ownerId, schemaVersion: 1, bodyJson: JSON.stringify(body), updatedAt }] : [];

  it("repairs an edit that kept its date when its mirror write was lost", async () => {
    const storage = storageWith({ "mori.sessionDraft.s1": draft("renamed") });
    const { mirrorTarget, saved } = target();
    await adoptDurableDocuments({
      storage,
      target: mirrorTarget,
      now,
      listExisting: held("session_draft", "s1", draft("old title"), "2026-08-01T00:00:00.000Z") as never,
    });
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0]!.bodyJson).session.title).toBe("renamed");
  });

  it("leaves a document SQLite already holds unchanged", async () => {
    const storage = storageWith({ "mori.sessionDraft.s1": draft("same") });
    const { mirrorTarget, saved } = target();
    const report = await adoptDurableDocuments({
      storage,
      target: mirrorTarget,
      now,
      listExisting: held("session_draft", "s1", draft("same"), "2026-08-01T00:00:00.000Z") as never,
    });
    expect(saved).toHaveLength(0);
    expect(report.skippedFresher).toBe(1);
  });

  it("does not let an undated local mapping replace the one SQLite holds", async () => {
    const storage = storageWith({ "mori.userProjects.v1": [{ key: "stale" }] });
    const { mirrorTarget, saved } = target();
    await adoptDurableDocuments({
      storage,
      target: mirrorTarget,
      now,
      listExisting: held("user_projects", "@app", [{ key: "restored" }], "2026-08-01T00:00:00.000Z") as never,
    });
    expect(saved).toHaveLength(0);
  });

  it("copies a mapping whose recorded save time is newer than SQLite's", async () => {
    const storage = storageWith({ "mori.userProjects.v1": [{ key: "newer" }] });
    const { mirrorTarget, saved } = target();
    await adoptDurableDocuments({
      storage,
      target: mirrorTarget,
      now,
      listExisting: held("user_projects", "@app", [{ key: "older" }], "2026-08-01T00:00:00.000Z") as never,
      savedAtOf: () => "2026-08-02T00:00:00.000Z",
    });
    expect(saved).toHaveLength(1);
  });
});
