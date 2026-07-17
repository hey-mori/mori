/**
 * Context tree · nesting for contexts, on the `parentId` the kernel already has
 * (기록 v7 §7).
 *
 * Hierarchy is `parentId`, never a path string. A stored path (`"회사/mori"`) makes
 * renaming a segment rewrite every descendant, which is the bug Logseq migrated
 * away from when it dropped name-embedded namespaces. Here the **path is derived
 * and never stored**: a rename touches exactly one name, and a re-parent is one
 * patched field, so both are audited revisions the existing 되돌리기 undoes.
 *
 * Contexts round-trip through `payload_json`, so nesting costs zero migration,
 * zero SQL and zero Rust change.
 *
 * Everything here is a pure derivation over the context list. Two invariants
 * carry the weight, and both are enforced rather than assumed:
 *
 * 1. **A cycle can never hang the app.** A parent chain is walked with a seen
 *    set, and a cycle truncates the path instead of looping forever. Data can
 *    always go wrong (a bad re-parent, a partial sync, a hand-edited store); a
 *    renderer that spins on it is a crash, and a note tool that loses a frame is
 *    already lying about being calm.
 * 2. **A missing parent is not a lost context.** A context whose `parentId`
 *    points at nothing (archived, deleted, not yet synced) is treated as a root
 *    rather than dropped. Losing a project because its folder vanished is the
 *    single most expensive failure this module could have.
 */
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";

/** Separator for DISPLAY and for derived keys only. Never stored. */
export const CONTEXT_PATH_SEPARATOR = "/";

/**
 * The chain from the root down to this context, inclusive. A cycle stops the
 * walk at the repeat, and a dangling parent stops it there, so the result is
 * always finite and always starts with a context that exists.
 */
export function contextChain(
  contextId: string,
  contexts: readonly KernelContext[],
): KernelContext[] {
  const byId = new Map(contexts.map((context) => [context.id, context]));
  const chain: KernelContext[] = [];
  const seen = new Set<string>();
  let current = byId.get(contextId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain.reverse();
}

/**
 * The derived display path, e.g. `회사/mori`. Never persist this: it is a view of
 * the chain at this instant, and the chain is the truth.
 */
export function contextPath(contextId: string, contexts: readonly KernelContext[]): string {
  return contextChain(contextId, contexts)
    .map((context) => context.name)
    .join(CONTEXT_PATH_SEPARATOR);
}

/** Depth from the root, 0 for a root context. Drives indentation. */
export function contextDepth(contextId: string, contexts: readonly KernelContext[]): number {
  return Math.max(0, contextChain(contextId, contexts).length - 1);
}

/** This context's id plus every descendant's, for roll-up. Cycle-safe. */
export function contextWithDescendants(
  contextId: string,
  contexts: readonly KernelContext[],
): Set<string> {
  const childrenByParent = new Map<string, KernelContext[]>();
  for (const context of contexts) {
    if (!context.parentId) continue;
    const list = childrenByParent.get(context.parentId);
    if (list) list.push(context);
    else childrenByParent.set(context.parentId, [context]);
  }

  const out = new Set<string>([contextId]);
  const queue = [contextId];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    for (const child of childrenByParent.get(id) ?? []) {
      // The seen check IS the cycle guard: a child that is already in the set
      // was reached another way, so re-queueing it would loop.
      if (out.has(child.id)) continue;
      out.add(child.id);
      queue.push(child.id);
    }
  }
  return out;
}

/**
 * Whether `parentId` may become `contextId`'s parent. Rejects the two moves that
 * corrupt the tree: parenting to itself, and parenting to its own descendant
 * (which would orphan the whole subtree into a detached ring).
 *
 * This is a guard at the WRITE, deliberately. Tolerating cycles on read (which
 * the walkers above also do) keeps a bad store renderable; refusing to create
 * one keeps it from happening in the first place. Both, not either.
 */
export function canReparent(
  contextId: string,
  parentId: string | undefined,
  contexts: readonly KernelContext[],
): boolean {
  if (!parentId) return true; // Promoting to a root is always safe.
  if (parentId === contextId) return false;
  return !contextWithDescendants(contextId, contexts).has(parentId);
}

/**
 * Whether a sibling under `parentId` already carries this name.
 *
 * Siblings having unique names is not cosmetic, it is what makes the derived
 * path a usable KEY: `projectGroups` keys each project by its path, so two
 * siblings named mori derive one path, one group overwrites the other, and the
 * loser's records silently render under the winner while its own page reads
 * empty. `planProjectPath` upholds this at create time by reusing a matching
 * sibling; rename and re-parent have to uphold it too, or they can manufacture
 * exactly the collision create refuses to.
 */
