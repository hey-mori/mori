export type RepositoryVerificationStatus = "unverified" | "verified" | "failed";

export type RepositoryVerificationMetadata = {
  status: RepositoryVerificationStatus;
  verifiedAt?: string;
  gitRoot?: string;
  currentBranch?: string;
  headCommit?: string;
  shortHeadCommit?: string;
  isDirty?: boolean;
  error?: string;
};

export const UNVERIFIED_VERIFICATION: RepositoryVerificationMetadata = { status: "unverified" };

export type RepositoryConfig = {
  id: string;
  label: string;
  path: string;
  createdAt: string;
  lastUsedAt?: string;
  verification?: RepositoryVerificationMetadata;
};

export type RepositorySettings = {
  repositories: RepositoryConfig[];
  selectedRepositoryId: string | null;
};

export const DEFAULT_REPOSITORY_SETTINGS: RepositorySettings = {
  repositories: [],
  selectedRepositoryId: null,
};

/**
 * Sanitize a possibly-corrupt settings blob loaded from storage. Keeps the
 * contract narrow: anything unrecognized falls back to defaults, no entries
 * are kept without a non-empty `path`, and duplicate paths are collapsed.
 */
export function sanitizeRepositorySettings(input: unknown): RepositorySettings {
  if (!input || typeof input !== "object") return { ...DEFAULT_REPOSITORY_SETTINGS };
  const candidate = input as Partial<RepositorySettings>;
  const raw = Array.isArray(candidate.repositories) ? candidate.repositories : [];
  const seenPaths = new Set<string>();
  const repositories: RepositoryConfig[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const path = typeof entry.path === "string" ? entry.path.trim() : "";
    if (!path) continue;
    const normalizedPath = path;
    if (seenPaths.has(normalizedPath)) continue;
    seenPaths.add(normalizedPath);

    const idCandidate = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    const labelCandidate = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : null;
    const createdAt = typeof entry.createdAt === "string" && entry.createdAt.trim()
      ? entry.createdAt.trim()
      : new Date().toISOString();
    const lastUsedAt = typeof entry.lastUsedAt === "string" && entry.lastUsedAt.trim()
      ? entry.lastUsedAt.trim()
      : undefined;
    const verification = sanitizeVerificationMetadata((entry as { verification?: unknown }).verification);

    repositories.push({
      id: idCandidate ?? createRepositoryId(normalizedPath),
      label: labelCandidate ?? deriveLabelFromPath(normalizedPath),
      path: normalizedPath,
      createdAt,
      ...(lastUsedAt ? { lastUsedAt } : {}),
      ...(verification ? { verification } : {}),
    });
  }

  const requestedSelection = typeof candidate.selectedRepositoryId === "string"
    ? candidate.selectedRepositoryId
    : null;
  const selectedRepositoryId = requestedSelection && repositories.some((entry) => entry.id === requestedSelection)
    ? requestedSelection
    : repositories[0]?.id ?? null;

  return { repositories, selectedRepositoryId };
}

export type AddRepositoryInput = {
  path: string;
  label?: string;
  now?: string;
};

export function addRepositoryConfig(
  settings: RepositorySettings,
  input: AddRepositoryInput,
): { settings: RepositorySettings; repository: RepositoryConfig } {
  const path = input.path.trim();
  if (!path) throw new Error("Repository path is required.");

  const existing = settings.repositories.find((entry) => entry.path === path);
  if (existing) {
    const updated: RepositoryConfig = {
      ...existing,
      label: input.label?.trim() || existing.label,
    };
    return {
      repository: updated,
      settings: {
        repositories: settings.repositories.map((entry) => (entry.id === existing.id ? updated : entry)),
        selectedRepositoryId: settings.selectedRepositoryId ?? existing.id,
      },
    };
  }

  const now = input.now ?? new Date().toISOString();
  const repository: RepositoryConfig = {
    id: createRepositoryId(path),
    label: input.label?.trim() || deriveLabelFromPath(path),
    path,
    createdAt: now,
  };
  const repositories = [...settings.repositories, repository];
  return {
    repository,
    settings: {
      repositories,
      selectedRepositoryId: settings.selectedRepositoryId ?? repository.id,
    },
  };
}

