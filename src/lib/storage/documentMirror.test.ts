import { describe, expect, it } from "vitest";
import { DocumentMirror, type DocumentMirrorTarget } from "./documentMirror";
import type {
  DurableDocumentKind,
  SqliteDurableDocumentRow,
} from "../sqlite/durableDocumentRows";

type Call = { kind: string; ownerId: string; bodyJson: string };

/** A target whose writes can be held open, so ordering is observable. */
function recordingTarget() {
  const calls: Call[] = [];
  const deletes: Array<{ kind: string; ownerId: string }> = [];
  let gate: (() => void) | null = null;
  let failNext = 0;

  const target: DocumentMirrorTarget = {
    async saveDocuments(documents: SqliteDurableDocumentRow[]) {
      if (gate) {
        await new Promise<void>((resolve) => {
          gate = resolve;
        });
      }
      if (failNext > 0) {
        failNext -= 1;
        throw new Error("database is locked");
      }
      for (const document of documents) {
        calls.push({
          kind: document.kind,
          ownerId: document.ownerId,
          bodyJson: document.bodyJson,
        });
      }
    },
    async deleteDocument(kind: DurableDocumentKind, ownerId: string) {
      deletes.push({ kind, ownerId });
    },
  };

  return {
    target,
    calls,
    deletes,
    failNextWrites: (count: number) => {
      failNext = count;
    },
    hold: () => {
      gate = () => {};
    },
    release: () => {
      const resolve = gate;
      gate = null;
      resolve?.();
    },
  };
}

function write(mirror: DocumentMirror, ownerId: string, value: number) {
  mirror.write({
    kind: "memory_body",
    ownerId,
    schemaVersion: 1,
    body: { value },
    updatedAt: `2026-08-18T09:0${value}:00.000Z`,
  });
}

describe("DocumentMirror", () => {
  it("mirrors a write to the target", async () => {
    const target = recordingTarget();
    const mirror = new DocumentMirror(target.target);

    write(mirror, "sess-1", 1);
    await mirror.drain();

    expect(target.calls).toEqual([
      { kind: "memory_body", ownerId: "sess-1", bodyJson: '{"value":1}' },
    ]);
    expect(mirror.getHealth().written).toBe(1);
  });

  // The property the whole design rests on. A whole-document write makes a
  // superseded one irrelevant, so the queue may drop it, and must never let
  // it land after the newer one.
  it("keeps only the newest pending write for a key", async () => {
    const target = recordingTarget();
    const mirror = new DocumentMirror(target.target);

    target.hold();
    write(mirror, "sess-1", 1);
    write(mirror, "sess-1", 2);
    write(mirror, "sess-1", 3);
    target.release();
    await mirror.drain();

    // The first is in flight and completes; 2 is superseded by 3 before it
    // ever starts. What must never appear is 3 followed by 2.
    expect(target.calls.map((call) => call.bodyJson)).toEqual(['{"value":1}', '{"value":3}']);
  });

  it("does not let one key's queue block another", async () => {
    const target = recordingTarget();
    const mirror = new DocumentMirror(target.target);

    write(mirror, "sess-1", 1);
    write(mirror, "sess-2", 2);
    await mirror.drain();

    expect(target.calls.map((call) => call.ownerId).sort()).toEqual(["sess-1", "sess-2"]);
  });

  it("mirrors a delete", async () => {
    const target = recordingTarget();
    const mirror = new DocumentMirror(target.target);

    mirror.remove("analysis", "sess-1");
    await mirror.drain();

    expect(target.deletes).toEqual([{ kind: "analysis", ownerId: "sess-1" }]);
  });

  it("lets a later write supersede a pending delete for the same key", async () => {
    const target = recordingTarget();
    const mirror = new DocumentMirror(target.target);

    target.hold();
    write(mirror, "sess-1", 1);
    mirror.remove("memory_body", "sess-1");
    write(mirror, "sess-1", 2);
    target.release();
    await mirror.drain();

    // The delete never runs, which is right: it was undone before it started,
    // and running it would leave the mirror missing a document localStorage has.
    expect(target.deletes).toEqual([]);
    expect(target.calls.map((call) => call.bodyJson)).toEqual(['{"value":1}', '{"value":2}']);
  });

  // A failed mirror write is not a user-facing fallback while localStorage is
  // still the read source. It is the condition R6 must refuse to flip under,
  // so it has to be countable rather than only logged.
  it("counts a failure and keeps going instead of retrying", async () => {
    const target = recordingTarget();
    const mirror = new DocumentMirror(target.target);

    target.failNextWrites(1);
    write(mirror, "sess-1", 1);
    await mirror.drain();

    expect(mirror.getHealth().failed).toBe(1);
    expect(mirror.getHealth().lastFailure?.reason).toBe("database is locked");
    expect(target.calls).toEqual([]);

    write(mirror, "sess-1", 2);
    await mirror.drain();
    expect(mirror.getHealth().written).toBe(1);
  });

  it("never rejects out of a write site, since callers cannot await it", async () => {
    const mirror = new DocumentMirror({
      saveDocuments: () => Promise.reject(new Error("boom")),
      deleteDocument: () => Promise.reject(new Error("boom")),
    });

    expect(() => write(mirror, "sess-1", 1)).not.toThrow();
    await expect(mirror.drain()).resolves.toBeUndefined();
  });
});

describe("pending deletes", () => {
  function ledger() {
    const pending = new Set<string>();
    return {
      pending,
      add: (kind: string, ownerId: string) => void pending.add(`${kind} ${ownerId}`),
      clear: (kind: string, ownerId: string) => void pending.delete(`${kind} ${ownerId}`),
    };
  }

  it("keeps a delete pending until SQLite confirms it", async () => {
    const book = ledger();
    let fail = true;
    const mirror = new DocumentMirror(
      {
        saveDocuments: async () => undefined,
        deleteDocument: async () => {
          if (fail) throw new Error("db closed");
        },
      },
      book,
    );
    mirror.remove("session_draft", "s1");
    await mirror.drain();
    expect([...book.pending]).toEqual(["session_draft s1"]);
    fail = false;
    mirror.remove("session_draft", "s1");
    await mirror.drain();
    expect([...book.pending]).toEqual([]);
  });

  it("drops a pending delete that a newer write supersedes", async () => {
    const book = ledger();
    const mirror = new DocumentMirror(
      { saveDocuments: async () => undefined, deleteDocument: async () => Promise.reject(new Error("x")) },
      book,
    );
    mirror.remove("session_draft", "s1");
    await mirror.drain();
    mirror.write({ kind: "session_draft", ownerId: "s1", schemaVersion: 1, body: {}, updatedAt: "2026-01-01T00:00:00Z" });
    expect([...book.pending]).toEqual([]);
  });
});
