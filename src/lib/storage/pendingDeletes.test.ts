import { describe, expect, it } from "vitest";
import { pendingDeleteLedger, PENDING_DELETES_KEY, replayPendingDeletes } from "./desktopDocumentMirror";
import { MemoryKeyValueStorage } from "./memoryStorage";

describe("replaying deletes a quit lost", () => {
  it("deletes what is pending and keeps only what still fails", async () => {
    const storage = new MemoryKeyValueStorage();
    const ledger = pendingDeleteLedger(storage);
    ledger.add("session_draft", "s1");
    ledger.add("session_import", "s1.imp");
    const deleted: string[] = [];
    const left = await replayPendingDeletes(storage, async (kind, ownerId) => {
      if (kind === "session_import") throw new Error("busy");
      deleted.push(`${kind} ${ownerId}`);
    });
    expect(deleted).toEqual(["session_draft s1"]);
    expect(left).toBe(1);
    expect(JSON.parse(storage.getItem(PENDING_DELETES_KEY)!)).toHaveProperty(["session_import s1.imp"]);
  });
});
