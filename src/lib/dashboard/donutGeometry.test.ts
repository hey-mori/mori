import { describe, expect, it } from "vitest";
import { buildDonutArcs } from "./donutGeometry";

const seg = (key: string, value: number) => ({ key, value, colorVar: `var(--${key})` });

describe("buildDonutArcs", () => {
  it("lays segments end to end with cumulative offsets summing to 100", () => {
    const { total, arcs } = buildDonutArcs([seg("a", 1), seg("b", 1), seg("c", 2)]);
    expect(total).toBe(4);
    expect(arcs.map((arc) => arc.sharePct)).toEqual([25, 25, 50]);
    expect(arcs.map((arc) => arc.dashOffset)).toEqual([0, -25, -50]);
    expect(arcs[0]!.dashArray).toBe("25 75");
    expect(arcs.reduce((sum, arc) => sum + arc.sharePct, 0)).toBe(100);
  });

  it("renders a zero-value segment as a zero-length arc", () => {
    const { arcs } = buildDonutArcs([seg("a", 0), seg("b", 4)]);
    expect(arcs[0]!.sharePct).toBe(0);
    expect(arcs[0]!.dashArray).toBe("0 100");
    expect(arcs[1]!.sharePct).toBe(100);
  });

  it("fills the whole ring for a single non-zero segment", () => {
    const { arcs } = buildDonutArcs([seg("only", 7)]);
    expect(arcs[0]!.dashArray).toBe("100 0");
    expect(arcs[0]!.dashOffset).toBe(0);
  });

  it("yields total 0 and no visible arcs for all-zero input", () => {
    const { total, arcs } = buildDonutArcs([seg("a", 0), seg("b", 0)]);
    expect(total).toBe(0);
    expect(arcs.every((arc) => arc.sharePct === 0)).toBe(true);
  });

  it("clamps negative values to zero", () => {
    const { total, arcs } = buildDonutArcs([seg("a", -5), seg("b", 5)]);
    expect(total).toBe(5);
    expect(arcs[0]!.sharePct).toBe(0);
    expect(arcs[1]!.sharePct).toBe(100);
  });
});
