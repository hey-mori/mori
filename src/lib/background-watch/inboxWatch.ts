/**
 * Inbox watch — the pure diff between two connector-inbox readings.
 *
 * The background watch hook re-reads the connector inbox listing on a cadence
 * while the app is open and the opt-in is on. This decides what actually
 * changed: a file present now but not before is `new`; a file whose size or
 * modified-time moved is `updated`; everything else is silent. Keeping it pure
 * makes the "what's new since last look" logic testable without a file system,
 * a timer, or Tauri, and keeps the hook a thin loop over it.
 */
export type InboxFileFingerprint = {
  path: string;
  modifiedAt: string;
  sizeBytes: number;
};

export type InboxChange = {
  path: string;
  kind: "new" | "updated";
};

/** Build the comparable fingerprint set from an inbox listing's files. */
export function fingerprintInbox(
  files: readonly { path: string; modifiedAt: string; sizeBytes: number }[],
): InboxFileFingerprint[] {
  return files.map((file) => ({
    path: file.path,
    modifiedAt: file.modifiedAt,
    sizeBytes: file.sizeBytes,
  }));
}

/**
 * What changed between a previous fingerprint set and the current one. A first
 * reading (no previous) reports nothing — the watch establishes a baseline
 * before it surfaces anything, so turning it on does not dump the whole inbox as
 * "new". Only additions and real modifications surface; deletions are ignored
 * (the inbox only grows in normal use, and a vanished file is not work to
 * review).
 */
export function detectInboxChanges(
  previous: readonly InboxFileFingerprint[] | null,
  current: readonly InboxFileFingerprint[],
): InboxChange[] {
  if (previous === null) return [];
  const prevByPath = new Map(previous.map((entry) => [entry.path, entry]));
  const changes: InboxChange[] = [];
  for (const file of current) {
    const before = prevByPath.get(file.path);
    if (!before) {
      changes.push({ path: file.path, kind: "new" });
    } else if (before.sizeBytes !== file.sizeBytes || before.modifiedAt !== file.modifiedAt) {
      changes.push({ path: file.path, kind: "updated" });
    }
  }
  return changes;
}
