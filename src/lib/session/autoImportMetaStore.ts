/**
 * Reopen-descriptor store for auto-imported sessions.
 *
 * Auto-import registers a metadata-only draft (cheap, no body). To load the
 * real transcript when the user clicks the row, we need the original discovery
 * meta (its importKind + source path). We persist that meta keyed by the stable
 * auto session id, so a click can resolve `getAgentWorkSession(meta)` on demand.
 * Kept small: capped to the most-recent MAX entries by activity time.
 */
import type { AgentWorkSessionMeta } from "../trace/sources/ai/workSessions";
import { AUTO_IMPORT_META_KEY, autoImportedSessionId } from "./autoImportSessions";

type MetaMap = Record<string, AgentWorkSessionMeta>;

/** Bound the reopen-descriptor map (this key only; the per-session drafts are
 *  bounded separately by the poll's recency cap + prune). */
const MAX_METAS = 1000;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
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

/** Upsert reopen metas for a batch of just-registered sessions, capped by recency. */
export function upsertAutoImportMetas(metas: readonly AgentWorkSessionMeta[]): void {
  const store = storage();
  if (!store || metas.length === 0) return;
  const map = readMap();
  for (const meta of metas) {
    map[autoImportedSessionId(meta)] = meta;
  }

  let entries = Object.entries(map);
  if (entries.length > MAX_METAS) {
    entries = entries
      .sort((a, b) => activity(b[1]) - activity(a[1]))
      .slice(0, MAX_METAS);
  }
  try {
    store.setItem(AUTO_IMPORT_META_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota exceeded — a best-effort cache; drop this write silently.
  }
}

/** Drop the reopen descriptor for one auto session (called when its placeholder
 *  is pruned, so a stale meta does not linger). */
export function removeAutoImportMeta(sessionId: string): void {
  const store = storage();
  if (!store) return;
  const map = readMap();
  if (!(sessionId in map)) return;
  delete map[sessionId];
  try {
    store.setItem(AUTO_IMPORT_META_KEY, JSON.stringify(map));
  } catch {
    // Best-effort; a failed prune-write just leaves the stale entry.
  }
}

function activity(meta: AgentWorkSessionMeta): number {
  const stamp = meta.updatedAt || meta.startedAt || "";
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? 0 : ms;
}
