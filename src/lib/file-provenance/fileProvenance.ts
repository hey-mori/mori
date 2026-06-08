/**
 * File provenance derivations.
 *
 * `SourceRef.fileTouches` is a faithful, ordered log of every file an agent's
 * tool calls touched (one entry per touch). That raw log is the source of
 * truth; the user-facing question is different: "which files did this session
 * use, how did each change, and where are they now?" These pure helpers answer
 * it without any I/O.
 *
 *  - {@link rollUpFileTouches} folds the touch log into one entry per file.
 *  - {@link reconcileFileProvenance} merges those entries with already-resolved
 *    filesystem locations so the UI can show present / moved / missing and
 *    offer "open" or "open where it moved to".
 *
 * Filesystem access is async and platform-specific (a Tauri command in the
 * desktop app), so it stays out of this module: the caller resolves locations
 * and hands the map in. That keeps every derivation here pure and unit-testable
 * with a fake resolution map. See `docs/design/agent-work-visibility-vision.md`.
 */

import type { FileChangeKind, FileTouch } from "../../domain/types";

/** One file, rolled up from all the touches that named it. */
export type FileProvenanceEntry = {
  /** Absolute path exactly as recorded by the tools. */
  path: string;
  /** Basename for compact display (the segment after the last `/` or `\`). */
  fileName: string;
  /** Count of touches by kind. */
  edited: number;
  wrote: number;
  read: number;
  touched: number;
  /** `wrote + edited` — the count that means "this file was changed". */
  changeCount: number;
  /** Total touches of any kind. */
  totalCount: number;
  /** Lines added / removed across this file's changes (summed from patches). */
  additions: number;
  deletions: number;
  /** Earliest / latest non-empty timestamp seen across this file's touches. */
  firstAt: string;
  lastAt: string;
  /**
   * The headline kind for the file: `wrote` if it was ever written, else
   * `edited` if ever edited, else `read`, else `touched`. So a file that was
   * created then read reads as `wrote`, not `read`.
   */
  primaryChangeKind: FileChangeKind;
};

/** Where a recorded path resolves on the current filesystem. */
export type FileLocationStatus = "present" | "moved" | "missing" | "unknown";

export type FileLocationResolution = {
  status: FileLocationStatus;
  /** The file's current path when `status` is `moved`. */
  currentPath?: string;
};

/**
 * One resolved location keyed by the recorded path. Mirrors the Rust
 * `FileLocation` returned by the `resolve_file_locations` command. The desktop
 * bridge folds a list of these into a `Record<path, FileLocationResolution>`
 * for {@link reconcileFileProvenance} via {@link toResolutionMap}.
 */
export type ResolvedFileLocation = {
  path: string;
  status: FileLocationStatus;
  currentPath?: string;
};

/** Fold resolver output into the lookup {@link reconcileFileProvenance} wants. */
export function toResolutionMap(
  locations: readonly ResolvedFileLocation[],
): Record<string, FileLocationResolution> {
  const map: Record<string, FileLocationResolution> = {};
  for (const location of locations) {
    map[location.path] = location.currentPath
      ? { status: location.status, currentPath: location.currentPath }
      : { status: location.status };
  }
  return map;
}

/** A provenance entry merged with its current filesystem location. */
export type ReconciledFileEntry = FileProvenanceEntry & {
  location: FileLocationResolution;
  /** The path to open: `currentPath` when moved, else the recorded `path`. */
  openPath: string;
};

/**
 * Fold a faithful touch log into one entry per file.
 *
 * Files are returned changed-first (by `changeCount`), then by total touches,
 * then alphabetically by path, so the most-worked files lead and read-only
 * consults sink. Touches with an empty path are ignored. The input is never
 * mutated.
 */
export function rollUpFileTouches(touches: readonly FileTouch[]): FileProvenanceEntry[] {
  const byPath = new Map<string, FileProvenanceEntry>();

  for (const touch of touches) {
    const path = touch.path.trim();
    if (!path) continue;

    let entry = byPath.get(path);
    if (!entry) {
      entry = {
        path,
        fileName: baseName(path),
        edited: 0,
        wrote: 0,
        read: 0,
        touched: 0,
        changeCount: 0,
        totalCount: 0,
        additions: 0,
        deletions: 0,
        firstAt: "",
        lastAt: "",
        primaryChangeKind: "touched",
      };
      byPath.set(path, entry);
    }

    bumpKind(entry, touch.changeKind);
    entry.totalCount += 1;
    entry.additions += touch.additions ?? 0;
    entry.deletions += touch.deletions ?? 0;
    foldTimestamp(entry, touch.at);
  }

  for (const entry of byPath.values()) {
    entry.changeCount = entry.wrote + entry.edited;
    entry.primaryChangeKind = headlineKind(entry);
  }

  return [...byPath.values()].sort(compareEntries);
}

