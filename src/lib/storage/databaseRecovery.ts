/**
 * Pure formatting for the desktop database-recovery surface.
 *
 * When a SQLite migration fails (a checksum mismatch or a bad apply), the app
 * is in a dead end today: saves/loads silently no-op. Mori now takes an
 * automatic snapshot before every migration, and this helper turns the raw
 * backup list into calm, Korean display rows for the recovery card.
 */

import type { SqliteBackupInfo } from "../sqlite/repositoryContracts";

export type BackupDisplayRow = {
  path: string;
  fileName: string;
  /** "7월 12일 14:30": when the snapshot was taken. */
  takenAtLabel: string;
  /** "2.3 MB": human file size. */
  sizeLabel: string;
  /** What the snapshot is: taken before a migration, or the state a restore replaced. */
  kind: "beforeMigration" | "beforeRestore";
};

/** Format one backup for display. `now`-free: all inputs are on the record. */
export function toBackupDisplayRow(backup: SqliteBackupInfo): BackupDisplayRow {
  return {
    path: backup.path,
    fileName: backup.fileName,
    takenAtLabel: formatTakenAt(backup.modifiedMs),
    sizeLabel: formatBytes(backup.sizeBytes),
    kind: backup.fileName.startsWith("mori-pre-restore-") ? "beforeRestore" : "beforeMigration",
  };
}

/** Newest-first display rows. The Rust side already sorts, but we do not rely
 *  on that ordering surviving the bridge. */
export function buildBackupDisplayRows(backups: SqliteBackupInfo[]): BackupDisplayRow[] {
  return [...backups]
    .sort((a, b) => b.modifiedMs - a.modifiedMs)
    .map(toBackupDisplayRow);
}

function formatTakenAt(modifiedMs: number): string {
  if (!Number.isFinite(modifiedMs) || modifiedMs <= 0) return "시점 미상";
  const date = new Date(modifiedMs);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}월 ${day}일 ${hour}:${minute}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
