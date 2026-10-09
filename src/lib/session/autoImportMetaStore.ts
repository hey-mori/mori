/**
 * Reopen-descriptor store for auto-imported sessions.
 *
 * Auto-import registers a metadata-only draft (cheap, no body). To load the
 * real transcript when the user clicks the row, we need the original discovery
 * meta (its importKind + source path). We persist that meta keyed by the stable
 * auto session id, so a click can resolve `getAgentWorkSession(meta)` on demand.
 *
 * Two copies, deliberately not one document:
 * - **The local map** (`mori.autoImport.v1`): the device's recent-discovery
 *   cache, capped at MAX entries by activity, except the sessions a caller
 *   protects (Mori keeps an archive, a passage or an import of them).
 * - **The durable descriptors** (desktop): one SQLite document per session,
 *   kind `reopen_descriptor`, so a restored storage folder can open what it
 *   preserved. Written per entry on every upsert; deleted only by an explicit
 *   removal (prune) or a cap eviction of an unprotected session. A partial or
 *   empty local map therefore never shrinks them.
 *
 * Reads merge the two, newest activity winning per session (the local copy on
 * a tie): after a restore the durable copy is all there is; on a working
 * device the local copy is at least as new.
 */
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import type { SqliteDurableDocumentRow } from "../sqlite/durableDocumentRows";
import { getAppStorage } from "../storage/appStorage";
import { getDesktopDocumentMirror } from "../storage/desktopDocumentMirror";
import { AUTO_IMPORT_META_KEY, autoImportedSessionId } from "./autoImportSessions";

type MetaMap = Record<string, AgentWorkSessionMeta>;

/** Bound the local map (the per-session drafts are bounded separately by the
 *  poll's recency cap + prune). */
const MAX_METAS = 1000;
const DESCRIPTOR_VERSION = 1;

/** The durable descriptors as loaded at startup and kept current by writes. */
let durable: MetaMap = {};
/** Sessions whose descriptor the cap must keep, as last reported by the poll. */
let lastProtected: ReadonlySet<string> = new Set();

function storage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  return getAppStorage();
}

function isMeta(value: unknown): value is AgentWorkSessionMeta {
  return Boolean(value && typeof (value as AgentWorkSessionMeta).id === "string");
}

/**
 * The local map, or `{}` when absent. A stored value that cannot be read is
 * set aside under a dated key (kept, never deleted) and reported, so it
 * neither blocks every later write nor gets silently replaced.
 */
function readLocal(store: Pick<Storage, "getItem" | "setItem" | "removeItem">): MetaMap {
  const raw = store.getItem(AUTO_IMPORT_META_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as MetaMap;
  } catch {
    // fall through
  }
  try {
    store.setItem(`${AUTO_IMPORT_META_KEY}.unreadable.${Date.now()}`, raw);
    store.removeItem(AUTO_IMPORT_META_KEY);
  } catch {
    // Cannot set it aside: leave it, and write nothing over it.
    throw new Error("reopen descriptors unreadable and could not be set aside");
  }
  console.warn("[reopen-descriptors] local map unreadable; set aside, durable copies still serve");
  return {};
}

function activity(meta: AgentWorkSessionMeta): number {
  const stamp = meta.updatedAt || meta.startedAt || "";
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? 0 : ms;
}

function merged(): MetaMap {
  const store = storage();
  let local: MetaMap = {};
  if (store) {
    try {
      local = readLocal(store);
    } catch {
      local = {};
    }
  }
  const out: MetaMap = { ...durable };
  for (const [id, meta] of Object.entries(local)) {
    const other = out[id];
    if (!other || activity(meta) >= activity(other)) out[id] = meta;
  }
  return out;
}

function mirrorDescriptor(sessionId: string, meta: AgentWorkSessionMeta): void {
  durable[sessionId] = meta;
  getDesktopDocumentMirror()?.write({
    kind: "reopen_descriptor",
    ownerId: sessionId,
    schemaVersion: DESCRIPTOR_VERSION,
    body: meta,
    updatedAt: new Date(activity(meta) || Date.now()).toISOString(),
  });
}

function dropDescriptor(sessionId: string): void {
  delete durable[sessionId];
  getDesktopDocumentMirror()?.remove("reopen_descriptor", sessionId);
}

/**
 * Take the durable descriptors read at startup (desktop), and copy to SQLite
 * every local descriptor it lacks or holds older: the adoption of devices
 * that kept descriptors only in localStorage, and the repair of a mirror
 * write lost at a quit. Non-destructive: nothing local is removed.
 */
