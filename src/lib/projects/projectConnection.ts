/**
 * Project connection identity — the canonical project-key matcher.
 *
 * Mori groups every session that shares a project under one project page, and
 * the Live Project Intelligence track wants to associate *external* AI sessions
 * (Claude / Codex / OpenCode work discovered by their connectors) with the
 * right Mori project. Both jobs need one honest answer to "are these two
 * project labels the same project?".
 *
 * Historically that answer drifted: `buildProjectOverview` compared raw
 * `sourceLabel`s with a trim-only equality, `ProjectView` resolved a project id
 * with `trim().toLowerCase()`, and `session/projectIdentity` /
 * `association/evidenceAssociation` each carried their own path normaliser. So
 * `C:\dev\mori`, `C:/dev/mori/`, and `c:/dev/mori` could land in three separate
 * project buckets even though they are one project.
 *
 * This module is the single canonical primitive:
 *
 *   - `normalizeProjectIdentity` turns a raw path / label into a comparable
 *     identity (separator-unified, trailing-slash-stripped, lower-cased key;
 *     a display label that preserves the original trailing-segment casing).
 *   - `compareProjectIdentities` returns the match strength between two labels.
 *   - `projectIdentitiesMatch` is the strict "same project" predicate used for
 *     auto-grouping (only an exact canonical match auto-merges).
 *
 * It is pure and deterministic: identical inputs always yield identical output,
 * no filesystem, no home-directory guessing, no network. A weaker `basename`
 * match (the same trailing segment under a different parent — a short name
 * `mori` vs the full path `/Users/x/dev/mori`) is reported but never
 * auto-merged, because it is exactly the kind of guess that must ride a
 * user-confirmed connection mapping before it changes durable grouping.
 */

export type ProjectIdentity = {
  /**
   * Comparison key: separators unified to `/`, trailing slashes stripped,
   * lower-cased. Empty string for an empty / whitespace-only input.
   */
  canonicalKey: string;
  /** Display label — the trailing path segment, original casing preserved. */
  label: string;
  /** Lower-cased path segments, for trailing-segment comparison. */
  segments: string[];
};

/**
 * How strongly two project labels look like the same project.
 *
 * - `exact` — the same project written differently (case / separator /
 *   trailing slash). Safe to auto-group.
 * - `basename` — the same trailing segment under a different path (a short
 *   name vs a full path). A reviewable candidate only; never auto-grouped,
 *   because two unrelated projects can share a trailing name (`/work/api` vs
 *   `/play/api`).
 * - `none` — no usable match.
 */
export type ProjectMatchStrength = "exact" | "basename" | "none";

/** Normalise a raw project path / label into a comparable identity. */
export function normalizeProjectIdentity(
  raw: string | undefined | null,
): ProjectIdentity {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { canonicalKey: "", label: "", segments: [] };
  // Unify separators and strip trailing slashes, matching the proven
  // normalisation in association/evidenceAssociation. Internal repeated
  // slashes are left intact so a `C:` drive or a protocol-like label is not
  // mangled — project labels here are filesystem paths or names, not URIs.
  const unified = trimmed.replace(/\\/g, "/").replace(/\/+$/g, "");
  const canonicalKey = unified.toLocaleLowerCase();
  const displaySegments = unified.split("/").filter(Boolean);
  const label =
    displaySegments.length > 0
      ? displaySegments[displaySegments.length - 1]!
      : unified;
  const segments = canonicalKey.split("/").filter(Boolean);
  return { canonicalKey, label, segments };
}

/** Match strength between two raw project labels. */
export function compareProjectIdentities(
  a: string | undefined | null,
  b: string | undefined | null,
): ProjectMatchStrength {
  const ia = normalizeProjectIdentity(a);
  const ib = normalizeProjectIdentity(b);
  if (!ia.canonicalKey || !ib.canonicalKey) return "none";
  if (ia.canonicalKey === ib.canonicalKey) return "exact";
  const aLast = ia.segments[ia.segments.length - 1];
  const bLast = ib.segments[ib.segments.length - 1];
  if (aLast && bLast && aLast === bLast) return "basename";
  return "none";
}

