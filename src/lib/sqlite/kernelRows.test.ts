import { describe, expect, it } from "vitest";
import { createRecord, createSchemaRegistry } from "../record-kernel";
import type { KernelRevision } from "../record-kernel";
import {
  fromSqliteKernelObjectRow,
  fromSqliteKernelRecordRow,
  fromSqliteKernelRevisionRow,
  toSqliteKernelObjectRow,
  toSqliteKernelRecordRow,
  toSqliteKernelRevisionRow,
} from "./kernelRows";

const registry = createSchemaRegistry();

describe("kernel record row converters", () => {
  it("round-trips a record through the flat row shape losslessly", () => {
    const { record } = createRecord(
      {
        schemaId: "workout",
        title: "운동",
        body: "러닝 10분",
        origin: "user",
        occurredStart: "2026-07-14",
        contextIds: ["ctx-health"],
        properties: { durationMinutes: 10, exercises: { 러닝: { minutes: 10 } } },
      },
      registry,
    );
    const row = toSqliteKernelRecordRow(record);
    expect(row.schema_id).toBe("workout");
    expect(row.occurred_end).toBeNull();
    expect(fromSqliteKernelRecordRow(row)).toEqual(record);
  });

  it("degrades corrupted JSON columns to empty values instead of throwing", () => {
    const { record } = createRecord(
      { schemaId: "note", title: "메모", origin: "user" },
      registry,
    );
    const row = { ...toSqliteKernelRecordRow(record), context_ids_json: "{oops", properties_json: "[1]" };
    const parsed = fromSqliteKernelRecordRow(row);
    expect(parsed.contextIds).toEqual([]);
    expect(parsed.properties).toEqual({});
  });
});

describe("kernel object row converters", () => {
  it("round-trips an arbitrary payload by collection", () => {
    const context = { id: "ctx-1", type: "topic", name: "개인 연구", createdAt: "2026-07-14" };
    const row = toSqliteKernelObjectRow("context", context.id, context, "2026-07-14T09:00:00Z");
    expect(row.collection).toBe("context");
    expect(fromSqliteKernelObjectRow(row)).toEqual(context);
  });

  it("returns null for a corrupted payload", () => {
    expect(
      fromSqliteKernelObjectRow({
        collection: "context",
        id: "ctx-1",
        payload_json: "{bad",
        saved_at: "2026-07-14",
      }),
    ).toBeNull();
  });
});

describe("kernel revision row converters", () => {
  it("round-trips a revision including absent before/after", () => {
    const revision: KernelRevision = {
      id: "rev-1",
      recordId: "rec-1",
      actor: "ai",
      operation: "update",
      before: { title: "이전" },
      createdAt: "2026-07-14T09:00:00Z",
    };
    const row = toSqliteKernelRevisionRow(revision);
    expect(row.after_json).toBeNull();
    const back = fromSqliteKernelRevisionRow(row);
    expect(back.before).toEqual({ title: "이전" });
    expect(back.after).toBeUndefined();
    expect(back.actor).toBe("ai");
  });
});
