/**
 * The scope 현재 상황 reads for a reviewed project, from what the page holds.
 *
 * Kept apart from the view so its two refusals can be tested: nothing while the
 * kernel is loading (an empty member list then means "not known yet"), and
 * nothing for a project whose confirmed sessions cannot be listed.
 */
import type { KernelContext, MoriRecord } from "../../lib/record-kernel/kernelTypes";
import { membershipState, rejectedProjects } from "../../lib/record-kernel/projectMembership";
import type { ProjectSearchInventory } from "../../lib/session/projectSearch";
import { liveSourcesOf } from "../../lib/live-intake/confirmedLiveSources";
import type { ConfirmedLiveScope } from "./useProjectLive";

export type ConfirmedLiveSources = {
  scope: ConfirmedLiveScope;
  /** Source file to its member session, or null when two members name it. */
  sessionByKey: ReadonlyMap<string, string | null>;
};

export function confirmedLiveScopeFor(input: {
  project: Pick<KernelContext, "id" | "name"> | null;
  loading: boolean;
  inventory: ProjectSearchInventory | null;
  records: readonly MoriRecord[];
  contexts: readonly KernelContext[];
  /** A source file's Mori session, from the discovery descriptors. */
  sessionIdOfFile: (sessionKey: string) => string | undefined;
}): ConfirmedLiveSources | null {
  const { project, loading, inventory } = input;
  if (!project || loading) return null;
  const sources = liveSourcesOf(inventory?.kind === "ok" && inventory.projectId === project.id ? inventory.entries : []);
  const recordById = new Map(input.records.map((record) => [record.id, record]));
  return {
    sessionByKey: sources.sessionByKey,
    scope: {
      projectId: project.id,
      label: project.name,
      keys: sources.keys,
      unplaced: (sessionKey) => {
        const sessionId = input.sessionIdOfFile(sessionKey);
        const record = sessionId ? recordById.get(sessionId) : undefined;
        if (!record) return true;
        if (membershipState(record, input.contexts).kind === "member") return false;
        return !rejectedProjects(record).includes(project.id);
      },
    },
  };
}
