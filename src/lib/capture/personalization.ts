/**
 * Personalization · applies the user's accumulated corrections to a capture
 * (architecture doc §7). Corrections become `KernelRule`s; this module
 * interprets them so the next capture reflects what the user taught Mori,
 * and every automated application can cite the rule that drove it.
 *
 * Pure and rule-kind-typed: the generic `condition` / `effect` bags on
 * `KernelRule` are read through the narrow accessors here so the rest of the
 * pipeline never hand-parses a rule. MVP kinds: alias, classification,
 * context-binding, automation-level.
 */
import type { AutomationLevel } from "./applyPolicy";
import type { RecordProposal } from "./captureTypes";
import { createKernelId } from "../record-kernel/recordFactory";
import type { KernelRule, RuleKind } from "../record-kernel/kernelTypes";

function rulesOfKind(rules: KernelRule[], kind: RuleKind): KernelRule[] {
  return rules.filter((rule) => rule.enabled && rule.kind === kind);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Maps an entity name through the user's alias rules to its canonical name.
 * "달리기 → 러닝" is an alias rule; every past and future record keeps its own
 * text, but recognised mentions resolve to the one canonical name.
 */
export function normalizeEntityName(name: string, rules: KernelRule[]): string {
  for (const rule of rulesOfKind(rules, "alias")) {
    if (asString(rule.condition.alias) === name) {
      return asString(rule.effect.canonicalName) ?? name;
    }
  }
  return name;
}

export type ClassificationResult = {
  schemaId: string;
  addedContextIds: string[];
  /** Ids of the rules that changed this proposal, for the derivation trail. */
  appliedRuleIds: string[];
};

function proposalMatchesCondition(proposal: RecordProposal, condition: KernelRule["condition"]): boolean {
  const schemaId = asString(condition.schemaId);
  if (schemaId && schemaId !== proposal.schemaId) return false;
  const keywords = asStringArray(condition.keywords);
  if (keywords.length > 0) {
    const haystack = `${proposal.title}\n${proposal.body}`;
    if (!keywords.some((keyword) => haystack.includes(keyword))) return false;
  }
  // A rule with neither a schema nor keywords matches nothing (avoids a rule
  // that silently reclassifies every capture).
  return Boolean(schemaId) || keywords.length > 0;
}

/**
 * Applies classification and context-binding rules to a proposal: a
 * classification rule may change the schema ("이런 작업은 개인 연구로"), a
 * context-binding rule attaches a context ("이 저장소는 항상 X에 연결").
 */
export function classifyProposal(proposal: RecordProposal, rules: KernelRule[]): ClassificationResult {
  let schemaId = proposal.schemaId;
  const addedContextIds: string[] = [];
  const appliedRuleIds: string[] = [];

  for (const rule of rulesOfKind(rules, "classification")) {
    if (!proposalMatchesCondition(proposal, rule.condition)) continue;
    const nextSchema = asString(rule.effect.schemaId);
    if (nextSchema) {
      schemaId = nextSchema;
      appliedRuleIds.push(rule.id);
    }
  }

  for (const rule of rulesOfKind(rules, "context-binding")) {
    if (!proposalMatchesCondition(proposal, rule.condition)) continue;
    const contextId = asString(rule.effect.contextId);
    if (contextId && !addedContextIds.includes(contextId)) {
      addedContextIds.push(contextId);
      appliedRuleIds.push(rule.id);
    }
  }

  return { schemaId, addedContextIds, appliedRuleIds };
}

/**
 * The automation level for a proposal's schema + contexts, from
 * automation-level rules. Most specific wins: a rule naming both schema and
 * context beats a schema-only rule. Absent any rule, returns `fallback`.
 */
export function automationLevelFor(
  schemaId: string,
  contextIds: string[],
  rules: KernelRule[],
  fallback: AutomationLevel = "auto",
): AutomationLevel {
  let best: { specificity: number; level: AutomationLevel } | null = null;
  for (const rule of rulesOfKind(rules, "automation-level")) {
    const ruleSchema = asString(rule.condition.schemaId);
    const ruleContext = asString(rule.condition.contextId);
    if (ruleSchema && ruleSchema !== schemaId) continue;
    if (ruleContext && !contextIds.includes(ruleContext)) continue;
    const level = asString(rule.effect.level) as AutomationLevel | undefined;
    if (!level) continue;
    const specificity = (ruleSchema ? 1 : 0) + (ruleContext ? 1 : 0);
    if (!best || specificity > best.specificity) best = { specificity, level };
  }
  return best?.level ?? fallback;
}

/** Builds an alias rule from a user rename ("달리기 → 러닝"). */
export function buildAliasRule(
  from: string,
  to: string,
  learnedFromRevisionIds: string[] = [],
  now: () => Date = () => new Date(),
): KernelRule {
  return {
    id: createKernelId("rule"),
    kind: "alias",
    condition: { alias: from },
    effect: { canonicalName: to },
    learnedFromRevisionIds,
    enabled: true,
    createdAt: now().toISOString(),
  };
}
