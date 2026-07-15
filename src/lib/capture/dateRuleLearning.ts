/**
 * Date-rule learning · a repeated date correction made durable as a
 * `date-inference` rule (architecture §7; time-and-placement-ux §2).
 *
 * The pilot pattern is the common one: small-hours captures usually describe
 * the previous day. After the user resolves that correction a few times, Mori
 * offers a rule; once enabled, `inferDateFromRules` applies it at capture time
 * so future small-hours notes land on the previous day (marked `ai-inferred`,
 * still confirmable) instead of piling up date-undecided.
 */
import { createKernelId } from "../record-kernel/recordFactory";
import type { KernelRule, TimeBasis } from "../record-kernel/kernelTypes";

/** How the late-night rule is encoded. Kept explicit so the effect is
 *  inspectable in settings, not a magic constant. */
const LATE_NIGHT = { capturedBeforeHour: 5, offsetDays: -1 } as const;

export function isLateNightRule(rule: KernelRule): boolean {
  return (
    rule.kind === "date-inference" &&
    typeof rule.condition.capturedBeforeHour === "number" &&
    typeof rule.effect.offsetDays === "number"
  );
}

/** Does an enabled late-night date rule already exist? (Do not propose twice.) */
export function hasLateNightRule(rules: KernelRule[]): boolean {
  return rules.some((rule) => rule.enabled && isLateNightRule(rule));
}

/** Builds the late-night → previous-day rule. `learnedFrom` carries the
 *  revision ids of the corrections that taught it, when known. */
export function buildLateNightRule(
  createdAt: string,
  learnedFrom: string[] = [],
): KernelRule {
  return {
    id: createKernelId("rule"),
    kind: "date-inference",
    condition: { capturedBeforeHour: LATE_NIGHT.capturedBeforeHour },
    effect: { offsetDays: LATE_NIGHT.offsetDays },
    learnedFromRevisionIds: learnedFrom,
    enabled: true,
    createdAt,
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Applies an enabled late-night date rule to a still-undecided capture: when
 * the capture happened in the small hours, infer the previous day. Returns the
 * inferred date (to be marked `ai-inferred`) or null when no rule fires.
 */
export function inferDateFromRules(
  timeBasis: TimeBasis,
  rules: KernelRule[],
  capturedAt: string,
): { occurredStart: string; timeConfidence: number } | null {
  if (timeBasis !== "unknown") return null;
  const rule = rules.find((candidate) => candidate.enabled && isLateNightRule(candidate));
  if (!rule) return null;

  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) return null;
  const beforeHour = Number(rule.condition.capturedBeforeHour);
  if (captured.getHours() >= beforeHour) return null;

  const offset = Number(rule.effect.offsetDays);
  const target = new Date(captured.getFullYear(), captured.getMonth(), captured.getDate() + offset);
  return { occurredStart: isoDay(target), timeConfidence: 0.7 };
}
