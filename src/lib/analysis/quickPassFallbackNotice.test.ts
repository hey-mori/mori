import { describe, expect, it } from "vitest";
import { getQuickPassFallbackNotice } from "./analysisStatusDisplay";

describe("getQuickPassFallbackNotice", () => {
  it("returns a notice with the reason when the LLM failed and fell back", () => {
    const notice = getQuickPassFallbackNotice([
      "Ollama Quick Pass (gemma4:e4b) failed: Ollama request failed with HTTP 404. Fell back to 규칙 기반 Quick Pass.",
      "Heuristic pass found 3 issues.",
    ]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("HTTP 404");
    expect(notice).toContain("설정");
  });

  it("reads the Korean note shape the run loop now writes", () => {
    const notice = getQuickPassFallbackNotice([
      "Ollama (gemma4:e4b) 분석 실패: Failed to fetch · 규칙 기반으로 대체했습니다.",
      "규칙 기반에서 이슈 3건을 찾았습니다.",
    ]);
    expect(notice).not.toBeNull();
    expect(notice).toContain("Failed to fetch");
    expect(notice).toContain("설정");
  });

  it("returns null when there was no fallback", () => {
    expect(getQuickPassFallbackNotice(["Heuristic pass found 3 issues."])).toBeNull();
    expect(getQuickPassFallbackNotice([])).toBeNull();
  });
});
