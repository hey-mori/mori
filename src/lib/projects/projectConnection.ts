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
