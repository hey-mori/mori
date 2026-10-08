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
 *
 * The same refusal runs the other way (2026-10-08). A session is identified by
 * its CHECKOUT, not its folder name: the Git checkout the reader established
 * (a worktree resolves to its main checkout, `Session.sourceRepository`), else
 * its folder, after any alias the user confirmed (`projectConnection.ts`).
 * Two different checkouts that share a leaf (`/work/api`, `/play/api`) are two
 * projects: neither is joined to a context of that name by the name alone,
 * because a name match is a candidate, not an identity
 * (`compareProjectIdentities` "basename"). They are counted as candidates.
 *
 * Every session also says why it is where it is (`inclusion`), keeping three
 * things apart: how its checkout is known, whether a Mori project was chosen
 * for it, and nothing at all about what the session contributed.
 */
import type {
  KernelContext,
  KernelRelation,
  MoriRecord,
} from "../../lib/record-kernel/kernelTypes";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { shortProjectLabel } from "../../lib/sidebar/sessionList";
import {
  normalizeProjectIdentity,
  projectIdentitiesMatch,
  type ConnectedProject,
} from "../../lib/projects/projectConnection";
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
  /** Why each session is in this group, by session id. */
  inclusion: Record<string, SessionInclusion>;
  /** Sessions from a different checkout that share this project's name. Not
   *  included: a name match is a candidate until the user confirms it. */
  candidates: StoredSessionSummary[];
};

/**
 * Why a session is in its group. `project` is the Mori association, `identity`
 * how the session's checkout is known. Neither says what the session did.
 */
export type SessionInclusion = {
  /**
   * - `context`: joined to a project the user made, by an unambiguous name.
   * - `alias`: the user confirmed this checkout as another project's alias.
   * - `checkout`: no Mori project; grouped only with sessions of the same
   *   checkout.
   */
  project: "context" | "alias" | "checkout";
  /**
   * - `worktree-record`: the session recorded the worktree's origin checkout.
   * - `git-worktree`: the folder is a Git worktree of that checkout (now).
   * - `git-checkout`: the folder lies inside that checkout (now).
   * - `folder`: nothing beyond the folder itself.
   */
  identity: "worktree-record" | "git-worktree" | "git-checkout" | "folder";
};

function identityBasis(session: StoredSessionSummary): SessionInclusion["identity"] {
  if (!session.sourceRepository) return "folder";
  if (session.sourceRepositoryBasis === "session-record") return "worktree-record";
  if (session.sourceRepositoryBasis === "git-worktree") return "git-worktree";
  if (session.sourceRepositoryBasis === "git-checkout") return "git-checkout";
  return "folder";
}

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
  connections: readonly ConnectedProject[] = [],
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
      inclusion: {},
      candidates: [],
    });
    const leaf = normalizeKey(context.name);
    const owners = leafOwners.get(leaf);
    if (owners) owners.push(key);
    else leafOwners.set(leaf, [key]);
  }

  // Each session's identity: its checkout (or folder), after a confirmed alias.
  const resolved = sessions.map((session) => {
    // Never drop a session · an auto-imported session whose project path did not
    // resolve still belongs somewhere, so fall back to its project name, then a
    // 기타 bucket. This is what fills 프로젝트 instead of leaving it empty.
    const own =
      session.sourceRepository?.trim() ||
      session.sourceLabel?.trim() ||
      session.projectName?.trim() ||
      "기타";
    const alias = connections.find((entry) =>
      entry.aliases.some((label) => projectIdentitiesMatch(label, own)),
    );
    const label = alias ? alias.projectKey : own;
    const canonical = normalizeProjectIdentity(label).canonicalKey || "기타";
    return { session, label, canonical, leaf: sessionKey(label), aliased: Boolean(alias) };
  });

  // How many distinct checkouts carry each leaf. Two means the name alone
  // cannot say which one a project of that name is.
  const checkoutsByLeaf = new Map<string, Set<string>>();
  for (const entry of resolved) {
    const set = checkoutsByLeaf.get(entry.leaf) ?? new Set<string>();
    set.add(entry.canonical);
    checkoutsByLeaf.set(entry.leaf, set);
  }

  for (const entry of resolved) {
    const { session, label, canonical, leaf } = entry;
    const owners = leafOwners.get(leaf) ?? [];
    const ambiguousName = (checkoutsByLeaf.get(leaf)?.size ?? 0) > 1;
    // Resolution order, most certain first:
    //   1. A context whose whole PATH is this leaf. Not a guess: an exact match.
    //   2. Exactly one context carries the leaf anywhere in the tree.
    //   3. Otherwise the leaf cannot say which, so refuse to guess and leave the
    //      session in its own group, visibly unfiled rather than silently
    //      mis-filed.
    // Rules 1 and 2 join by name, so they apply only when one checkout carries
    // the name; two checkouts sharing it are candidates for that context.
    // Only a group backed by a context counts: an unfiled group an earlier
    // session created under the same leaf is not a project the user made.
    const exact = !ambiguousName && byKey.get(leaf)?.context ? leaf : null;
    const contextKey = exact ?? (!ambiguousName && owners.length === 1 ? owners[0] : null);
    if (ambiguousName) {
      for (const owner of byKey.get(leaf)?.context ? [leaf] : owners) byKey.get(owner)?.candidates.push(session);
    }
    // An unfiled group keys by its leaf, as before, unless the leaf is shared
    // by another checkout: then by the full checkout identity, so the two never
    // merge.
    const key = contextKey ?? (ambiguousName ? `checkout:${canonical}` : leaf);
    let group = byKey.get(key);
    if (!group) {
      const segments = label.replace(/\\/g, "/").split("/").filter(Boolean);
      group = {
        id: key,
        name: shortProjectLabel(label),
        // Two checkouts share this name: their parent folder tells them apart.
        parentPath: ambiguousName && segments.length > 1 ? segments[segments.length - 2]! : "",
        context: null,
        sessions: [],
        records: [],
        inclusion: {},
        candidates: [],
      };
      byKey.set(key, group);
    }
    group.sessions.push(session);
    group.inclusion[session.sessionId] = {
      // The user's confirmed alias is the reviewed act, even when the project
      // it names then joins a context.
      project: entry.aliased ? "alias" : contextKey ? "context" : "checkout",
      identity: identityBasis(session),
    };
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
