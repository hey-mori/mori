import { describe, expect, it } from "vitest";
import { fromSqliteIntakeRow, toSqliteIntakeRow } from "./intakeRequestRows";
import type { IntakeRequestRow } from "../live-intake/intakeTypes";

const row: IntakeRequestRow = {
  id: "sess-1:req-3",
  sessionKey: "C:/Users/Admin/.claude/projects/mori/abc.jsonl",
  projectPath: "C:/Users/Admin/My Projects/mori app",
  sessionLabel: "mori app",
  title: "러닝 기록 화면 고치기",
  titleTruncated: false,
  startedAt: "2026-08-18T09:00:00.000Z",
  endedAt: "2026-08-18T09:04:00.000Z",
  observedAt: "2026-08-18T09:04:01.000Z",
  status: "completed",
  stepCount: 12,
  files: [],
  locator: { path: "C:/Users/Admin/.claude/projects/mori/abc.jsonl", offset: 4096 },
  version: 2,
} as unknown as IntakeRequestRow;

describe("intake request rows", () => {
  it("round-trips a row through storage", () => {
    expect(fromSqliteIntakeRow(toSqliteIntakeRow(row))).toEqual(row);
  });

  it("copies the indexed fields out as columns", () => {
    const stored = toSqliteIntakeRow(row);
    // Duplication is deliberate and one-directional: rowJson is the record,
    // the columns exist so SQLite can filter and order without deserialising.
    expect(stored.projectPath).toBe("C:/Users/Admin/My Projects/mori app");
    expect(stored.sessionKey).toBe(row.sessionKey);
    expect(stored.startedAt).toBe("2026-08-18T09:00:00.000Z");
  });

  it("keeps a project path with spaces intact", () => {
    // An earlier version of this feature joined project and file into one key
    // and split on a space, which broke on exactly these paths.
    const stored = toSqliteIntakeRow(row);
    expect(fromSqliteIntakeRow(stored)?.projectPath).toBe(row.projectPath);
  });

  it("returns null for an unreadable row rather than throwing", () => {
    // Safe here in a way it would not be for durable content: intake is a
    // derived index, so an unreadable row is one the next observation
    // re-derives from its locator, not lost work.
    expect(
      fromSqliteIntakeRow({
        id: "x",
        sessionKey: "s",
        projectPath: "p",
        startedAt: "2026-08-18T09:00:00.000Z",
        rowJson: "{broken",
      }),
    ).toBeNull();
  });
});
