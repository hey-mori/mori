/**
 * Reopen-descriptor store for auto-imported sessions.
 *
 * Auto-import registers a metadata-only draft (cheap, no body). To load the
 * real transcript when the user clicks the row, we need the original discovery
 * meta (its importKind + source path). We persist that meta keyed by the stable
 * auto session id, so a click can resolve `getAgentWorkSession(meta)` on demand.
 * Kept small: capped to the most-recent MAX entries by activity time, except
 * the sessions a caller protects (Mori keeps an archive, a passage or an
 * import of them), whose descriptor is what reopens what was kept.
 *
 * Durable on desktop: read and written through the app storage (SQLite-backed
 * once the read flip engaged) and mirrored into SQLite as one document, so a
 * restored storage folder can still open its preserved sessions.
 */
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { getAppStorage } from "../storage/appStorage";
import { mirrorAppScopedDocument } from "../storage/desktopDocumentMirror";
import { AUTO_IMPORT_META_KEY, autoImportedSessionId } from "./autoImportSessions";

type MetaMap = Record<string, AgentWorkSessionMeta>;

/** Bound the reopen-descriptor map (this key only; the per-session drafts are
 *  bounded separately by the poll's recency cap + prune). */
const MAX_METAS = 1000;

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  return getAppStorage();
}

/** Write the map, and its SQLite copy on desktop. Throws what the write threw. */
function writeMap(store: Pick<Storage, "setItem">, map: MetaMap): void {
  store.setItem(AUTO_IMPORT_META_KEY, JSON.stringify(map));
  mirrorAppScopedDocument("auto_import_descriptors", map, new Date().toISOString());
}

function readMap(): MetaMap {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(AUTO_IMPORT_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MetaMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The map for a write: `null` when a stored map exists but cannot be read, so
 * the writer stops instead of replacing descriptors it could not see with a
 * map that holds only the new ones.
 */
function readMapForWrite(store: Pick<Storage, "getItem">): MetaMap | null {
  const raw = store.getItem(AUTO_IMPORT_META_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as MetaMap) : null;
  } catch {
    return null;
  }
}

/** Every persisted reopen meta (used to seed the auto-import "seen" set). */
export function loadAutoImportMetas(): AgentWorkSessionMeta[] {
  return Object.values(readMap()).filter(
    (meta): meta is AgentWorkSessionMeta => Boolean(meta && typeof meta.id === "string"),
  );
}

/** The reopen meta for one auto session id, or null if not registered here. */
export function loadAutoImportMeta(sessionId: string): AgentWorkSessionMeta | null {
  return readMap()[sessionId] ?? null;
}

/** Upsert reopen metas for a batch of just-registered sessions, capped by
 *  recency among the unprotected ones. */
export function upsertAutoImportMetas(
  metas: readonly AgentWorkSessionMeta[],
  options: { protectedIds?: ReadonlySet<string> } = {},
): void {
  const store = storage();
  if (!store || metas.length === 0) return;
  const map = readMapForWrite(store);
  if (!map) return;
  for (const meta of metas) {
    map[autoImportedSessionId(meta)] = meta;
  }

  let entries = Object.entries(map);
  if (entries.length > MAX_METAS) {
    // Protected descriptors never count against the cap: losing one would
    // leave a kept archive or import with no way to reopen it.
    const kept = entries.filter(([id]) => options.protectedIds?.has(id));
    const rest = entries
      .filter(([id]) => !options.protectedIds?.has(id))
      .sort((a, b) => activity(b[1]) - activity(a[1]))
      .slice(0, Math.max(0, MAX_METAS - kept.length));
    entries = [...kept, ...rest];
  }
  try {
    writeMap(store, Object.fromEntries(entries));
  } catch {
    // Quota exceeded — a best-effort cache; drop this write silently.
  }
}

/** Drop the reopen descriptor for one auto session (called when its placeholder
 *  is pruned, so a stale meta does not linger). */
export function removeAutoImportMeta(sessionId: string): void {
  const store = storage();
  if (!store) return;
  const map = readMapForWrite(store);
  if (!map) return;
  if (!(sessionId in map)) return;
  delete map[sessionId];
  try {
    writeMap(store, map);
  } catch {
    // Best-effort; a failed prune-write just leaves the stale entry.
  }
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

function activity(meta: AgentWorkSessionMeta): number {
  const stamp = meta.updatedAt || meta.startedAt || "";
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? 0 : ms;
}
