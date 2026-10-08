/**
 * Which Mori project a session belongs to, as the session view says it.
 *
 * Two different facts, never merged into one label:
 *   - the source folder (`Session.sourceLabel`, e.g. "dev"): where the agent
 *     worked. Observed, and shown as such;
 *   - the reviewed project: the operator's decision, a project context id in
 *     the session record's `contextIds` (`membershipState`, the PR #160
 *     contract). A suggestion, a rejection, a matching folder or repository
 *     name never makes a session a member here.
 *
 * A `belongs-to` relation is deliberately not read. The general 기록 scope
 * (`recordProject`) counts one, but "활동으로 기록" writes it automatically from
 * the agent's folder (`captureAgentSession`), so it carries no review and must
 * not be shown as the project the user confirmed.
 *
 * The record is found by id: an auto-imported session's kernel record id IS its
 * session id (`agentSessionRecordAdapter`), never a title or path match.
 */
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { membershipState } from "../../lib/record-kernel/projectMembership";
import { projectLabel } from "../record-ledger/projectScope";

export type SessionProjectIdentity =
  /** A reviewed project. `label` is its display name, or its path when another
   *  live project shares the name. Navigation uses `contextId`, never `label`. */
  | { kind: "member"; contextId: string; label: string }
  /** The confirmed project no longer exists or is archived: say so, never fall
   *  back to a similarly named project. */
  | { kind: "invalid"; reason: "missing" | "archived" }
  /** No reviewed project: unfiled, only suggested, or rejected. */
  | { kind: "none" }
  /** The record could not be read reliably (or the session has none). */
  | { kind: "unknown" };

export function sessionProjectIdentity(
  record: Pick<MoriRecord, "id" | "contextIds"> | null,
  contexts: readonly KernelContext[],
): SessionProjectIdentity {
  if (!record) return { kind: "unknown" };
  const state = membershipState(record, contexts);
  if (state.kind === "invalid") return { kind: "invalid", reason: state.reason };
  if (state.kind === "none") return { kind: "none" };
  return { kind: "member", contextId: state.context.id, label: projectLabel(state.context, contexts) };
}

/**
 * What the session breadcrumb leads with, and where it goes.
 *
 * - A reviewed project leads and routes by its context id, never its name. The
 *   source folder trails it as source information.
 * - A project needing review leads, with no route.
 * - Otherwise the source folder leads, routed as a source folder (the
 *   source-keyed 프로젝트 view), never presented as a confirmed project.
 */
export type SessionCrumbs = {
  lead:
    | { kind: "project"; contextId: string; label: string }
    | { kind: "review-needed"; reason: "missing" | "archived" }
    | { kind: "source"; sourceKey: string }
    | null;
  /** The source folder shown after the title, when the lead is a project. */
  trailingSource: string | null;
};

export function sessionCrumbs(identity: SessionProjectIdentity, sourceLabel: string | null): SessionCrumbs {
  if (identity.kind === "member") {
    return {
      lead: { kind: "project", contextId: identity.contextId, label: identity.label },
      trailingSource: sourceLabel,
    };
  }
  if (identity.kind === "invalid") {
    return { lead: { kind: "review-needed", reason: identity.reason }, trailingSource: sourceLabel };
  }
  return { lead: sourceLabel ? { kind: "source", sourceKey: sourceLabel } : null, trailingSource: null };
}
