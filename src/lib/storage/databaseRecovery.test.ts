import { describe, expect, it } from "vitest";
import {
  buildBackupDisplayRows,
  toBackupDisplayRow,
} from "./databaseRecovery";
import type { SqliteBackupInfo } from "../sqlite/repositoryContracts";

function backup(overrides: Partial<SqliteBackupInfo> = {}): SqliteBackupInfo {
  return {
    path: "/Users/x/Mori/Records/backups/mori-pre-v7-1000.sqlite",
    fileName: "mori-pre-v7-1000.sqlite",
    sizeBytes: 2_400_000,
    // 2026-07-12T05:30:00Z; formatted in local time by the helper.
    modifiedMs: Date.parse("2026-07-12T05:30:00Z"),
    ...overrides,
  };
}

describe("databaseRecovery", () => {
  it("formats size in the largest sensible unit", () => {
    expect(toBackupDisplayRow(backup({ sizeBytes: 512 })).sizeLabel).toBe("512 B");
    expect(toBackupDisplayRow(backup({ sizeBytes: 2048 })).sizeLabel).toBe("2 KB");
    expect(toBackupDisplayRow(backup({ sizeBytes: 2_400_000 })).sizeLabel).toBe("2.3 MB");
  });

  it("labels a missing timestamp honestly instead of showing epoch", () => {
    expect(toBackupDisplayRow(backup({ modifiedMs: 0 })).takenAtLabel).toBe("시점 미상");
  });

  it("carries the path and file name through for the restore action", () => {
    const row = toBackupDisplayRow(backup());
    expect(row.path).toContain("mori-pre-v7-1000.sqlite");
    expect(row.fileName).toBe("mori-pre-v7-1000.sqlite");
  });

  it("orders display rows newest first regardless of input order", () => {
    const rows = buildBackupDisplayRows([
      backup({ fileName: "old", modifiedMs: 1000 }),
      backup({ fileName: "new", modifiedMs: 3000 }),
      backup({ fileName: "mid", modifiedMs: 2000 }),
    ]);
    expect(rows.map((r) => r.fileName)).toEqual(["new", "mid", "old"]);
  });

  it("tells a copy kept before a restore from a snapshot taken before a migration", () => {
    expect(toBackupDisplayRow(backup({ fileName: "mori-pre-restore-1791600000000.sqlite" })).kind).toBe("beforeRestore");
    expect(toBackupDisplayRow(backup({ fileName: "mori-pre-v12-1791600000000.sqlite" })).kind).toBe("beforeMigration");
  });
});
