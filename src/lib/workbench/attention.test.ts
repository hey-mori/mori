import { describe, expect, it } from "vitest";
import {
  buildWorkbenchAttention,
  type WorkbenchAttentionMeta,
} from "./attention";

function meta(
  title: string,
  openIssues: number,
  unconfirmedDecisions: number,
): WorkbenchAttentionMeta {
  return { title, openIssues, unconfirmedDecisions };
}

describe("buildWorkbenchAttention", () => {
  it("keeps only panels with a real open issue or unconfirmed decision", () => {
    const panels = [
      { id: "p1", sessionId: "a" },
      { id: "p2", sessionId: "b" },
      { id: "p3", sessionId: "c" },
    ];
    const metaById = new Map([
      ["a", meta("Has issue", 2, 0)],
      ["b", meta("Clean", 0, 0)],
      ["c", meta("Has decision", 0, 1)],
    ]);

    const result = buildWorkbenchAttention(panels, metaById);

    expect(result.map((item) => item.sessionId)).toEqual(["a", "c"]);
    expect(result[0]).toMatchObject({ panelId: "p1", openIssues: 2, total: 2 });
  });

  it("orders the most urgent first (issues, then decisions)", () => {
    const panels = [
      { id: "p1", sessionId: "low" },
      { id: "p2", sessionId: "high" },
      { id: "p3", sessionId: "mid" },
    ];
    const metaById = new Map([
      ["low", meta("Low", 0, 1)],
      ["high", meta("High", 3, 0)],
      ["mid", meta("Mid", 1, 2)],
    ]);

    const result = buildWorkbenchAttention(panels, metaById);

    expect(result.map((item) => item.title)).toEqual(["High", "Mid", "Low"]);
  });

  it("dedupes by session and jumps to the first placed panel", () => {
    const panels = [
      { id: "first", sessionId: "a" },
      { id: "second", sessionId: "a" },
    ];
    const metaById = new Map([["a", meta("Twice", 1, 0)]]);

    const result = buildWorkbenchAttention(panels, metaById);

    expect(result).toHaveLength(1);
    expect(result[0]!.panelId).toBe("first");
  });

  it("ignores panels whose session metadata is missing", () => {
    const panels = [{ id: "p1", sessionId: "ghost" }];

    const result = buildWorkbenchAttention(panels, new Map());

    expect(result).toEqual([]);
  });

  it("clamps negative or fractional counts to safe integers", () => {
    const panels = [{ id: "p1", sessionId: "a" }];
    const metaById = new Map([["a", meta("Odd", -2, 1.7)]]);

    const result = buildWorkbenchAttention(panels, metaById);

    expect(result[0]).toMatchObject({ openIssues: 0, unconfirmedDecisions: 1, total: 1 });
  });
});
