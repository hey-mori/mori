/**
 * Remembers which Mori project a user filed an agent work session under, keyed
 * by the session's source folder (its `projectPath`).
 *
 * Why: a conversation imported from a folder almost always belongs to the same
 * Mori project every time, but the project's label can differ from the folder
 * name (folder `ng-gw` filed under project `Gateway`). So instead of guessing
 * from the folder name alone, we record the user's actual last choice for that
 * folder and reuse it on the next import. This is deliberately a single
 * last-wins mapping, not a folder→many-projects rule: splitting one folder
 * across several projects (front / back) is out of scope for now.
 *
 * Storage is local only, behind the same injectable adapter the engine presets
 * use, so it stays testable and consistent with Mori's local-first stance.
 */

const STORAGE_KEY = "mori.projectFolderLinks.v1";

type LinkStorage = Pick<Storage, "getItem" | "setItem">;

type FolderLinkMap = Record<string, string>;

function defaultStorage(): LinkStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMap(storage: LinkStorage | null): FolderLinkMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: FolderLinkMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** The project label last chosen for this folder, or null if none recorded. */
export function getProjectForFolder(
  folderPath: string | undefined | null,
  storage: LinkStorage | null = defaultStorage(),
): string | null {
  const key = folderPath?.trim();
  if (!key) return null;
  return readMap(storage)[key] ?? null;
}

/** Record the project a folder's imports should default to from now on. */
export function rememberProjectForFolder(
  folderPath: string | undefined | null,
  projectLabel: string | undefined | null,
  storage: LinkStorage | null = defaultStorage(),
): void {
  const key = folderPath?.trim();
  const label = projectLabel?.trim();
  if (!key || !label || !storage) return;
  const map = readMap(storage);
  if (map[key] === label) return;
  map[key] = label;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage can be unavailable (private mode, quota). The mapping is a
    // convenience, so a write failure is non-fatal.
  }
}
