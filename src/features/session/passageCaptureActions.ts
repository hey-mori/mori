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
  keptPassagesByMessage,
  type KeptPassage,
  passageSourceKey,
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
  const [contexts, session, sources, links] = await Promise.all([
    repo.listContexts(),
    repo.getRecord(draft.locator.sessionId),
    repo.listSources(),
    repo.listSourceLinks(),
  ]);
  // Only the records linked to a source at this passage's place are read.
  const key = passageSourceKey(draft.locator);
  const candidateIds = new Set(
    links.data
      .filter((link) => sources.data.some((source) => source.id === link.sourceId && source.locator === key))
      .map((link) => link.recordId),
  );
  const candidates = (await Promise.all([...candidateIds].map((id) => repo.getRecord(id))))
    .map((result) => result.data)
    .filter((record): record is MoriRecord => record !== null);
  const membership = session.data ? membershipState(session.data, contexts.data) : null;
  return {
    contexts: contexts.data,
    defaultProjectId: membership?.kind === "member" ? membership.context.id : null,
    existing: findExistingPassageRecord(draft, sources.data, links.data, candidates),
  };
}

/** What the reader has already kept from this session, by message place. */
export async function loadKeptPassages(sessionId: string): Promise<Map<string, KeptPassage[]>> {
  const repo = getKernelRepository();
  const [sources, links] = await Promise.all([repo.listSources(), repo.listSourceLinks()]);
  const prefix = `mori:session/${sessionId}#`;
  const sourceIds = new Set(
    sources.data.filter((source) => source.locator?.startsWith(prefix)).map((source) => source.id),
  );
  if (sourceIds.size === 0) return new Map();
  // Only the records linked to this session's passages are read.
  const recordIds = new Set(links.data.filter((link) => sourceIds.has(link.sourceId)).map((link) => link.recordId));
  const records = (await Promise.all([...recordIds].map((id) => repo.getRecord(id))))
    .map((result) => result.data)
    .filter((record): record is MoriRecord => record !== null);
  return keptPassagesByMessage(sessionId, sources.data, links.data, records);
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
