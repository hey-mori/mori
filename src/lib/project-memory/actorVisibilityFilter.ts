import type { SessionVisibility } from "../../domain/types";

/**
 * Actor-visibility filter — pure helper that decides whether a record is
 * visible to a given actor under the planned workroom model.
 *
 * Today Mori is single-user and every record is effectively owned by
 * "local-user"; this helper is a small forward-compatibility layer. The
 * `StoredAcceptedProjectMemory` lifecycle already carries `sensitivity` and
 * `reportEligibility` (the per-record sharing tiers) — those are the source
 * of truth for *content* boundaries. This helper is for *session-level*
 * visibility ("can this teammate see I had this conversation at all?").
 *
 * The default policy is permissive on `undefined` so existing single-user
 * records continue to load without retrofitting every write site.
 */

export type VisibilityRecord = {
  /** Optional creator id; `undefined` is treated as the local user. */
  createdBy?: string;
  /** Optional session-level visibility tier; `undefined` means `personal`. */
  visibility?: SessionVisibility;
};

export type VisibilityActor = {
  /** Actor id requesting access. `"local-user"` matches the default writer. */
  actorId: string;
  /** Whether this actor is a project member. Members see `team` records. */
  isProjectMember: boolean;
};

/**
 * The local actor — the implicit "me" Mori writes for today. Centralised so
 * a future swap (real auth, multi-user) only changes one constant.
 */
export const LOCAL_ACTOR: VisibilityActor = {
  actorId: "local-user",
  isProjectMember: true,
};

/**
 * Returns `true` when `actor` may see `record` under workroom rules:
 *  - `personal` → only the creator sees it.
 *  - `team` → any project member sees it.
 *  - `shared` → any caller may see it (assumes a `clientSafe` filter ran upstream).
 *
 * Records that omit `visibility` are treated as `personal` for safety —
 * silent visibility downgrades are far worse than silent visibility leaks.
 */
export function canSeeRecord(
  record: VisibilityRecord,
  actor: VisibilityActor = LOCAL_ACTOR,
): boolean {
  const visibility = record.visibility ?? "personal";
  if (visibility === "shared") return true;
  if (visibility === "team") return actor.isProjectMember;
  // personal
  const creator = record.createdBy ?? LOCAL_ACTOR.actorId;
  return creator === actor.actorId;
}

/**
 * Convenience: filter an array of records to those visible to the actor.
 * Stable order — does not sort, only filters.
 */
export function filterByActorVisibility<T extends VisibilityRecord>(
  records: ReadonlyArray<T>,
  actor: VisibilityActor = LOCAL_ACTOR,
): T[] {
  return records.filter((record) => canSeeRecord(record, actor));
}
