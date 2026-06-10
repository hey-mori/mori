import { describe, expect, it } from "vitest";
import { phaseHeadline } from "./AiWorkflowView";

describe("phaseHeadline", () => {
  it("uses the phase's key decision as the headline, not the raw request or an issue", () => {
    expect(
      phaseHeadline({
        moments: [
          { kind: "issue", title: "N+1 쿼리" },
          { kind: "decision", title: "LLM Provider SPI 패턴 적용" },
          { kind: "decision", title: "어댑터 도입" },
        ],
        label: "이거 어떻게 하면 돼?",
      }),
    ).toBe("LLM Provider SPI 패턴 적용");
  });

  it("falls back to the first issue when the phase surfaced one but made no decision", () => {
    expect(
      phaseHeadline({ moments: [{ kind: "issue", title: "검색이 느림" }], label: "Wiki 삭제 기능 만들자" }),
    ).toBe("검색이 느림");
  });

  it("falls back to the cleaned request only when the phase produced no moment", () => {
    expect(phaseHeadline({ moments: [], label: "Wiki 삭제 기능 만들자" })).toBe("Wiki 삭제 기능 만들자");
  });
});
