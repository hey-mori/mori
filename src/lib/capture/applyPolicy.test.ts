import { describe, expect, it } from "vitest";
import {
  evaluateApply,
  statusForDecision,
  type ApplyFactors,
} from "./applyPolicy";

const base: ApplyFactors = {
  confidence: 0.9,
  mutatesExisting: false,
  createsNewEntity: false,
  sensitive: false,
  automationLevel: "auto",
  reversible: true,
};

describe("evaluateApply", () => {
  it("auto-applies a confident, new, non-sensitive, reversible proposal", () => {
    expect(evaluateApply(base).decision).toBe("auto");
  });

  it("confirms anything sensitive, regardless of confidence", () => {
    expect(evaluateApply({ ...base, sensitive: true }).decision).toBe("confirm");
  });

  it("confirms an irreversible mutation of existing records", () => {
    expect(
      evaluateApply({ ...base, mutatesExisting: true, reversible: false }).decision,
    ).toBe("confirm");
  });

  it("confirms when the schema is set to manual", () => {
    expect(evaluateApply({ ...base, automationLevel: "manual" }).decision).toBe("confirm");
  });

  it("confirms an uncertain interpretation", () => {
    expect(evaluateApply({ ...base, confidence: 0.4 }).decision).toBe("confirm");
  });

  it("holds a new-entity proposal as provisional rather than auto", () => {
    const result = evaluateApply({ ...base, createsNewEntity: true });
    expect(result.decision).toBe("provisional");
    expect(result.reason).toContain("새로운 항목");
  });

  it("holds an assisted-level proposal as provisional even when confident", () => {
    expect(evaluateApply({ ...base, automationLevel: "assisted" }).decision).toBe("provisional");
  });

  it("holds a reversible existing-record mutation as provisional, not auto", () => {
    expect(evaluateApply({ ...base, mutatesExisting: true, reversible: true }).decision).toBe(
      "provisional",
    );
  });
});

describe("statusForDecision", () => {
  it("maps decisions to record statuses", () => {
    expect(statusForDecision("auto")).toBe("active");
    expect(statusForDecision("provisional")).toBe("provisional");
    expect(statusForDecision("confirm")).toBe("candidate");
  });
});
