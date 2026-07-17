import { describe, expect, it } from "vitest";
import type { KernelContext } from "../../lib/record-kernel/kernelTypes";
import {
  archivedRoots,
  canReparent,
  contextChain,
  contextDepth,
  contextPath,
  contextTreeOrder,
  contextWithDescendants,
  inArchivedSubtree,
  planProjectPath,
} from "./contextTree";

function ctx(id: string, name: string, parentId?: string): KernelContext {
  return { id, name, type: "project", createdAt: "2026-07-17T00:00:00.000Z", parentId };
}

// 회사 > mori > docs, plus a same-leaf-named 개인 > mori. The duplicate leaf is
// the whole point: these are two different projects that a leaf-name key merges.
const 회사 = ctx("c1", "회사");
const mori회사 = ctx("c2", "mori", "c1");
const docs = ctx("c3", "docs", "c2");
const 개인 = ctx("c4", "개인");
const mori개인 = ctx("c5", "mori", "c4");
const CONTEXTS = [회사, mori회사, docs, 개인, mori개인];

describe("contextPath", () => {
  it("derives the path from the parent chain", () => {
    expect(contextPath("c3", CONTEXTS)).toBe("회사/mori/docs");
    expect(contextPath("c1", CONTEXTS)).toBe("회사");
  });

  it("distinguishes two projects that share a leaf name", () => {
    // The reason the path is derived at all: 회사/mori and 개인/mori are not the
    // same project, and a leaf-name key says they are.
    expect(contextPath("c2", CONTEXTS)).toBe("회사/mori");
    expect(contextPath("c5", CONTEXTS)).toBe("개인/mori");
  });

  it("survives a cycle instead of hanging", () => {
    // A renderer that spins forever on bad data is a crash, and data can always
    // go wrong. The path truncates at the repeat.
    const a = ctx("a", "A", "b");
    const b = ctx("b", "B", "a");
    expect(() => contextPath("a", [a, b])).not.toThrow();
    expect(contextPath("a", [a, b].map((c) => c)).split("/").length).toBeLessThanOrEqual(2);
  });

  it("treats a dangling parent as a root rather than losing the context", () => {
    const orphan = ctx("o", "mori", "gone");
    expect(contextPath("o", [orphan])).toBe("mori");
  });

  it("returns an empty path for an unknown context", () => {
    expect(contextPath("nope", CONTEXTS)).toBe("");
  });
});

describe("contextChain / contextDepth", () => {
  it("runs root-first and measures depth from the root", () => {
    expect(contextChain("c3", CONTEXTS).map((c) => c.name)).toEqual(["회사", "mori", "docs"]);
    expect(contextDepth("c1", CONTEXTS)).toBe(0);
    expect(contextDepth("c3", CONTEXTS)).toBe(2);
  });
});

describe("contextWithDescendants", () => {
  it("gathers the subtree for roll-up", () => {
    expect(contextWithDescendants("c1", CONTEXTS)).toEqual(new Set(["c1", "c2", "c3"]));
    expect(contextWithDescendants("c3", CONTEXTS)).toEqual(new Set(["c3"]));
  });

  it("does not leak into a sibling subtree that shares a leaf name", () => {
    expect(contextWithDescendants("c4", CONTEXTS)).toEqual(new Set(["c4", "c5"]));
  });

  it("terminates on a cycle", () => {
    const a = ctx("a", "A", "b");
    const b = ctx("b", "B", "a");
    expect(contextWithDescendants("a", [a, b])).toEqual(new Set(["a", "b"]));
  });
});

describe("canReparent", () => {
  it("allows an ordinary move and a promotion to root", () => {
    expect(canReparent("c3", "c4", CONTEXTS)).toBe(true);
    expect(canReparent("c3", undefined, CONTEXTS)).toBe(true);
  });

  it("refuses to parent a context to itself", () => {
    expect(canReparent("c2", "c2", CONTEXTS)).toBe(false);
  });

  it("refuses to parent a context under its own descendant", () => {
    // 회사 under 회사/mori/docs would detach the whole subtree into a ring, so
    // every record beneath it becomes unreachable from any root.
    expect(canReparent("c1", "c3", CONTEXTS)).toBe(false);
  });
});

