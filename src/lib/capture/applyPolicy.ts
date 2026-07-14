/**
 * Apply policy · the six-factor decision that routes a proposal to
 * auto-apply, provisional, or confirm (architecture doc §5.2).
 *
 * The decision is a function of the proposal and its context, never of "who
 * wrote the input" (correcting the earlier category error). Raw capture is
 * always preserved regardless of what this returns; this governs only the
 * interpretation.
 */
import type { RecordStatus } from "../record-kernel/kernelTypes";

/** How aggressively a schema or context wants its records applied. Stored on
 *  schema/context settings later; a plain default for the pilot. */
export type AutomationLevel = "auto" | "assisted" | "manual";

export type ApplyFactors = {
  /** 0..1 confidence in the interpretation. */
  confidence: number;
  /** Does applying it edit or merge existing records? */
  mutatesExisting: boolean;
  /** Does it introduce an entity Mori has not seen before? */
  createsNewEntity: boolean;
  /** Did the raw content trip secret / sensitive detection? */
  sensitive: boolean;
  /** The effective automation level for this proposal's schema / context. */
  automationLevel: AutomationLevel;
  /** Can the apply be undone as a single reversible step? */
  reversible: boolean;
};

export type ApplyDecision = "auto" | "provisional" | "confirm";

/** Below this, an interpretation is too uncertain to apply without a look. */
export const CONFIRM_CONFIDENCE_FLOOR = 0.5;
/** At or above this (with the other gates clear), auto-apply is allowed. */
export const AUTO_CONFIDENCE_CEILING = 0.75;

export type ApplyEvaluation = {
  decision: ApplyDecision;
  /** The factor that drove the decision, for honest disclosure. */
  reason: string;
};

/**
 * The decision tree. Order matters: the confirm gates (sensitive, risky
 * mutation, manual, too-uncertain) are checked first so nothing dangerous
 * slips into auto. Everything that clears them is auto when the schema opts
 * in and confidence is high, provisional otherwise.
 */
export function evaluateApply(factors: ApplyFactors): ApplyEvaluation {
  if (factors.sensitive) {
    return { decision: "confirm", reason: "민감할 수 있는 내용이라 확인이 필요합니다" };
  }
  if (factors.mutatesExisting && !factors.reversible) {
    return { decision: "confirm", reason: "기존 기록을 되돌리기 어렵게 바꿉니다" };
  }
  if (factors.automationLevel === "manual") {
    return { decision: "confirm", reason: "이 유형은 항상 확인하도록 설정되어 있습니다" };
  }
  if (factors.confidence < CONFIRM_CONFIDENCE_FLOOR) {
    return { decision: "confirm", reason: "해석이 불확실해 확인이 필요합니다" };
  }

  const autoEligible =
    factors.automationLevel === "auto" &&
    factors.confidence >= AUTO_CONFIDENCE_CEILING &&
    !factors.mutatesExisting &&
    !factors.createsNewEntity;
  if (autoEligible) {
    return { decision: "auto", reason: "확실하고 되돌릴 수 있어 자동으로 정리했습니다" };
  }

  if (factors.createsNewEntity) {
    return { decision: "provisional", reason: "새로운 항목이 생겨 잠정으로 두었습니다" };
  }
  return { decision: "provisional", reason: "자동으로 정리했지만 확인 전까지 잠정입니다" };
}

/** The record status a decision maps to. */
export function statusForDecision(decision: ApplyDecision): RecordStatus {
  switch (decision) {
    case "auto":
      return "active";
    case "provisional":
      return "provisional";
    case "confirm":
      return "candidate";
  }
}
