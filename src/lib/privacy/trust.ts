import type { TrustLevel } from "../../domain/types";

export function getTrustDisplay(trustLevel: TrustLevel): { label: string; description: string; tone: string } {
  if (trustLevel === "verified") {
    return {
      label: "Verified",
      description: "원본 근거가 명확한 이벤트입니다.",
      tone: "green",
    };
  }

  if (trustLevel === "observed") {
    return {
      label: "Observed",
      description: "시스템이 관찰했지만 의미 해석이 필요한 이벤트입니다.",
      tone: "blue",
    };
  }

  return {
    label: "Inferred",
    description: "AI가 소스와 맥락을 바탕으로 추론한 항목입니다.",
    tone: "purple",
  };
}
