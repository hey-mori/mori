import { describe, expect, it } from "vitest";
import {
  APP_SCOPED_OWNER,
  fromDurableDocumentRow,
  toDurableDocumentRow,
  type SqliteDurableDocumentRow,
} from "./durableDocumentRows";

type Body = { issues: string[]; note: string };

const body: Body = { issues: ["a", "b"], note: "한글 본문" };

function row(overrides: Partial<SqliteDurableDocumentRow> = {}): SqliteDurableDocumentRow {
  return {
    ...toDurableDocumentRow({
      kind: "memory_body",
      ownerId: "sess-1",
      schemaVersion: 1,
      body,
      updatedAt: "2026-08-18T09:00:00.000Z",
    }),
    ...overrides,
  };
}

describe("durable document rows", () => {
  it("round-trips a body through storage", () => {
    expect(fromDurableDocumentRow<Body>(row(), 1)).toEqual(body);
  });

  it("keeps the timestamp it was given rather than reading a clock", () => {
    // Pure, so a test does not have to freeze time and a caller decides what
    // "updated" means for its class.
    expect(row().updatedAt).toBe("2026-08-18T09:00:00.000Z");
  });

  it("refuses a body written by a newer build", () => {
    // Not an error, a null: such a body can hold fields this build would drop
    // on the next write, so it is not read at all rather than half-read.
    expect(fromDurableDocumentRow<Body>(row({ schemaVersion: 2 }), 1)).toBeNull();
  });

  it("refuses a truncated body without throwing", () => {
    // A single unreadable row must not take down a read of the rest.
    expect(fromDurableDocumentRow<Body>(row({ bodyJson: '{"issues":[' }), 1)).toBeNull();
  });

  it("gives app-scoped documents a reserved owner, not an empty string", () => {
    // So a row written from an unset id is distinguishable from a deliberate
    // singleton rather than colliding with it.
    expect(APP_SCOPED_OWNER).not.toBe("");
    expect(toDurableDocumentRow({
      kind: "project_connections",
      ownerId: APP_SCOPED_OWNER,
      schemaVersion: 1,
      body: { links: [] },
      updatedAt: "2026-08-18T09:00:00.000Z",
    }).ownerId).toBe("@app");
  });
});
