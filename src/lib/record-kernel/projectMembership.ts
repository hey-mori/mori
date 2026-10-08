/**
 * Reviewed project membership · the operator's decision about which Mori
 * project an agent-session record is filed under.
 *
 * Four different facts, kept apart:
 *   - an observed checkout (`Session.sourceRepository`): where the work appears
 *     to belong. Automatic, never a membership;
 *   - a suggestion (the project page's projection): a checkout, a unique name,
 *     or a confirmed alias points at a project. Shown, never written;
 *   - a reviewed membership: a project context id in the record's `contextIds`,
 *     written only by an explicit operator decision through the normal kernel
 *     revision path (actor `user`). This is the one authority every reader
 *     shares (프로젝트 grouping, 이어가기, the explorer tree, timeline chips);
 *   - a rejection: the operator said "not this project" (`projectReview`
 *     property), so the suggestion is not repeated and rediscovery cannot
 *     reapply it.
 *
 * Automation never writes `contextIds` (`agentSessionRecordAdapter`), so a
 * decision here can only be changed by another decision. Nothing about the
 * source (paths, branches, PRs, text) is copied into the record: the record
 * stores which context, and the revision trail stores who and when.
 */
import type { KernelContext, MoriRecord, RecordPropertyValue } from "./kernelTypes";
import { applyRecordPatch, type RecordPatch } from "./recordFactory";
import type { KernelRepository } from "./kernelRepository";
import type { SchemaRegistry } from "./schemaRegistry";

export const PROJECT_REVIEW_PROPERTY = "projectReview";

export type ProjectReview = {
  /** Project contexts the operator said this record does not belong to. */
  rejected: string[];
};

export type MembershipState =
  | { kind: "member"; context: KernelContext }
  /** The record names a project that no longer exists, or sits in an archived
   *  subtree. Exposed, never silently replaced. */
  | { kind: "invalid"; contextId: string; reason: "missing" | "archived" }
  | { kind: "none" };

export type MembershipDecision = "confirm" | "reject" | "unfile";

export type MembershipRefusal =
  | "missing-context"
  | "archived-context"
  | "not-a-project"
  | "stale"
  | "unchanged";

