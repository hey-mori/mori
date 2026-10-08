/**
 * Project groups · the cross-lens that fills the 프로젝트 view.
 *
 * Mori keeps two parallel worlds: AI sessions (the session store) and kernel
 * records (the ledger). A project spans both — the tcc-ng-gw project has agent
 * sessions AND any notes/decisions captured into it. This pure helper merges
 * the two by project key so 프로젝트 reads as "everything under this project",
 * not an empty kernel-only list.
 *
 * Keying is the whole subtlety, because the two worlds name projects
 * differently. A session knows a filesystem path ("C:/dev/mori"); a context
 * knows a name and a parent. They are joined on the LEAF, which is why
 * "C:/dev/mori" finds the "mori" context at all.
 *
 * A context is keyed by its DERIVED PATH, never its leaf: 회사/mori and 개인/mori
 * are two projects, and a leaf key silently merged them into one, mixing two
 * projects' records under a single heading. The path is computed from the parent
 * chain here and never stored (v7 §7).
 *
 * When a leaf is AMBIGUOUS (two contexts named mori), a session naming that leaf
 * is not attached to either. Guessing would file real work under the wrong
 * project, and being visibly unfiled is recoverable where a silent mis-file is
 * not.
 */
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import { groupRecordsByContext } from "./contextGrouping";
import { contextChain, CONTEXT_PATH_SEPARATOR } from "./contextTree";

export type ProjectGroup = {
  /** Stable key: a context's derived path, else the session's leaf label. */
  id: string;
  /** Display name (the project's leaf label). */
  name: string;
  /** The derived parent path (`회사` for `회사/mori`), or "" at the root. Shown to
   *  tell two same-named projects apart, never stored. */
  parentPath: string;
  /** The kernel context backing this project, when one exists. */
  context: KernelContext | null;
  /** AI sessions captured under this project, newest first. */
  sessions: StoredSessionSummary[];
  /** Kernel records belonging to this project's context, newest first. */
  records: MoriRecord[];
};

function normalizeKey(label: string): string {
  return label.trim().toLowerCase();
}

/** A session's key: its leaf, which is all a filesystem path can tell us. */
export function sessionKey(label: string): string {
  return normalizeKey(shortProjectLabel(label));
}

/**
 * Merge sessions (by `sourceLabel`) and kernel records (by context) into one
 * project list, busiest first. A session is never dropped: when its source path
 * did not resolve it falls back to its project name, then a 기타 bucket, so
 * 프로젝트 shows every session. A project that has only sessions, only records,
 * or both all appear.
 */
export function buildProjectGroups(
  sessions: readonly StoredSessionSummary[],
  contexts: readonly KernelContext[],
  records: readonly MoriRecord[],
  relations: readonly KernelRelation[],
): ProjectGroup[] {
  const byKey = new Map<string, ProjectGroup>();

  // Contexts first: they carry the tree, so they decide which keys exist before
  // a session gets to claim one.
  //
  // EVERY project context gets a key, not only the ones holding records.
  // Seeding from groupRecordsByContext alone (which drops empty contexts) meant
  // a project that holds only SESSIONS could never be joined: its key did not
  // exist, so its own sessions fell through to an unfiled leaf group and the
  // project read as empty while its work sat beside it.
  const recordsByContextId = new Map<string, MoriRecord[]>();
  for (const contextGroup of groupRecordsByContext([...contexts], [...records], [...relations])) {
    recordsByContextId.set(contextGroup.context.id, contextGroup.records);
  }

  const leafOwners = new Map<string, string[]>();
  for (const context of contexts) {
    if (context.type !== "project") continue;
    const chain = contextChain(context.id, contexts);
    const path = chain.map((entry) => entry.name).join(CONTEXT_PATH_SEPARATOR);
    const key = normalizeKey(path);
    byKey.set(key, {
      id: key,
      name: context.name,
      parentPath: chain
        .slice(0, -1)
        .map((entry) => entry.name)
        .join(CONTEXT_PATH_SEPARATOR),
      context,
      sessions: [],
      records: [...(recordsByContextId.get(context.id) ?? [])],
    });
    const leaf = normalizeKey(context.name);
    const owners = leafOwners.get(leaf);
    if (owners) owners.push(key);
    else leafOwners.set(leaf, [key]);
  }

  for (const session of sessions) {
    // Never drop a session · an auto-imported session whose project path did not
    // resolve still belongs somewhere, so fall back to its project name, then a
    // 기타 bucket. This is what fills 프로젝트 instead of leaving it empty.
    const label = session.sourceLabel?.trim() || session.projectName?.trim() || "기타";
    const leaf = sessionKey(label);
    const owners = leafOwners.get(leaf) ?? [];
    // Resolution order, most certain first:
    //   1. A context whose whole PATH is this leaf. Not a guess: an exact match.
    //   2. Exactly one context carries the leaf anywhere in the tree.
    //   3. Otherwise the leaf cannot say which, so refuse to guess and leave the
    //      session in its own group, visibly unfiled rather than silently
    //      mis-filed.
    // Case 1 running first is also what keeps the fallback key collision-free: a
    // root context named mori is claimed there, so a leaf-keyed session group
    // named mori can only exist when no context path equals it.
    const exact = byKey.has(leaf) ? leaf : null;
    const key = exact ?? (owners.length === 1 ? owners[0] : leaf);
    let group = byKey.get(key);
    if (!group) {
      group = {
        id: key,
        name: shortProjectLabel(label),
        parentPath: "",
        context: null,
        sessions: [],
        records: [],
      };
      byKey.set(key, group);
    }
    group.sessions.push(session);
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