/**
 * Strict "same project" predicate for auto-grouping. Only an exact canonical
 * match counts — a `basename` near-match must be confirmed before it changes
 * how sessions are grouped or which project owns durable memory.
 */
export function projectIdentitiesMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  return compareProjectIdentities(a, b) === "exact";
}

/* ------------------------------------------------------------------ *
 * Connection mapping — user-confirmed aliases.
 *
 * Canonical matching deliberately refuses to auto-group a `basename`
 * near-match (a short name `mori` vs the full path `/Users/x/dev/mori`),
 * because two unrelated projects can share a trailing name. The connection
 * mapping is the trust boundary that resolves it: Mori *proposes* the
 * near-match as a candidate, and only when the user confirms does the other
 * label become an alias that groups with the project. This keeps "automatic
 * collection is not automatic application": Mori may surface look-alike work,
 * but the durable grouping change still rides an explicit confirmation.
 * ------------------------------------------------------------------ */

/** A user-confirmed mapping of extra labels onto one Mori project. */
export type ConnectedProject = {
  /** The Mori project key (the `sourceLabel` its primary sessions share). */
  projectKey: string;
  /**
   * Other raw labels the user confirmed are the same project. Stored
   * as-entered; always compared canonically.
   */
  aliases: string[];
  createdAt: string;
  updatedAt: string;
};

/** A reviewable proposal that some sessions look like they belong to a project. */
export type ProjectConnectionCandidate = {
  /** Canonical key the candidate sessions share. */
  canonicalKey: string;
  /** The raw label to confirm as an alias (original casing preserved). */
  label: string;
  /** Display name — the label's trailing segment. */
  displayLabel: string;
  /** Why Mori proposed it. Only `basename` near-matches become candidates. */
  strength: Exclude<ProjectMatchStrength, "exact" | "none">;
  confidence: "medium" | "low";
  /** Ids of the sources (sessions) that carry this label. */
  sourceIds: string[];
  /** How many sources share the label. */
  count: number;
  /** A representative title, when one is available. */
  sampleTitle?: string;
};

/** Minimal shape a connection source (saved session or discovered work) maps to. */
export type ProjectConnectionSource = {
  id: string;
  /** The source's own project label (`sourceLabel` / `projectPath`). */
  label: string | undefined | null;
  title?: string;
};

/** Confirmed-alias labels for a project, or an empty list. */
export function getProjectAliases(
  connections: ReadonlyArray<ConnectedProject>,
  projectKey: string,
): string[] {
  const record = connections.find((entry) =>
    projectIdentitiesMatch(entry.projectKey, projectKey),
  );
  return record ? [...record.aliases] : [];
}

/**
 * Does `label` belong to `projectKey`, honouring confirmed aliases? An exact
 * canonical match always counts; a confirmed alias makes an otherwise
 * non-grouping label (e.g. a basename) group too.
 */
export function projectMatchesWithAliases(
  projectKey: string,
  label: string | undefined | null,
  connections: ReadonlyArray<ConnectedProject>,
): boolean {
  if (projectIdentitiesMatch(label, projectKey)) return true;
  return getProjectAliases(connections, projectKey).some((alias) =>
    projectIdentitiesMatch(label, alias),
  );
}

/**
 * Propose which look-alike labels could be connected to a project. Sources
 * whose label exactly matches the project (already grouped) or matches a
 * confirmed alias (already connected) are excluded; only `basename`
 * near-matches remain, grouped by their distinct canonical label and sorted
 * by count then label for a stable order. Proposals only, no writes.
 */
