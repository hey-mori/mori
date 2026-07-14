import { describe, expect, it } from "vitest";
import type { KernelRule } from "../record-kernel/kernelTypes";
import type { RecordProposal } from "./captureTypes";
import {
  automationLevelFor,
  buildAliasRule,
  classifyProposal,
  normalizeEntityName,
} from "./personalization";

const rule = (partial: Partial<KernelRule> & Pick<KernelRule, "kind" | "condition" | "effect">): KernelRule => ({
  id: partial.id ?? `rule-${partial.kind}`,
  learnedFromRevisionIds: [],
  enabled: partial.enabled ?? true,
  createdAt: "2026-07-14",
  ...partial,
});

const proposal = (overrides: Partial<RecordProposal> = {}): RecordProposal => ({
  schemaId: "note",
  title: "제목",
  body: "본문",
  properties: {},
  timeBasis: "unknown",
  confidence: 1,
  rationale: "",
  entityMentions: [],
  ...overrides,
});

describe("normalizeEntityName", () => {
  it("maps an alias to its canonical name", () => {
    const rules = [rule({ kind: "alias", condition: { alias: "달리기" }, effect: { canonicalName: "러닝" } })];
    expect(normalizeEntityName("달리기", rules)).toBe("러닝");
    expect(normalizeEntityName("수영", rules)).toBe("수영");
  });

  it("ignores a disabled alias rule", () => {
    const rules = [
      rule({ kind: "alias", condition: { alias: "달리기" }, effect: { canonicalName: "러닝" }, enabled: false }),
    ];
    expect(normalizeEntityName("달리기", rules)).toBe("달리기");
  });
});

describe("classifyProposal", () => {
  it("reclassifies the schema when a classification rule matches by keyword", () => {
    const rules = [
      rule({ kind: "classification", condition: { keywords: ["회고"] }, effect: { schemaId: "reflection" } }),
    ];
    const result = classifyProposal(proposal({ body: "오늘 하루 회고" }), rules);
    expect(result.schemaId).toBe("reflection");
    expect(result.appliedRuleIds).toContain("rule-classification");
  });

  it("attaches a bound context when a context-binding rule matches by schema", () => {
    const rules = [
      rule({ kind: "context-binding", condition: { schemaId: "note" }, effect: { contextId: "ctx-work" } }),
    ];
    const result = classifyProposal(proposal(), rules);
    expect(result.addedContextIds).toEqual(["ctx-work"]);
  });

  it("does not reclassify when a rule has neither schema nor keywords", () => {
    const rules = [rule({ kind: "classification", condition: {}, effect: { schemaId: "reflection" } })];
    expect(classifyProposal(proposal(), rules).schemaId).toBe("note");
  });
});

describe("automationLevelFor", () => {
  it("returns the fallback with no rules", () => {
    expect(automationLevelFor("workout", [], [])).toBe("auto");
    expect(automationLevelFor("workout", [], [], "manual")).toBe("manual");
  });

  it("applies a schema-scoped automation rule", () => {
    const rules = [
      rule({ kind: "automation-level", condition: { schemaId: "investment-entry" }, effect: { level: "manual" } }),
    ];
    expect(automationLevelFor("investment-entry", [], rules)).toBe("manual");
    expect(automationLevelFor("workout", [], rules)).toBe("auto");
  });

  it("prefers the most specific rule (schema + context beats schema-only)", () => {
    const rules = [
      rule({ id: "a", kind: "automation-level", condition: { schemaId: "note" }, effect: { level: "assisted" } }),
      rule({
        id: "b",
        kind: "automation-level",
        condition: { schemaId: "note", contextId: "ctx-work" },
        effect: { level: "manual" },
      }),
    ];
    expect(automationLevelFor("note", ["ctx-work"], rules)).toBe("manual");
    expect(automationLevelFor("note", ["ctx-home"], rules)).toBe("assisted");
  });
});

describe("buildAliasRule", () => {
  it("builds an enabled alias rule from a rename", () => {
    const built = buildAliasRule("달리기", "러닝", [], () => new Date("2026-07-14T00:00:00Z"));
    expect(built.kind).toBe("alias");
    expect(built.condition.alias).toBe("달리기");
    expect(built.effect.canonicalName).toBe("러닝");
    expect(built.enabled).toBe(true);
  });
});
