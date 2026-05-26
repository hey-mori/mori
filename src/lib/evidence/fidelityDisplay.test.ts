import { describe, expect, it } from "vitest";
import { describeCaptureFidelity, getCaptureFidelityDisplay } from "./fidelityDisplay";

describe("getCaptureFidelityDisplay", () => {
  it("does not surface a full capture", () => {
    const display = getCaptureFidelityDisplay({ level: "full", reasons: [] });

    expect(display.shouldSurface).toBe(false);
    expect(display.tone).toBe("neutral");
  });

  it("surfaces a partial capture with a warning tone and mapped reasons", () => {
    const display = getCaptureFidelityDisplay({
      level: "partial",
      reasons: ["startsMidConversation", "truncationMarker"],
    });

    expect(display.shouldSurface).toBe(true);
    expect(display.tone).toBe("warning");
    expect(display.reasonLabels).toEqual(["대화 중간부터 시작", "잘림 표시 있음"]);
  });

  it("uses a danger tone for a fragment", () => {
    expect(getCaptureFidelityDisplay({ level: "fragment", reasons: [] }).tone).toBe("danger");
  });

  it("surfaces an unknown capture with a neutral tone", () => {
    const display = getCaptureFidelityDisplay({ level: "unknown", reasons: ["noRoleMarkers"] });

    expect(display.shouldSurface).toBe(true);
    expect(display.tone).toBe("neutral");
    expect(display.reasonLabels).toEqual(["역할 구분 없음"]);
  });

  it("passes unknown reason codes through unchanged", () => {
    const display = getCaptureFidelityDisplay({ level: "partial", reasons: ["someFutureCode"] });

    expect(display.reasonLabels).toEqual(["someFutureCode"]);
  });
});

describe("describeCaptureFidelity", () => {
  it("appends mapped reasons in parentheses", () => {
    const text = describeCaptureFidelity({ level: "partial", reasons: ["excerptOnly"] });

    expect(text).toBe("일부가 빠진 캡처로 보입니다. (페이지 발췌만)");
  });

  it("omits the parenthetical when there are no reasons", () => {
    const text = describeCaptureFidelity({ level: "full", reasons: [] });

    expect(text).toBe("완전한 캡처로 보입니다.");
  });
});
