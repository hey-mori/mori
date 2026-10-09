/**
 * Builds the desktop document mirror, and holds the one instance in use.
 *
 * Browser mode gets `null` and no wrapper: there is no SQLite there, so a
 * mirror would be a queue that fails on every write. That is also why this
 * lives apart from `DocumentMirror` itself, which is pure and runtime-blind so
 * it can be tested without Tauri.
 *
 * The instance is kept module-level so its health is readable. A counter with
 * no reader is the exact mistake this program is unwinding: `fellBack` was
 * returned honestly by every kernel call and inspected by nobody until R0.
 */
import { isTauriRuntime, tauriCommands } from "../desktop";
import { APP_SCOPED_OWNER, type DurableDocumentKind } from "../sqlite/durableDocumentRows";
import { DocumentMirror, type MirrorHealth, type PendingDeleteLedger } from "./documentMirror";
import type { KeyValueStorage } from "./storageTypes";

/** Device-local bookkeeping: when each app-scoped document was last saved. */
export const APP_SCOPED_SAVED_AT_KEY = "mori.appScopedSavedAt.v1";

function recordAppScopedSavedAt(storage: KeyValueStorage, kind: DurableDocumentKind, savedAt: string): void {
  try {
    const map = JSON.parse(storage.getItem(APP_SCOPED_SAVED_AT_KEY) ?? "{}") as Record<string, string>;
    map[kind] = savedAt;
    storage.setItem(APP_SCOPED_SAVED_AT_KEY, JSON.stringify(map));
  } catch {
    // Without the record the adoption pass only fills a missing row.
  }
}

/** When the app-scoped document of `kind` was last saved here, if recorded. */
export function appScopedSavedAt(storage: KeyValueStorage, kind: DurableDocumentKind): string | null {
  try {
    const map = JSON.parse(storage.getItem(APP_SCOPED_SAVED_AT_KEY) ?? "{}") as Record<string, unknown>;
    const value = map[kind];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Device-local bookkeeping: deletes not yet confirmed by SQLite. */
export const PENDING_DELETES_KEY = "mori.mirror.pendingDeletes.v1";

type Pending = Record<string, { kind: DurableDocumentKind; ownerId: string }>;

function readPending(storage: KeyValueStorage): Pending {
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_DELETES_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Pending) : {};
  } catch {
    return {};
  }
}

/** The ledger over a storage (raw localStorage: it must survive a quit). */
export function pendingDeleteLedger(storage: KeyValueStorage): PendingDeleteLedger {
  const update = (change: (pending: Pending) => void) => {
    const pending = readPending(storage);
    change(pending);
    try {
      if (Object.keys(pending).length === 0) storage.removeItem(PENDING_DELETES_KEY);
      else storage.setItem(PENDING_DELETES_KEY, JSON.stringify(pending));
    } catch {
      // A full store: the delete still runs; only its replay is lost.
    }
  };
  return {
    add: (kind, ownerId) => update((pending) => void (pending[`${kind} ${ownerId}`] = { kind, ownerId })),
    clear: (kind, ownerId) => update((pending) => void delete pending[`${kind} ${ownerId}`]),
  };
}

/**
 * Replay the deletes an earlier run recorded and SQLite never confirmed.
 * Run before the read source is decided, so a deleted row is gone before
 * anything can be served from it. Returns how many are still pending.
 */
export async function replayPendingDeletes(
  storage: KeyValueStorage,
  deleteDocument: (kind: DurableDocumentKind, ownerId: string) => Promise<unknown>,
): Promise<number> {
  const ledger = pendingDeleteLedger(storage);
  let left = 0;
  for (const { kind, ownerId } of Object.values(readPending(storage))) {
    try {
      await deleteDocument(kind, ownerId);
      ledger.clear(kind, ownerId);
    } catch {
      left += 1;
    }
  }
  return left;
}

let active: DocumentMirror | null = null;

/**
 * The one mirror for this process, created on first use.
 *
 * Shared rather than per-caller because two different kinds of writer need it:
 * the draft repository decorator, and the free functions that persist the
 * project mappings. Two mirrors would mean two coalescing queues, and the
 * per-key ordering guarantee only holds within one queue.
 */
export function getDesktopDocumentMirror(): DocumentMirror | null {
  if (!isTauriRuntime()) return null;
  if (!active) {
    active = new DocumentMirror(
      {
        saveDocuments: (documents) => tauriCommands.saveDurableDocumentRows(documents),
        deleteDocument: (kind, ownerId) => tauriCommands.deleteDurableDocumentRow(kind, ownerId),
      },
      pendingDeleteLedger(window.localStorage),
    );
  }
  return active;
}

/** Kept as the name the repository wiring already uses. */
export const createDesktopDocumentMirror = getDesktopDocumentMirror;

/**
 * Mirror one of the app-scoped documents: a single row for the whole install
 * rather than one per session.
 *
 * A no-op in browser mode, so a caller can write unconditionally.
 */
export function mirrorAppScopedDocument<T>(
  kind: DurableDocumentKind,
  body: T,
  updatedAt: string,
): void {
  // The app-scoped bodies are bare arrays with no `savedAt` of their own; the
  // launch-time adoption dates the local copy by this record instead.
  if (isTauriRuntime()) recordAppScopedSavedAt(window.localStorage, kind, updatedAt);
  getDesktopDocumentMirror()?.write({
    kind,
    ownerId: APP_SCOPED_OWNER,
    schemaVersion: 1,
    body,
    updatedAt,
  });
}

/**
 * How far the SQLite copy is from localStorage on this device, or `null` in
 * browser mode where the question does not apply.
 *
 * `failed > 0` means SQLite is missing a write localStorage has, which is the
 * condition R6 must refuse to flip reads under.
 */
export function getDocumentMirrorHealth(): MirrorHealth | null {
  return active?.getHealth() ?? null;
}

/** Test seam: forget the instance so a case can build its own. */
export function resetDesktopDocumentMirror(): void {
  active = null;
}