export function siblingNameTaken(
  contexts: readonly KernelContext[],
  parentId: string | undefined,
  name: string,
  exceptId?: string,
): boolean {
  return contexts.some(
    (candidate) =>
      candidate.type === "project" &&
      candidate.id !== exceptId &&
      candidate.parentId === parentId &&
      candidate.name === name,
  );
}

/**
 * Whether this context is hidden by 보관: it is archived itself, or it sits
 * under one that is.
 *
 * This answers v8 §9's open question, and the answer is that archiving is ONE
 * write and hiding the subtree is a VIEW rule, never a cascade. A cascade would
 * have to write `archived` onto every descendant, and then restoring the parent
 * could not tell a child the cascade archived from a child the user had archived
 * on purpose earlier: it would silently un-archive it. Deriving the hide instead
 * makes 보관 and 복원 exactly symmetric and loses nothing.
 */
export function inArchivedSubtree(contextId: string, contexts: readonly KernelContext[]): boolean {
  return contextChain(contextId, contexts).some((entry) => entry.archived === true);
}

/**
 * The tops of the archived subtrees: archived, with no archived ancestor. These
 * are what 보관됨 lists, because listing every archived descendant separately
 * would offer a 복원 that does nothing while its parent is still archived.
 */
export function archivedRoots(contexts: readonly KernelContext[]): KernelContext[] {
  return contexts.filter(
    (context) =>
      context.archived === true &&
      !contextChain(context.id, contexts)
        .slice(0, -1)
        .some((ancestor) => ancestor.archived === true),
  );
}

/**
 * What a typed path ("회사/mori") implies: the contexts that must be minted, and
 * the leaf the record should be filed under. Pure, so the caller only persists.
 *
 * Typing a path is INPUT, not storage. Each segment becomes a real context
 * linked by `parentId`; the string is thrown away. An existing sibling with the
 * same name is reused, so typing 회사/mori twice does not leave two 회사.
 *
 * `mint` supplies id + timestamp, which is what keeps this pure and testable.
 */
export function planProjectPath(
  path: string,
  contexts: readonly KernelContext[],
  mint: (name: string, parentId: string | undefined) => KernelContext,
  /** Start the walk under this context instead of at the root. The caller who
   *  already KNOWS the parent must pass its id: re-deriving it through
   *  `contextPath` and re-parsing the string here matched by NAME, so a child
   *  created under the second of two same-named projects landed under the
   *  first, and a parent whose own name contained a "/" minted two brand-new
   *  contexts instead of resolving to it. */
  rootParentId?: string,
): { created: KernelContext[]; leaf: KernelContext | null } {
  const segments = path
    .split(CONTEXT_PATH_SEPARATOR)
    .map((segment) => segment.trim().normalize("NFC"))
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return { created: [], leaf: null };

  const known = [...contexts];
  const created: KernelContext[] = [];
  let parentId: string | undefined = rootParentId;
  let leaf: KernelContext | null =
    known.find((candidate) => candidate.id === rootParentId) ?? null;
  for (const name of segments) {
    const found = known.find(
      (candidate) =>
        candidate.type === "project" && candidate.parentId === parentId && candidate.name === name,
    );
    if (found) {
      leaf = found;
      parentId = found.id;
      continue;
    }
    const next = mint(name, parentId);
    created.push(next);
    known.push(next);
    leaf = next;
    parentId = next.id;
  }
  return { created, leaf };
}

/**
 * Contexts in tree order (each parent immediately followed by its subtree),
 * with the depth to indent by. Siblings sort by name so the list is stable
 * across renders; a context with a dangling parent surfaces as a root rather
 * than disappearing.
 */
export function contextTreeOrder(
  contexts: readonly KernelContext[],
): Array<{ context: KernelContext; depth: number }> {
  const byId = new Map(contexts.map((context) => [context.id, context]));
  const childrenByParent = new Map<string | undefined, KernelContext[]>();
  for (const context of contexts) {
    // A parent that is not in the list is no parent at all: treat the context
    // as a root so it stays reachable.
    const key = context.parentId && byId.has(context.parentId) ? context.parentId : undefined;
    const list = childrenByParent.get(key);
    if (list) list.push(context);
    else childrenByParent.set(key, [context]);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  const out: Array<{ context: KernelContext; depth: number }> = [];
  const visited = new Set<string>();
  const walk = (parentKey: string | undefined, depth: number) => {
    for (const context of childrenByParent.get(parentKey) ?? []) {
      if (visited.has(context.id)) continue; // Cycle guard.
      visited.add(context.id);
      out.push({ context, depth });
      walk(context.id, depth + 1);
    }
  };
  walk(undefined, 0);

  // A context trapped in a cycle has no root to be reached from, so the walk
  // above never emits it. Surface it flat rather than losing it.
  for (const context of contexts) {
    if (!visited.has(context.id)) out.push({ context, depth: 0 });
  }
  return out;
}
