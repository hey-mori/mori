/**
 * User-created projects + display-name overrides.
 *
 * Mori projects are normally *derived* — a project is every session that
 * shares a `sourceLabel`. That works for imported work, but the user cannot
 * create an empty project up front or rename one without relabelling every
 * session. This module adds a small, explicit project record so the user can:
 *
 *   - create a project (an empty container identified by a `key`, the
 *     `sourceLabel` its future sessions will share), and
 *   - override a project's display name (for derived *or* created projects)
 *     without touching any session.
 *
 * It is purely local: a localStorage list, schema-versioned, with pure
 * upsert / remove / rename helpers so the store and tests stay deterministic.
 * The `key` is the canonical grouping value; display falls back to the trailing
 * path segment when no explicit name is set.
 */

export type UserProject = {
  /** Canonical grouping key — the `sourceLabel` sessions in this project share. */
  key: string;
  /** Optional display-name override. Falls back to the trailing key segment. */
  name?: string;
  /** Optional description override. */
  description?: string;
  /** True when the user created this project explicitly (vs. a name override on
   *  a session-derived project). Only created projects are deletable. */
  created: boolean;
  createdAt: string;
};

const STORAGE_KEY = "mori.userProjects.v1";

export function normalizeProjectKey(input: string): string {
  return input.trim();
}

/** Trailing path segment of a key — "C:/dev/mori" → "mori"; falls back to the key. */
export function deriveProjectName(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : trimmed;
}

/** Display label for a project key, honouring an explicit override. */
export function projectDisplayName(
  key: string,
  projects: ReadonlyArray<UserProject>,
): string {
  const record = projects.find((entry) => entry.key === key);
  const override = record?.name?.trim();
  return override || deriveProjectName(key);
}

/**
 * Create a project record, or no-op when the key already exists. Returns the
 * next list (new reference only when something changed) — pure.
 */
export function createUserProject(
  projects: ReadonlyArray<UserProject>,
  input: { key: string; name?: string; description?: string; now?: string },
): { projects: UserProject[]; created: UserProject | null } {
  const key = normalizeProjectKey(input.key);
  if (!key) return { projects: [...projects], created: null };
  if (projects.some((entry) => entry.key === key)) {
    return { projects: [...projects], created: null };
  }
  const record: UserProject = {
    key,
    name: input.name?.trim() || undefined,
    description: input.description?.trim() || undefined,
    created: true,
    createdAt: input.now ?? new Date().toISOString(),
  };
  return { projects: [record, ...projects], created: record };
}

/**
 * Set (or clear) a project's display-name override. Works for a created
 * project or a session-derived one (an override record is added if absent).
 */
export function renameUserProject(
  projects: ReadonlyArray<UserProject>,
  key: string,
  name: string,
  now: string = new Date().toISOString(),
): UserProject[] {
  const normalizedKey = normalizeProjectKey(key);
  const nextName = name.trim() || undefined;
  const existing = projects.find((entry) => entry.key === normalizedKey);
  if (existing) {
    return projects.map((entry) =>
      entry.key === normalizedKey ? { ...entry, name: nextName } : entry,
    );
  }
  // Name override for a derived project — record it without marking created.
  return [{ key: normalizedKey, name: nextName, created: false, createdAt: now }, ...projects];
}

/**
 * Edit a project's display-name and description overrides.
 */
export function editUserProject(
  projects: ReadonlyArray<UserProject>,
  key: string,
  input: { name?: string; description?: string },
  now: string = new Date().toISOString(),
): UserProject[] {
  const normalizedKey = normalizeProjectKey(key);
  const nextName = input.name !== undefined ? (input.name.trim() || undefined) : undefined;
  const nextDescription = input.description !== undefined ? (input.description.trim() || undefined) : undefined;
  
  const existing = projects.find((entry) => entry.key === normalizedKey);
  if (existing) {
    return projects.map((entry) =>
      entry.key === normalizedKey
        ? {
            ...entry,
            name: input.name !== undefined ? nextName : entry.name,
            description: input.description !== undefined ? nextDescription : entry.description,
          }
        : entry,
    );
  }
  // If not existing, create a name/description override record for a derived project
  return [
    {
      key: normalizedKey,
      name: nextName,
      description: nextDescription,
      created: false,
      createdAt: now,
    },
    ...projects,
  ];
}

/** Remove a created project record. Derived projects (created: false) are kept. */
export function removeUserProject(
  projects: ReadonlyArray<UserProject>,
  key: string,
): UserProject[] {
  return projects.filter((entry) => !(entry.key === key && entry.created));
}

export function loadUserProjects(): UserProject[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUserProject);
  } catch {
    return [];
  }
}

export function saveUserProjects(projects: ReadonlyArray<UserProject>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Quota / disabled storage — keep the in-memory list, drop persistence.
  }
}

function isUserProject(value: unknown): value is UserProject {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === "string" &&
    typeof record.created === "boolean" &&
    typeof record.createdAt === "string" &&
    (record.name === undefined || typeof record.name === "string") &&
    (record.description === undefined || typeof record.description === "string")
  );
}
