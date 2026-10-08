/**
 * Project scope · which records belong to a Mori project, for finding work.
 *
 * Membership here is durable membership only: a project context id in the
 * record's `contextIds` (for an agent session, the operator's reviewed filing,
 * `projectMembership.ts`) or a `belongs-to` relation to the project. A session
 * the 프로젝트 page merely suggests from its checkout, one the operator rejected
 * or unfiled, a folder alias, a PR repository, or a matching name never puts a
 * record in scope. A project's scope includes its descendants, the same roll-up
 * the 프로젝트 page uses (`groupRecordsByContext`).
 *
 * Pure and read-only: nothing here writes, so finding work can never become a
 * membership decision.
 */
import type { KernelContext, KernelRelation, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { membershipState } from "../../lib/record-kernel/projectMembership";
import { contextPath, contextWithDescendants, inArchivedSubtree } from "./contextTree";

/** The record's project, when it names a live one (contextIds first, then a
 *  belongs-to relation). Other context types (a routine, a topic) never count. */
export function recordProject(
  record: Pick<MoriRecord, "id" | "contextIds">,
  contexts: readonly KernelContext[],
  relations: readonly KernelRelation[] = [],
): KernelContext | null {
  const state = membershipState(record, contexts);
  if (state.kind === "member") return state.context;
  if (state.kind === "invalid") return null;
  const byId = new Map(contexts.map((context) => [context.id, context]));
  for (const relation of relations) {
    if (relation.type !== "belongs-to" || relation.fromRecordId !== record.id || !relation.toContextId) continue;
    const context = byId.get(relation.toContextId);
    if (context?.type === "project" && !inArchivedSubtree(context.id, contexts)) return context;
  }
  return null;
}

/** A project's display name, or its derived path when another live project
 *  shares the name (`회사/infra` vs `개인/infra`). The id decides; this is a label. */
export function projectLabel(project: KernelContext, contexts: readonly KernelContext[]): string {
  const twins = contexts.some(
    (context) =>
      context.type === "project" &&
      context.id !== project.id &&
      context.name === project.name &&
      !inArchivedSubtree(context.id, contexts),
  );
  return twins ? contextPath(project.id, contexts) : project.name;
}

export type ProjectScope =
  | { kind: "ok"; project: KernelContext; label: string; contextIds: Set<string> }
  /** The scoped project no longer exists or is archived: show that, never widen. */
  | { kind: "unavailable" };

export function resolveProjectScope(projectId: string, contexts: readonly KernelContext[]): ProjectScope {
  const project = contexts.find((context) => context.id === projectId);
  if (!project || project.type !== "project" || inArchivedSubtree(project.id, contexts)) {
    return { kind: "unavailable" };
  }
  return {
    kind: "ok",
    project,
    label: projectLabel(project, contexts),
    contextIds: contextWithDescendants(project.id, contexts),
  };
}

/** Is the record a durable member of the scope (or one of its descendants)? */
export function inProjectScope(
  record: Pick<MoriRecord, "id" | "contextIds">,
  scope: Extract<ProjectScope, { kind: "ok" }>,
  contexts: readonly KernelContext[],
  relations: readonly KernelRelation[] = [],
): boolean {
  const project = recordProject(record, contexts, relations);
  return project !== null && scope.contextIds.has(project.id);
}
