import { describe, expect, it } from "vitest";
import { buildAskMoriContext, extractQueryTerms } from "./askMoriContext";
import type {
  QueryableMemoryReference,
  QueryableMemoryResult,
} from "../project-memory/queryableMemory";

function memResult(overrides: Partial<QueryableMemoryResult> = {}): QueryableMemoryResult {
  return {
    memoryId: "m-1",
    kind: "promotedDecision",
    status: "accepted",
    title: "인증 방식 결정",
    importance: "high",
    snippet: "JWT 기반 인증으로 결정",
    matchedField: "title",
    matchReason: "제목 일치",
    evidenceCount: 1,
    sourceSessionCount: 1,
    isCurrent: true,
    ...overrides,
  };
}

function reference(overrides: Partial<QueryableMemoryReference> = {}): QueryableMemoryReference {
  return {
    resultKind: "timelineEvent",
    refId: "e-1",
    title: "로그인 흐름 구현",
    snippet: "auth 미들웨어 추가",
    matchedField: "title",
    matchReason: "Event title match",
    contextLabel: "implementation",
    ...overrides,
  };
}

describe("extractQueryTerms", () => {
  it("extracts Korean nouns and strips trailing particles", () => {
    const terms = extractQueryTerms("이 프로젝트에서 인증은 어떻게 결정했지?");
    expect(terms).toContain("인증");
    expect(terms).toContain("프로젝트");
    // stopword-ish single syllable and filler dropped
    expect(terms).not.toContain("이");
    expect(terms).not.toContain("어떻게");
  });

  it("extracts English content words and drops question fillers", () => {
    const terms = extractQueryTerms("How did we decide on auth?");
    expect(terms).toContain("auth");
    expect(terms).toContain("decide");
    expect(terms).not.toContain("we");
    expect(terms).not.toContain("how");
  });

  it("dedupes terms regardless of particle form", () => {
    const terms = extractQueryTerms("인증 인증은 auth auth");
    expect(terms.filter((t) => t === "인증")).toHaveLength(1);
    expect(terms.filter((t) => t === "auth")).toHaveLength(1);
  });

  it("returns an empty list for a stopword-only question", () => {
    expect(extractQueryTerms("왜?")).toEqual([]);
  });
});

describe("buildAskMoriContext", () => {
  it("tags memory and reference candidates and mirrors them as citations", () => {
    const { prompt, citations } = buildAskMoriContext({
      question: "인증은 어떻게 결정했지?",
      memoryResults: [memResult()],
      references: [reference()],
    });

    expect(prompt.userPrompt).toContain("[M1]");
    expect(prompt.userPrompt).toContain("인증 방식 결정");
    expect(prompt.userPrompt).toContain("[R1]");
    expect(prompt.systemPrompt).toContain("ONLY");

    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({
      kind: "acceptedMemory",
      refId: "m-1",
      tag: "M1",
      isCurrent: true,
    });
    expect(citations[1]).toMatchObject({
      kind: "timelineEvent",
      refId: "e-1",
      tag: "R1",
      isCurrent: false,
    });
  });

  it("flags non-current memory in the prompt", () => {
    const { prompt } = buildAskMoriContext({
      question: "인증",
      memoryResults: [memResult({ status: "stale", isCurrent: false })],
      references: [],
    });
    expect(prompt.userPrompt).toContain("(non-current)");
  });

  it("renders empty placeholders when there are no candidates", () => {
    const { prompt, citations } = buildAskMoriContext({
      question: "무엇이든",
      memoryResults: [],
      references: [],
    });
    expect(prompt.userPrompt).toContain("(none)");
    expect(citations).toHaveLength(0);
  });
});
