import { describe, expect, it } from "vitest";
import {
  DIAGNOSTICS_STORAGE_KEY,
  appendDiagnosticsEntry,
  buildDiagnosticsReport,
  clearDiagnosticsEntries,
  describeThrown,
  readDiagnosticsEntries,
  type DiagnosticsEntry,
} from "./diagnosticsLog";

function memoryStorage() {
  const map = new Map<string, string>();
  let failsLeft = 0;
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failsLeft > 0) {
        failsLeft -= 1;
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      }
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    /** Arm the next `n` writes to fail with a quota error. */
    failNext: (n: number) => {
      failsLeft = n;
    },
  };
}

function entry(message: string): DiagnosticsEntry {
  return { at: "2026-07-12T00:00:00.000Z", kind: "error", message };
}

describe("diagnosticsLog", () => {
  it("appends newest-last and reads back", () => {
    const storage = memoryStorage();
    appendDiagnosticsEntry(storage, entry("first"));
    appendDiagnosticsEntry(storage, entry("second"));
    const entries = readDiagnosticsEntries(storage);
    expect(entries.map((e) => e.message)).toEqual(["first", "second"]);
  });

  it("caps the log by dropping the oldest entries", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 5; i += 1) {
      appendDiagnosticsEntry(storage, entry(`m${i}`), 3);
    }
    expect(readDiagnosticsEntries(storage).map((e) => e.message)).toEqual([
      "m2",
      "m3",
      "m4",
    ]);
  });

  it("halves the log on a failed write and never throws", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 4; i += 1) {
      appendDiagnosticsEntry(storage, entry(`seed${i}`), 4);
    }
    storage.failNext(1);
    appendDiagnosticsEntry(storage, entry("after-quota"), 4);
    // The failed write retried with the newer half: floor(4/2) = 2 entries.
    expect(readDiagnosticsEntries(storage).map((e) => e.message)).toEqual([
      "seed3",
      "after-quota",
    ]);
  });

  it("gives up silently when even the halved retry fails", () => {
    const storage = memoryStorage();
    appendDiagnosticsEntry(storage, entry("kept"));
    storage.failNext(2);
    expect(() => appendDiagnosticsEntry(storage, entry("lost"))).not.toThrow();
    expect(readDiagnosticsEntries(storage).map((e) => e.message)).toEqual(["kept"]);
  });

  it("survives corrupted stored JSON", () => {
    const storage = memoryStorage();
    storage.setItem(DIAGNOSTICS_STORAGE_KEY, "{not json");
    expect(readDiagnosticsEntries(storage)).toEqual([]);
  });

  it("clears best-effort", () => {
    const storage = memoryStorage();
    appendDiagnosticsEntry(storage, entry("x"));
    clearDiagnosticsEntries(storage);
    expect(readDiagnosticsEntries(storage)).toEqual([]);
  });

  it("builds a schema-tagged report from pure inputs", () => {
    const report = buildDiagnosticsReport({
      entries: [entry("boom")],
      exportedAt: "2026-07-12T09:00:00.000Z",
      appVersion: "0.1.0",
      userAgent: "test-agent",
      platform: "darwin",
    });
    expect(report.schema).toBe("mori.diagnostics.report.v1");
    expect(report.entryCount).toBe(1);
    expect(report.app.version).toBe("0.1.0");
  });

  it("describes thrown values of any shape", () => {
    const fromError = describeThrown(new TypeError("bad"));
    expect(fromError.message).toBe("TypeError: bad");
    expect(fromError.stack).toBeTruthy();
    expect(describeThrown("plain").message).toBe("plain");
    expect(describeThrown({ a: 1 }).message).toBe('{"a":1}');
  });
});

describe("buildDiagnosticsReport storage field", () => {
  const base = {
    entries: [],
    exportedAt: "2026-08-18T09:00:00.000Z",
    appVersion: "0.1.0",
    userAgent: "test",
    platform: "desktop",
  };

  it("omits the storage field entirely when the device is resting normally", () => {
    const report = buildDiagnosticsReport(base);
    // Absent means normal, so a reader must not have to distinguish "fine"
    // from "not measured".
    expect("storage" in report).toBe(false);
  });

  it("records where the data actually went when it fell back", () => {
    const report = buildDiagnosticsReport({
      ...base,
      storage: {
        fellBackTo: "browser-local-storage",
        scope: "kernel",
        reason: "database is locked",
        at: "2026-08-18T08:59:00.000Z",
      },
    });
    expect(report.storage?.fellBackTo).toBe("browser-local-storage");
    expect(report.storage?.reason).toBe("database is locked");
  });
});