export function adoptReopenDescriptors(rows: readonly SqliteDurableDocumentRow[]): { adopted: number } {
  durable = {};
  for (const row of rows) {
    try {
      const body = JSON.parse(row.bodyJson) as unknown;
      if (isMeta(body)) durable[row.ownerId] = body;
    } catch {
      // An unreadable row is skipped, not deleted.
    }
  }
  const store = storage();
  let local: MetaMap = {};
  if (store) {
    try {
      local = readLocal(store);
    } catch {
      local = {};
    }
  }
  let adopted = 0;
  for (const [id, meta] of Object.entries(local)) {
    if (!isMeta(meta)) continue;
    const held = durable[id];
    if (held && activity(held) >= activity(meta) && JSON.stringify(held) === JSON.stringify(meta)) continue;
    if (held && activity(held) > activity(meta)) continue;
    mirrorDescriptor(id, meta);
    adopted += 1;
  }
  return { adopted };
}

/** The poll's current protected set, used when a caller passes none. */
export function setProtectedDescriptorIds(ids: ReadonlySet<string>): void {
  lastProtected = ids;
}

/** Every reopen meta known here (used to seed the auto-import "seen" set). */
export function loadAutoImportMetas(): AgentWorkSessionMeta[] {
  return Object.values(merged()).filter(isMeta);
}

/** The reopen meta for one auto session id, or null if not registered here. */
export function loadAutoImportMeta(sessionId: string): AgentWorkSessionMeta | null {
  return merged()[sessionId] ?? null;
}

/** Upsert reopen metas for a batch of just-registered sessions, capped by
 *  recency among the unprotected ones. */
export function upsertAutoImportMetas(
  metas: readonly AgentWorkSessionMeta[],
  options: { protectedIds?: ReadonlySet<string> } = {},
): void {
  const store = storage();
  if (!store || metas.length === 0) return;
  let map: MetaMap;
  try {
    map = readLocal(store);
  } catch {
    return;
  }
  for (const meta of metas) {
    const id = autoImportedSessionId(meta);
    map[id] = meta;
    mirrorDescriptor(id, meta);
  }

  const protectedIds = options.protectedIds ?? lastProtected;
  let entries = Object.entries(map);
  if (entries.length > MAX_METAS) {
    // Protected descriptors never count against the cap: losing one would
    // leave a kept archive or import with no way to reopen it.
    const kept = entries.filter(([id]) => protectedIds.has(id));
    const rest = entries
      .filter(([id]) => !protectedIds.has(id))
      .sort((a, b) => activity(b[1]) - activity(a[1]));
    const room = Math.max(0, MAX_METAS - kept.length);
    for (const [id] of rest.slice(room)) dropDescriptor(id);
    entries = [...kept, ...rest.slice(0, room)];
  }
  try {
    store.setItem(AUTO_IMPORT_META_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota exceeded: the local cache keeps its previous state; the durable
    // descriptors above were still written.
  }
}

/** Drop the reopen descriptor for one auto session (called when its placeholder
 *  is pruned, so a stale meta does not linger). */
export function removeAutoImportMeta(sessionId: string): void {
  dropDescriptor(sessionId);
  const store = storage();
  if (!store) return;
  let map: MetaMap;
  try {
    map = readLocal(store);
  } catch {
    return;
  }
  if (!(sessionId in map)) return;
  delete map[sessionId];
  try {
    store.setItem(AUTO_IMPORT_META_KEY, JSON.stringify(map));
  } catch {
    // Best-effort; a failed prune-write just leaves the stale entry.
  }
}

/** Forget the durable copies held in memory (a full reset wiped SQLite). */
export function forgetReopenDescriptors(): void {
  durable = {};
  lastProtected = new Set();
}

/** Sources a complete read proved empty in the latest poll, keyed by auto
 *  session id. Not registered anywhere else, so this is what keeps them counted
 *  ("내용 없는 세션 N개") instead of silently gone. */
export const AUTO_IMPORT_EMPTY_SOURCES_KEY = "mori.autoImport.emptySources.v1";

type EmptySource = { label: string; agentId: string };

/** Replace the empty-source list with the latest poll's: it is the current
 *  observation, so a source that gained content simply drops out of it. */
export function replaceEmptySources(metas: readonly AgentWorkSessionMeta[]): void {
  const store = storage();
  if (!store) return;
  const map: Record<string, EmptySource> = {};
  for (const meta of metas) {
    map[autoImportedSessionId(meta)] = {
      label: meta.projectPath || meta.projectName || "",
      agentId: meta.agentId,
    };
  }
  try {
    store.setItem(AUTO_IMPORT_EMPTY_SOURCES_KEY, JSON.stringify(map));
  } catch {
    // Best-effort coverage note; a failed write leaves the previous count.
  }
}

/** The project labels of the empty sources the latest poll saw. */
export function loadEmptySourceLabels(): string[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(AUTO_IMPORT_EMPTY_SOURCES_KEY) ?? "{}") as Record<string, EmptySource>;
    if (!parsed || typeof parsed !== "object") return [];
    return Object.values(parsed)
      .map((entry) => (entry && typeof entry.label === "string" ? entry.label : ""))
      .filter((label) => label.length > 0);
  } catch {
    return [];
  }
}