export function removeRepositoryConfig(
  settings: RepositorySettings,
  repositoryId: string,
): RepositorySettings {
  const repositories = settings.repositories.filter((entry) => entry.id !== repositoryId);
  const selectedRepositoryId = settings.selectedRepositoryId === repositoryId
    ? repositories[0]?.id ?? null
    : settings.selectedRepositoryId;
  return { repositories, selectedRepositoryId };
}

export function updateRepositoryConfig(
  settings: RepositorySettings,
  repositoryId: string,
  patch: Partial<Pick<RepositoryConfig, "label" | "lastUsedAt">>,
): RepositorySettings {
  return {
    ...settings,
    repositories: settings.repositories.map((entry) =>
      entry.id !== repositoryId
        ? entry
        : {
            ...entry,
            label: typeof patch.label === "string" && patch.label.trim() ? patch.label.trim() : entry.label,
            lastUsedAt: typeof patch.lastUsedAt === "string" && patch.lastUsedAt.trim()
              ? patch.lastUsedAt.trim()
              : entry.lastUsedAt,
          },
    ),
  };
}

export function setRepositoryVerification(
  settings: RepositorySettings,
  repositoryId: string,
  verification: RepositoryVerificationMetadata | null,
): RepositorySettings {
  return {
    ...settings,
    repositories: settings.repositories.map((entry) => {
      if (entry.id !== repositoryId) return entry;
      if (!verification) {
        const { verification: _drop, ...rest } = entry;
        return rest;
      }
      return { ...entry, verification: sanitizeVerificationMetadata(verification) ?? UNVERIFIED_VERIFICATION };
    }),
  };
}

function sanitizeVerificationMetadata(input: unknown): RepositoryVerificationMetadata | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<RepositoryVerificationMetadata>;
  const status: RepositoryVerificationStatus =
    candidate.status === "verified" || candidate.status === "failed" || candidate.status === "unverified"
      ? candidate.status
      : "unverified";

  const result: RepositoryVerificationMetadata = { status };
  if (typeof candidate.verifiedAt === "string" && candidate.verifiedAt.trim()) {
    result.verifiedAt = candidate.verifiedAt.trim();
  }
  if (typeof candidate.gitRoot === "string" && candidate.gitRoot.trim()) {
    result.gitRoot = candidate.gitRoot.trim();
  }
  if (typeof candidate.currentBranch === "string" && candidate.currentBranch.trim()) {
    result.currentBranch = candidate.currentBranch.trim();
  }
  if (typeof candidate.headCommit === "string" && candidate.headCommit.trim()) {
    result.headCommit = candidate.headCommit.trim();
    result.shortHeadCommit =
      typeof candidate.shortHeadCommit === "string" && candidate.shortHeadCommit.trim()
        ? candidate.shortHeadCommit.trim()
        : candidate.headCommit.trim().slice(0, 7);
  } else if (typeof candidate.shortHeadCommit === "string" && candidate.shortHeadCommit.trim()) {
    result.shortHeadCommit = candidate.shortHeadCommit.trim();
  }
  if (typeof candidate.isDirty === "boolean") {
    result.isDirty = candidate.isDirty;
  }
  if (typeof candidate.error === "string" && candidate.error.trim()) {
    result.error = candidate.error.trim();
  }
  return result;
}

export function setSelectedRepository(
  settings: RepositorySettings,
  repositoryId: string | null,
): RepositorySettings {
  if (repositoryId === null) {
    return { ...settings, selectedRepositoryId: null };
  }
  const exists = settings.repositories.some((entry) => entry.id === repositoryId);
  return { ...settings, selectedRepositoryId: exists ? repositoryId : settings.selectedRepositoryId };
}

export function deriveLabelFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  return segments.length ? segments[segments.length - 1] : trimmed || "repository";
}

export function createRepositoryId(path: string): string {
  const stamp = Date.now().toString(36);
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `repo-${slug || "path"}-${stamp}`;
}
