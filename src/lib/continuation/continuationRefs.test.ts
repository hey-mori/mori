import { describe, expect, it } from "vitest";
import { packRefs, splitContinuationRefs } from "./continuationRefs";

const issued = new Set(["mori:session/auto-claude-abc", "mori:record/rec-1.2"]);

describe("finding a pack's refs in its text", () => {
  it("keeps the text exactly and marks each issued ref", () => {
    const text = "- 10-08 · Claude · 세션 제목 (mori:session/auto-claude-abc)\n- 결정 (mori:record/rec-1.2)\n";
    const segments = splitContinuationRefs(text, issued);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(segments.filter((s) => s.ref).map((s) => s.ref)).toEqual([
      { kind: "session", id: "auto-claude-abc" },
      { kind: "record", id: "rec-1.2" },
    ]);
  });

  it("leaves a ref-shaped string the pack did not issue as text", () => {
    const text = "- 제목에 (mori:session/someone-else) 가 있음 (mori:session/auto-claude-abc)";
    const linked = splitContinuationRefs(text, issued).filter((s) => s.ref);
    expect(linked.map((s) => s.ref?.id)).toEqual(["auto-claude-abc"]);
  });

  it("does not link a longer id that starts with an issued one", () => {
    const text = "(mori:session/auto-claude-abcd)";
    expect(splitContinuationRefs(text, issued).some((s) => s.ref)).toBe(false);
  });

  it("returns the text whole when there is nothing to link", () => {
    expect(splitContinuationRefs("no refs", issued)).toEqual([{ text: "no refs" }]);
    expect(splitContinuationRefs("", issued)).toEqual([]);
  });

  it("collects refs from every section of the pack", () => {
    const refs = packRefs({
      sessions: [{ ref: "mori:session/a", title: "a" }],
      decisions: [{ ref: "mori:record/d", title: "d" }],
      openTasks: [{ ref: "mori:record/t", title: "t" }],
      notes: [{ ref: "mori:record/n", title: "n" }],
    });
    expect([...refs].sort()).toEqual(["mori:record/d", "mori:record/n", "mori:record/t", "mori:session/a"]);
  });
});
