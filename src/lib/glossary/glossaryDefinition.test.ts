import { describe, expect, it, vi } from "vitest";
import { buildGlossaryDefinitionPrompt, defineGlossaryTerm } from "./glossaryDefinition";
import type { GlossaryTerm } from "./glossaryTypes";

function term(overrides: Partial<GlossaryTerm> = {}): GlossaryTerm {
  return {
    term: "JWT",
    kind: "acronym",
    occurrences: 3,
    evidenceRefs: [
      { kind: "event", id: "e1", title: "인증 방식 결정" },
      { kind: "event", id: "e2", title: "토큰 만료 처리" },
    ],
    salience: 3.9,
    ...overrides,
  };
}

describe("buildGlossaryDefinitionPrompt", () => {
  it("includes the term, shape, and occurrence titles", () => {
    const { systemPrompt, userPrompt } = buildGlossaryDefinitionPrompt(term());
    expect(systemPrompt).toContain("Korean");
    expect(userPrompt).toContain("Term: JWT");
    expect(userPrompt).toContain("Shape: acronym");
    expect(userPrompt).toContain("인증 방식 결정");
  });
});

describe("defineGlossaryTerm", () => {
  it("returns the LLM prose as an llm-basis definition", async () => {
    const llm = vi.fn().mockResolvedValue("JWT는 서명된 토큰 표준입니다. 이 작업에서는 인증에 사용됩니다.");
    const def = await defineGlossaryTerm(term(), { llm });
    expect(llm).toHaveBeenCalledOnce();
    expect(def.basis).toBe("llm");
    expect(def.usedLlm).toBe(true);
    expect(def.text).toContain("JWT는");
    expect(def.evidenceRefs).toHaveLength(2);
  });

  it("falls back to listing occurrences when no LLM is provided", async () => {
    const def = await defineGlossaryTerm(term());
    expect(def.basis).toBe("deterministicFallback");
    expect(def.usedLlm).toBe(false);
    expect(def.text).toContain("인증 방식 결정");
  });

  it("degrades to the fallback when the LLM throws", async () => {
    const llm = vi.fn().mockRejectedValue(new Error("unreachable"));
    const def = await defineGlossaryTerm(term(), { llm });
    expect(def.basis).toBe("deterministicFallback");
    expect(def.usedLlm).toBe(false);
  });

  it("handles a term with no occurrence titles", async () => {
    const def = await defineGlossaryTerm(term({ evidenceRefs: [] }));
    expect(def.text).toContain("정의를 생성하지 못했습니다");
  });
});
