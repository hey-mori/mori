import { describe, expect, it } from "vitest";
import { phaseHeadline } from "./AiWorkflowView";

describe("phaseHeadline", () => {
  it("uses the phase's key decision as the headline, not the raw request", () => {
    expect(
      phaseHeadline({ decisions: ["LLM Provider SPI 패턴 적용", "어댑터 도입"], label: "이거 어떻게 하면 돼?" }),
    ).toBe("LLM Provider SPI 패턴 적용");
  });

  it("falls back to the cleaned request only when the phase produced no decision", () => {
    expect(phaseHeadline({ decisions: [], label: "Wiki 삭제 기능 만들자" })).toBe("Wiki 삭제 기능 만들자");
  });
});
