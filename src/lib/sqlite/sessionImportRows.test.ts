import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import { emptyConnectorSourceImportSummary } from "../connectors";
import type { StoredSessionImport } from "../storage/storageTypes";
import {
  fromSqliteSessionImportRow,
  toSqliteSessionImportRow,
} from "./sessionImportRows";

function sessionImport(
  overrides: Partial<StoredSessionImport> = {},
): StoredSessionImport {
  return {
    id: "import-1",
    sessionId: moriMockSession.session.id,
    source: moriMockSession.sources[0]!,
    events: moriMockSession.events.slice(0, 2),
    savedAt: "2026-05-16T09:00:00Z",
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("SQLite session import row converters", () => {
  it("round-trips a session import with no importSummary", () => {
    const original = sessionImport();
    const row = toSqliteSessionImportRow(original);
    expect(row.import_summary_json).toBeNull();

    const restored = fromSqliteSessionImportRow(row);
    expect(restored.id).toBe("import-1");
    expect(restored.sessionId).toBe(moriMockSession.session.id);
    expect(restored.source).toEqual(original.source);
    expect(restored.events).toEqual(original.events);
    expect(restored.savedAt).toBe("2026-05-16T09:00:00Z");
    expect(restored.importSummary).toBeUndefined();
  });

  it("round-trips a session import that carries a connector importSummary", () => {
    const summary = {
      ...emptyConnectorSourceImportSummary(),
      status: "partialReimport" as const,
      totalValidEvents: 11,
      newEventCount: 3,
      duplicateEventCount: 8,
    };
    const original = sessionImport({ importSummary: summary });
    const row = toSqliteSessionImportRow(original);
    expect(row.import_summary_json).not.toBeNull();

    const restored = fromSqliteSessionImportRow(row);
    expect(restored.importSummary).toEqual(summary);
    expect(restored.importSummary?.newEventCount).toBe(3);
  });

  it("flattens object and array fields to JSON columns", () => {
    const row = toSqliteSessionImportRow(sessionImport());
    expect(() => JSON.parse(row.source_json)).not.toThrow();
    expect(Array.isArray(JSON.parse(row.events_json))).toBe(true);
  });
});