export function buildProjectConnectionCandidates(args: {
  projectKey: string;
  sources: ReadonlyArray<ProjectConnectionSource>;
  connections?: ReadonlyArray<ConnectedProject>;
}): ProjectConnectionCandidate[] {
  const connections = args.connections ?? [];
  const buckets = new Map<string, { label: string; sources: ProjectConnectionSource[] }>();

  for (const source of args.sources) {
    const identity = normalizeProjectIdentity(source.label);
    if (!identity.canonicalKey) continue;
    // Already grouped (exact) or already confirmed (alias) — not a candidate.
    if (projectMatchesWithAliases(args.projectKey, source.label, connections)) continue;
    if (compareProjectIdentities(args.projectKey, source.label) !== "basename") continue;
    const bucket = buckets.get(identity.canonicalKey) ?? {
      label: identity.label,
      sources: [],
    };
    bucket.sources.push(source);
    buckets.set(identity.canonicalKey, bucket);
  }

  const candidates: ProjectConnectionCandidate[] = [...buckets.entries()].map(
    ([canonicalKey, bucket]) => {
      const rawLabel = bucket.sources[0]?.label?.trim() || bucket.label;
      return {
        canonicalKey,
        label: rawLabel,
        displayLabel: bucket.label,
        strength: "basename",
        confidence: "low",
        sourceIds: bucket.sources.map((source) => source.id),
        count: bucket.sources.length,
        sampleTitle: bucket.sources.find((source) => source.title?.trim())?.title?.trim(),
      };
    },
  );

  return candidates.sort(
    (a, b) => b.count - a.count || a.canonicalKey.localeCompare(b.canonicalKey),
  );
}

/**
 * Confirm a label as an alias of a project (pure upsert). Returns the next
 * list; a new reference only when something changed. A label that already
 * groups with the project (exact match or existing alias) is a no-op.
 */
export function addProjectAlias(
  connections: ReadonlyArray<ConnectedProject>,
  projectKey: string,
  alias: string,
  now: string = new Date().toISOString(),
): ConnectedProject[] {
  const trimmedKey = projectKey.trim();
  const trimmedAlias = alias.trim();
  if (!trimmedKey || !trimmedAlias) return [...connections];
  if (projectIdentitiesMatch(trimmedKey, trimmedAlias)) return [...connections];

  const existing = connections.find((entry) =>
    projectIdentitiesMatch(entry.projectKey, trimmedKey),
  );
  if (existing) {
    if (existing.aliases.some((value) => projectIdentitiesMatch(value, trimmedAlias))) {
      return [...connections];
    }
    return connections.map((entry) =>
      entry === existing
        ? { ...entry, aliases: [...entry.aliases, trimmedAlias], updatedAt: now }
        : entry,
    );
  }
  const record: ConnectedProject = {
    projectKey: trimmedKey,
    aliases: [trimmedAlias],
    createdAt: now,
    updatedAt: now,
  };
  return [record, ...connections];
}

/** Remove a confirmed alias (pure). Drops the record when its last alias goes. */
export function removeProjectAlias(
  connections: ReadonlyArray<ConnectedProject>,
  projectKey: string,
  alias: string,
): ConnectedProject[] {
  return connections.flatMap((entry) => {
    if (!projectIdentitiesMatch(entry.projectKey, projectKey)) return [entry];
    const aliases = entry.aliases.filter(
      (value) => !projectIdentitiesMatch(value, alias),
    );
    if (aliases.length === entry.aliases.length) return [entry];
    return aliases.length > 0 ? [{ ...entry, aliases }] : [];
  });
}

const CONNECTIONS_STORAGE_KEY = "mori.projectConnections.v1";

export function loadConnectedProjects(): ConnectedProject[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConnectedProject);
  } catch {
    return [];
  }
}

export function saveConnectedProjects(
  connections: ReadonlyArray<ConnectedProject>,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections));
  } catch {
    // Quota / disabled storage — keep the in-memory list, drop persistence.
  }
}

function isConnectedProject(value: unknown): value is ConnectedProject {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.projectKey === "string" &&
    Array.isArray(record.aliases) &&
    record.aliases.every((alias) => typeof alias === "string") &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}
