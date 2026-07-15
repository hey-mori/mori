import { describe, expect, it } from "vitest";
import type { KernelRule } from "../record-kernel/kernelTypes";
import {
  buildLateNightRule,
  hasLateNightRule,
  inferDateFromRules,
  isLateNightRule,
} from "./dateRuleLearning";

const rule = buildLateNightRule("2026-07-15T02:00:00");

describe("buildLateNightRule / isLateNightRule / hasLateNightRule", () => {
  it("builds an enabled date-inference rule recognized by the matcher", () => {
    expect(rule.kind).toBe("date-inference");
    expect(rule.enabled).toBe(true);
    expect(isLateNightRule(rule)).toBe(true);
    expect(hasLateNightRule([rule])).toBe(true);
  });

  it("does not match unrelated or disabled rules", () => {
    const alias: KernelRule = {
      id: "r2",
      kind: "alias",
      condition: {},
      effect: {},
      learnedFromRevisionIds: [],
      enabled: true,
      createdAt: "2026-07-15T00:00:00",
    };
    expect(isLateNightRule(alias)).toBe(false);
    expect(hasLateNightRule([alias])).toBe(false);
    expect(hasLateNightRule([{ ...rule, enabled: false }])).toBe(false);
  });
});

describe("inferDateFromRules", () => {
  it("infers the previous day for a small-hours capture when a rule is enabled", () => {
    const result = inferDateFromRules("unknown", [rule], "2026-07-15T01:30:00");
    expect(result).toEqual({ occurredStart: "2026-07-14", timeConfidence: 0.7 });
  });

  it("does not fire for a daytime capture", () => {
    expect(inferDateFromRules("unknown", [rule], "2026-07-15T14:00:00")).toBeNull();
  });

  it("does not fire when the record already has a decided basis", () => {
    expect(inferDateFromRules("user-provided", [rule], "2026-07-15T01:30:00")).toBeNull();
    expect(inferDateFromRules("ai-inferred", [rule], "2026-07-15T01:30:00")).toBeNull();
  });

  it("does not fire without an enabled rule", () => {
    expect(inferDateFromRules("unknown", [], "2026-07-15T01:30:00")).toBeNull();
    expect(inferDateFromRules("unknown", [{ ...rule, enabled: false }], "2026-07-15T01:30:00")).toBeNull();
  });
});
