/**
 * Row shape for the `intake_requests` table (migration `V010`).
 *
 * R5 of `docs/design/sqlite-source-of-truth-promotion.md` §7. The table and
 * this bridge land first and nothing reads them yet, mirroring R1.
 *
 * Its own table rather than a `durable_documents` row because intake is read
 * per project as well as per session, and V009's note says a kind earns a
 * table exactly when it must be found by something other than its owner.
 *
 * The four columns beside `rowJson` are copies of fields inside it. That
 * duplication is deliberate and one-directional: `rowJson` is the record, the
 * columns exist only so SQLite can filter and order without deserialising.
 */
import type { IntakeRequestRow } from "../live-intake/intakeTypes";

export type SqliteIntakeRequestRow = {
  id: string;
  sessionKey: string;
  projectPath: string;
  startedAt: string;
  rowJson: string;
};

export type SqliteIntakeWriteResult = {
  rowsWritten: number;
};

export function toSqliteIntakeRow(row: IntakeRequestRow): SqliteIntakeRequestRow {
  return {
    id: row.id,
    sessionKey: row.sessionKey,
    projectPath: row.projectPath,
    startedAt: row.startedAt,
    rowJson: JSON.stringify(row),
  };
}

/**
 * Rebuild the row, or `null` when the stored JSON cannot be read.
 *
 * Null rather than a throw, and safe here in a way it would not be for durable
 * content: intake is a derived index, so a row that cannot be read is not lost
 * work, it is a row the next observation re-derives from the locator.
 */
export function fromSqliteIntakeRow(row: SqliteIntakeRequestRow): IntakeRequestRow | null {
  try {
    return JSON.parse(row.rowJson) as IntakeRequestRow;
  } catch {
    return null;
  }
}