describe("보관 (inArchivedSubtree / archivedRoots)", () => {
  // 회사 archived, its subtree implicitly hidden. docs was archived on purpose
  // BEFORE its grandparent was, which is the case a cascade would corrupt.
  const 회사A = { ...회사, archived: true };
  const docsA = { ...docs, archived: true };
  const ARCHIVED = [회사A, mori회사, docsA, 개인, mori개인];

  it("hides a context under an archived ancestor without writing to it", () => {
    expect(inArchivedSubtree("c2", ARCHIVED)).toBe(true);
    // The child itself was never touched: that is what makes 복원 lossless.
    expect(mori회사.archived).toBeUndefined();
  });

  it("leaves an unrelated subtree visible", () => {
    expect(inArchivedSubtree("c4", ARCHIVED)).toBe(false);
    expect(inArchivedSubtree("c5", ARCHIVED)).toBe(false);
  });

  it("lists only the TOP of an archived subtree", () => {
    // docs is archived too, but restoring it while 회사 stays archived would do
    // nothing visible, so offering it would be offering a dead button.
    expect(archivedRoots(ARCHIVED).map((c) => c.id)).toEqual(["c1"]);
  });

  it("surfaces an individually archived context as its own root", () => {
    expect(archivedRoots([회사, mori회사, docsA, 개인]).map((c) => c.id)).toEqual(["c3"]);
  });

  it("remembers a separately archived child across a restore of the parent", () => {
    // Restoring 회사 is one write. docs stays archived because nothing ever
    // overwrote it, which a cascade could not have promised.
    const restored = ARCHIVED.map((c) => (c.id === "c1" ? { ...c, archived: false } : c));
    expect(inArchivedSubtree("c2", restored)).toBe(false);
    expect(inArchivedSubtree("c3", restored)).toBe(true);
  });

  it("says nothing is archived when nothing is", () => {
    expect(inArchivedSubtree("c3", CONTEXTS)).toBe(false);
    expect(archivedRoots(CONTEXTS)).toEqual([]);
  });
});

describe("planProjectPath", () => {
  let n = 0;
  const mint = (name: string, parentId: string | undefined): KernelContext => {
    n += 1;
    return ctx(`new${n}`, name, parentId);
  };

  it("turns a typed path into a real parent chain, not a stored string", () => {
    n = 0;
    const { created, leaf } = planProjectPath("회사/mori", [], mint);
    expect(created.map((c) => c.name)).toEqual(["회사", "mori"]);
    expect(created[0].parentId).toBeUndefined();
    expect(created[1].parentId).toBe(created[0].id);
    expect(leaf?.name).toBe("mori");
    // The path exists only as the chain, so a later rename of 회사 touches one
    // name and nothing beneath it.
    expect(contextPath(leaf!.id, created)).toBe("회사/mori");
  });

  it("reuses an existing segment instead of minting a duplicate", () => {
    n = 0;
    const { created, leaf } = planProjectPath("회사/docs", CONTEXTS, mint);
    expect(created.map((c) => c.name)).toEqual(["docs"]);
    expect(created[0].parentId).toBe("c1"); // the existing 회사
    expect(leaf?.name).toBe("docs");
  });

  it("creates nothing and returns the leaf when the whole path exists", () => {
    n = 0;
    const { created, leaf } = planProjectPath("회사/mori", CONTEXTS, mint);
    expect(created).toEqual([]);
    expect(leaf?.id).toBe("c2");
  });

  it("matches a name only among its own siblings", () => {
    // 개인/mori must not satisfy 회사/mori: same leaf, different parent.
    n = 0;
    const { created } = planProjectPath("회사/개인", [개인], mint);
    expect(created.map((c) => c.name)).toEqual(["회사", "개인"]);
  });

  it("ignores empty segments and surrounding space", () => {
    n = 0;
    expect(planProjectPath("  회사 / / mori  ", [], mint).created.map((c) => c.name)).toEqual([
      "회사",
      "mori",
    ]);
  });

  it("plans nothing for an empty or separator-only name", () => {
    n = 0;
    expect(planProjectPath("   ", [], mint)).toEqual({ created: [], leaf: null });
    expect(planProjectPath("///", [], mint)).toEqual({ created: [], leaf: null });
  });
});

describe("contextTreeOrder", () => {
  it("emits each parent immediately followed by its subtree, with depth", () => {
    expect(contextTreeOrder(CONTEXTS).map((row) => [row.context.name, row.depth])).toEqual([
      ["개인", 0],
      ["mori", 1],
      ["회사", 0],
      ["mori", 1],
      ["docs", 2],
    ]);
  });

  it("surfaces a dangling-parent context as a root", () => {
    const orphan = ctx("o", "떠도는", "gone");
    expect(contextTreeOrder([orphan])).toEqual([{ context: orphan, depth: 0 }]);
  });

  it("still lists a context trapped in a cycle instead of dropping it", () => {
    // No root reaches a ring, so the tree walk cannot emit it. Losing a project
    // because its data went bad is worse than showing it flat.
    const a = ctx("a", "A", "b");
    const b = ctx("b", "B", "a");
    const names = contextTreeOrder([a, b]).map((row) => row.context.name);
    expect(names.sort()).toEqual(["A", "B"]);
  });
});
