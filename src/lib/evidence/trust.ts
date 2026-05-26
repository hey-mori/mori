/**
 * Trust display — single source of truth.
 *
 * Before this milestone three near-duplicate helpers lived in three different
 * folders (`privacy/trust.ts`, `sources/traceability.ts`, `relationships/
 * relationshipDisplay.ts`). Each had a slightly different return shape and
 * tone vocabulary. This module unifies them and re-exports the legacy names
 * so existing callers keep compiling.
 */
import type { TrustLevel } from "../../domain/types";

export type TrustTone = "green" | "blue" | "purple";

export type TrustDisplay = {
  level: TrustLevel;
  label: string;
  description: string;
  tone: TrustTone;
};

const TRUST_TABLE: Record<TrustLevel, TrustDisplay> = {
  verified: {
    level: "verified",
    label: "검증됨",
    description: "원본 근거가 명확한 이벤트입니다.",
    tone: "green",
  },
  observed: {
    level: "observed",
    label: "관찰됨",
    description: "시스템이 관찰했지만 의미 해석이 필요한 이벤트입니다.",
    tone: "blue",
  },
  inferred: {
    level: "inferred",
    label: "추론됨",
    description: "AI가 소스와 맥락을 바탕으로 추론한 항목입니다.",
    tone: "purple",
  },
};

export function getTrustDisplay(level: TrustLevel): TrustDisplay {
  return TRUST_TABLE[level] ?? TRUST_TABLE.inferred;
}

export function getTrustLabel(level: TrustLevel): string {
  return getTrustDisplay(level).label;
}

export function getTrustTone(level: TrustLevel): TrustTone {
  return getTrustDisplay(level).tone;
}

/**
 * Tone class for a confidence percentage. Inferred events get a richer
 * color-coded confidence chip; this helper centralises the buckets.
 */
export function getConfidenceTone(percent: number): "green" | "blue" | "orange" | "red" | "gray" {
  if (!Number.isFinite(percent)) return "gray";
  if (percent >= 85) return "green";
  if (percent >= 60) return "blue";
  if (percent >= 40) return "orange";
  return "red";
}

export function describeConfidence(percent: number): { label: string; tone: ReturnType<typeof getConfidenceTone> } {
  const tone = getConfidenceTone(percent);
  return { label: `신뢰도 ${Math.round(percent)}%`, tone };
}
