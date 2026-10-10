import { describe, expect, it } from "vitest";
import { keepEach, totalBytes } from "./keepEach";

describe("keepEach", () => {
  it("keeps each in turn, reports a failure and still keeps the rest", async () => {
    const order: string[] = [];
    const progress: number[] = [];
    const outcomes = await keepEach(
      ["a", "b", "c"],
      async (id) => {
        order.push(id);
        if (id === "b") throw new Error("disk full");
      },
      (done) => progress.push(done),
    );
    expect(order).toEqual(["a", "b", "c"]);
    expect(outcomes).toEqual([
      { sessionId: "a", kept: true },
      { sessionId: "b", kept: false },
      { sessionId: "c", kept: true },
    ]);
    expect(progress).toEqual([1, 2, 3]);
  });
});

describe("totalBytes", () => {
  it("adds known sizes and claims no total when one is unknown", () => {
    expect(totalBytes([100, 200])).toBe(300);
    expect(totalBytes([100, undefined])).toBeUndefined();
    expect(totalBytes([])).toBeUndefined();
  });
});
