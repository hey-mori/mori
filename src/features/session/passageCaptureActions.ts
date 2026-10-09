/**
 * The two kernel touches of a passage capture: what the preview needs to read,
 * and the one write a confirmed capture makes. Opening the preview reads only;
 * nothing is written until `commitPassage`, so cancelling leaves no trace.
 */
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { membershipState } from "../../lib/record-kernel/projectMembership";
import {
  findExistingPassageRecord,
  type PassageCommitPlan,
  type PassageDraft,
} from "../../lib/capture/passageCapture";

export type PassageCaptureContext = {
  /** Every context, so the picker can show the tree and skip archived ones. */
  contexts: KernelContext[];
  /** The source session's reviewed project, offered as the default. Choosing
   *  it files the new record; it never changes the session's membership. */
  defaultProjectId: string | null;
  /** A live record already made from this exact passage. */
  existing: MoriRecord | null;
};

export async function loadPassageCaptureContext(draft: PassageDraft): Promise<PassageCaptureContext> {
  const repo = getKernelRepository();
  const [contexts, sources, links, records] = await Promise.all([
    repo.listContexts(),
    repo.listSources(),
    repo.listSourceLinks(),
    repo.listRecords(),
  ]);
  const session = records.data.find((record) => record.id === draft.locator.sessionId) ?? null;
  const membership = session ? membershipState(session, contexts.data) : null;
  return {
    contexts: contexts.data,
    defaultProjectId: membership?.kind === "member" ? membership.context.id : null,
    existing: findExistingPassageRecord(draft, sources.data, links.data, records.data),
  };
}

/**
 * Writes a confirmed capture: the kept excerpt first (what the user chose to
 * keep is never lost to a later failure), then the record with its create
 * revision, then the link between them.
 */
export async function commitPassage(plan: PassageCommitPlan): Promise<string> {
  const repo = getKernelRepository();
  await repo.saveSource(plan.source);
  await repo.saveRecord(plan.created.record, plan.created.revision);
  await repo.saveSourceLink(plan.link);
  return plan.created.record.id;
}
