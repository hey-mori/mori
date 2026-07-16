/**
 * Project groups · the cross-lens that fills the 프로젝트 view.
 *
 * Mori keeps two parallel worlds: AI sessions (the session store) and kernel
 * records (the ledger). A project spans both — the tcc-ng-gw project has agent
 * sessions AND any notes/decisions captured into it. This pure helper merges
 * the two by project key so 프로젝트 reads as "everything under this project",
 * not an empty kernel-only list.
 *
 * The key is the project's leaf label (e.g. "C:/dev/mori" and a "mori" kernel
 * context collapse to one group), so a session's `sourceLabel` and a context's
 * name line up.
 */
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { groupRecordsByContext } from "./contextGrouping";

export type ProjectGroup = {
  /** Stable key (the normalized leaf label). */
  id: string;
  /** Display name (the project's leaf label). */
  name: string;
  /** The kernel context backing this project, when one exists. */
  context: KernelContext | null;
  /** AI sessions captured under this project, newest first. */
  sessions: StoredSessionSummary[];
  /** Kernel records belonging to this project's context, newest first. */
  records: MoriRecord[];
};

function projectKey(label: string): string {
  return shortProjectLabel(label).trim().toLowerCase();
}

/**
 * Merge sessions (by `sourceLabel`) and kernel records (by context) into one
 * project list, busiest first. Sessions without a source label are skipped
 * (they belong to no project). A project that has only sessions, only records,
 * or both all appear.
 */
export function buildProjectGroups(
  sessions: readonly StoredSessionSummary[],
  contexts: readonly KernelContext[],
  records: readonly MoriRecord[],
  relations: readonly KernelRelation[],
): ProjectGroup[] {
  const byKey = new Map<string, ProjectGroup>();

  const ensure = (rawLabel: string): ProjectGroup => {
    const key = projectKey(rawLabel);
    let group = byKey.get(key);
    if (!group) {
      group = { id: key, name: shortProjectLabel(rawLabel), context: null, sessions: [], records: [] };
      byKey.set(key, group);
    }
    return group;
  };

  for (const session of sessions) {
    const label = session.sourceLabel?.trim();
    if (!label) continue;
    ensure(label).sessions.push(session);
  }

  for (const contextGroup of groupRecordsByContext([...contexts], [...records], [...relations])) {
    const group = ensure(contextGroup.context.name);
    group.context = contextGroup.context;
    group.records.push(...contextGroup.records);
  }

  for (const group of byKey.values()) {
    group.sessions.sort((a, b) => stamp(b) - stamp(a));
  }

  return [...byKey.values()].sort(
    (a, b) => b.sessions.length + b.records.length - (a.sessions.length + a.records.length),
  );
}

function stamp(session: StoredSessionSummary): number {
  const ms = Date.parse(session.startedAt || session.savedAt || "");
  return Number.isNaN(ms) ? 0 : ms;
}