/**
 * Merge rolled-up entries with resolved filesystem locations. A path absent
 * from `resolutions` is treated as `unknown` (not assumed present), so the UI
 * never claims a file is there when it was never checked. `openPath` points at
 * the moved location when known, else the recorded path.
 */
export function reconcileFileProvenance(
  entries: readonly FileProvenanceEntry[],
  resolutions: Readonly<Record<string, FileLocationResolution>>,
): ReconciledFileEntry[] {
  return entries.map((entry) => {
    const location = resolutions[entry.path] ?? { status: "unknown" as const };
    const openPath =
      location.status === "moved" && location.currentPath
        ? location.currentPath
        : entry.path;
    return { ...entry, location, openPath };
  });
}

/** Compact counts for a header line, e.g. "파일 32개 · 변경 22 · 읽기 10". */
export type FileProvenanceSummary = {
  fileCount: number;
  changedFileCount: number;
  readOnlyFileCount: number;
  missingFileCount: number;
  movedFileCount: number;
};

export function summarizeFileProvenance(
  entries: readonly ReconciledFileEntry[],
): FileProvenanceSummary {
  let changedFileCount = 0;
  let readOnlyFileCount = 0;
  let missingFileCount = 0;
  let movedFileCount = 0;
  for (const entry of entries) {
    if (entry.changeCount > 0) changedFileCount += 1;
    else readOnlyFileCount += 1;
    if (entry.location.status === "missing") missingFileCount += 1;
    if (entry.location.status === "moved") movedFileCount += 1;
  }
  return {
    fileCount: entries.length,
    changedFileCount,
    readOnlyFileCount,
    missingFileCount,
    movedFileCount,
  };
}

/**
 * The deepest directory that contains every given file path, used as the root
 * for move detection. Works on mixed posix / windows separators. Returns `""`
 * when the paths share no common directory (e.g. different drives), in which
 * case move detection is skipped and files resolve only as present / missing.
 */
export function commonAncestorDir(paths: readonly string[]): string {
  const dirs = paths
    .map((path) => directoryOf(path.trim()))
    .filter((dir) => dir.length > 0);
  if (dirs.length === 0) return "";

  const sep = dirs[0].includes("\\") ? "\\" : "/";
  let prefix = dirs[0].split(/[/\\]/);
  for (const dir of dirs.slice(1)) {
    const segments = dir.split(/[/\\]/);
    let i = 0;
    while (i < prefix.length && i < segments.length && prefix[i] === segments[i]) i += 1;
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) return "";
  }
  return prefix.join(sep);
}

function directoryOf(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.slice(0, lastSlash) : "";
}

// ─── internals ───────────────────────────────────────────────────────────────

function bumpKind(entry: FileProvenanceEntry, kind: FileChangeKind): void {
  switch (kind) {
    case "wrote":
      entry.wrote += 1;
      break;
    case "edited":
      entry.edited += 1;
      break;
    case "read":
      entry.read += 1;
      break;
    default:
      entry.touched += 1;
      break;
  }
}

function headlineKind(entry: FileProvenanceEntry): FileChangeKind {
  if (entry.wrote > 0) return "wrote";
  if (entry.edited > 0) return "edited";
  if (entry.read > 0) return "read";
  return "touched";
}

function foldTimestamp(entry: FileProvenanceEntry, at: string): void {
  const value = at.trim();
  if (!value) return;
  if (!entry.firstAt || value < entry.firstAt) entry.firstAt = value;
  if (!entry.lastAt || value > entry.lastAt) entry.lastAt = value;
}

function baseName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

function compareEntries(a: FileProvenanceEntry, b: FileProvenanceEntry): number {
  if (b.changeCount !== a.changeCount) return b.changeCount - a.changeCount;
  if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
  return a.path.localeCompare(b.path);
}
