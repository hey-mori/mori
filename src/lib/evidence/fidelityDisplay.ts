/**
 * Capture-fidelity display — single source of truth for how a
 * {@link CaptureFidelity} renders. Mirrors `trust.ts`: surfaces read the
 * label / tone / reason copy from here so the honesty signal never drifts
 * between Import Review and the Evidence Hub.
 */
import type { CaptureFidelity, CaptureFidelityLevel } from "../../domain/types";
import type { ProductStateTone } from "../product-state/productStateLabels";

export type CaptureFidelityDisplay = {
  level: CaptureFidelityLevel;
  /** Whether a badge is worth surfacing — everything except a complete capture. */
  shouldSurface: boolean;
  label: string;
  description: string;
  tone: ProductStateTone;
  /** Reason codes mapped to short Korean phrases (unknown codes pass through). */
  reasonLabels: string[];
};

const LEVEL_TABLE: Record<
  CaptureFidelityLevel,
  { label: string; description: string; tone: ProductStateTone }
> = {
  full: { label: "완전", description: "완전한 캡처로 보입니다.", tone: "neutral" },
  partial: { label: "일부만 캡처", description: "일부가 빠진 캡처로 보입니다.", tone: "warning" },
  fragment: { label: "조각 캡처", description: "앞뒤가 잘린 조각으로 보입니다.", tone: "danger" },
  unknown: { label: "완전성 확인 불가", description: "캡처의 완전성을 확인할 수 없습니다.", tone: "neutral" },
};

const REASON_LABELS: Record<string, string> = {
  empty: "내용 없음",
  noRoleMarkers: "역할 구분 없음",
  startsMidConversation: "대화 중간부터 시작",
  truncationMarker: "잘림 표시 있음",
  assistantOnly: "어시스턴트 발화만 있음",
  noAssistantResponses: "응답이 캡처되지 않음",
  truncatedHunk: "diff가 중간에 잘림",
  excerptOnly: "페이지 발췌만",
  noSessionStart: "세션 시작 누락",
  noSessionEnd: "세션 종료 누락",
};

export function getCaptureFidelityDisplay(fidelity: CaptureFidelity): CaptureFidelityDisplay {
  const base = LEVEL_TABLE[fidelity.level] ?? LEVEL_TABLE.unknown;
  return {
    level: fidelity.level,
    shouldSurface: fidelity.level !== "full",
    label: base.label,
    description: base.description,
    tone: base.tone,
    reasonLabels: fidelity.reasons.map((code) => REASON_LABELS[code] ?? code),
  };
}

/** One-line `description (reason, reason)` string for tooltips and limitations copy. */
export function describeCaptureFidelity(fidelity: CaptureFidelity): string {
  const display = getCaptureFidelityDisplay(fidelity);
  return display.reasonLabels.length > 0
    ? `${display.description} (${display.reasonLabels.join(", ")})`
    : display.description;
}