function isArchived(contextId: string, contexts: readonly KernelContext[]): boolean {
  const byId = new Map(contexts.map((context) => [context.id, context]));
  let current = byId.get(contextId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.archived) return true;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

/**
 * The record's project ids. A record may carry several contexts of other types
 * (a routine, a topic); only project contexts, or ids that no longer resolve
 * at all, count as a project membership here.
 */
function projectIdsOf(record: Pick<MoriRecord, "contextIds">, contexts: readonly KernelContext[]): string[] {
  const byId = new Map(contexts.map((context) => [context.id, context]));
  return (record.contextIds ?? []).filter((id) => {
    const context = byId.get(id);
    return context ? context.type === "project" : id.startsWith("ctx");
  });
}

/** What the record's own durable state says about its project. */
export function membershipState(
  record: Pick<MoriRecord, "contextIds">,
  contexts: readonly KernelContext[],
): MembershipState {
  const ids = projectIdsOf(record, contexts);
  if (ids.length === 0) return { kind: "none" };
  const id = ids[0]!;
  const context = contexts.find((candidate) => candidate.id === id);
  if (!context) return { kind: "invalid", contextId: id, reason: "missing" };
  if (isArchived(id, contexts)) return { kind: "invalid", contextId: id, reason: "archived" };
  return { kind: "member", context };
}

/** Project contexts the operator explicitly rejected for this record. */
export function rejectedProjects(record: Pick<MoriRecord, "properties">): string[] {
  const value = record.properties?.[PROJECT_REVIEW_PROPERTY];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const rejected = (value as Record<string, unknown>).rejected;
  return Array.isArray(rejected) ? rejected.filter((id): id is string => typeof id === "string") : [];
}

function withReview(record: MoriRecord, rejected: string[]): Record<string, RecordPropertyValue> {
  const properties = { ...record.properties };
  if (rejected.length === 0) delete properties[PROJECT_REVIEW_PROPERTY];
  else properties[PROJECT_REVIEW_PROPERTY] = { rejected: [...new Set(rejected)].sort() };
  return properties;
}

/**
 * Plan one operator decision against the record as it is NOW (read fresh by
 * the caller), never against the snapshot the suggestion was drawn from.
 *
 * `expectedProjectId` is the project the operator saw the record in (null for
 * none). If the record has moved since, the decision is refused as stale
 * rather than overwriting someone's newer choice. The patch touches only
 * `contextIds` and the review property, so a session that grew meanwhile
 * keeps its newer observed fields.
 */
export function planMembershipDecision(args: {
  record: MoriRecord;
  contexts: readonly KernelContext[];
  decision: MembershipDecision;
  contextId: string;
  expectedProjectId: string | null;
}): { patch: RecordPatch } | { refused: MembershipRefusal } {
  const { record, contexts, decision, contextId } = args;
  const target = contexts.find((context) => context.id === contextId);
  const currentIds = projectIdsOf(record, contexts);
  const current = currentIds[0] ?? null;
  if (current !== args.expectedProjectId) return { refused: "stale" };

  const others = (record.contextIds ?? []).filter((id) => !currentIds.includes(id));
  const rejected = rejectedProjects(record);

  if (decision === "confirm") {
    if (!target) return { refused: "missing-context" };
    if (target.type !== "project") return { refused: "not-a-project" };
    if (isArchived(target.id, contexts)) return { refused: "archived-context" };
    if (current === target.id && !rejected.includes(target.id)) return { refused: "unchanged" };
    return {
      patch: {
        contextIds: [...others, target.id],
        properties: withReview(record, rejected.filter((id) => id !== target.id)),
      },
    };
  }

  if (decision === "reject") {
    // Saying "not this project" about a project the record is filed under is
    // an unfile; about a suggestion it only records the answer.
    if (rejected.includes(contextId) && current !== contextId) return { refused: "unchanged" };
    return {
      patch: {
        ...(current === contextId ? { contextIds: others } : {}),
        properties: withReview(record, [...rejected, contextId]),
      },
    };
  }

  // unfile: leave the project, and remember the answer so it is not suggested
  // again; every non-project context stays.
  if (current !== contextId) return { refused: "unchanged" };
  return {
    patch: {
      contextIds: others,
      properties: withReview(record, [...rejected, contextId]),
    },
  };
}

export type MembershipOutcome =
  | { ok: true; record: MoriRecord }
  | { ok: false; reason: MembershipRefusal | "not-found" | "unreliable-read" | "fell-back" };

type MembershipRepository = Pick<KernelRepository, "getRecord" | "listContexts" | "saveRecord">;

/**
 * Apply one operator decision: read the record and the contexts fresh, plan,
 * and write one `user` revision through the normal kernel path. Never
 * coalesced with an editing burst, so each decision is its own entry in the
 * history. A desktop write that fell back to browser storage is reported as a
 * failure: a membership that only the webview holds is not durable.
 */
export async function applyMembershipDecision(
  repo: MembershipRepository,
  registry: SchemaRegistry,
  args: {
    recordId: string;
    decision: MembershipDecision;
    contextId: string;
    expectedProjectId: string | null;
    now?: () => Date;
  },
): Promise<MembershipOutcome> {
  const fresh = await repo.getRecord(args.recordId);
  if (fresh.fellBack) return { ok: false, reason: "unreliable-read" };
  if (!fresh.data) return { ok: false, reason: "not-found" };
  const contexts = await repo.listContexts();
  if (contexts.fellBack) return { ok: false, reason: "unreliable-read" };
  const plan = planMembershipDecision({
    record: fresh.data,
    contexts: contexts.data,
    decision: args.decision,
    contextId: args.contextId,
    expectedProjectId: args.expectedProjectId,
  });
  if ("refused" in plan) return { ok: false, reason: plan.refused };
  const { record, revision } = applyRecordPatch(fresh.data, plan.patch, "user", registry, args.now);
  const saved = await repo.saveRecord(record, revision);
  if (saved.fellBack) return { ok: false, reason: "fell-back" };
  return { ok: true, record };
}
