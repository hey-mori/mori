import { describe, expect, it, vi } from "vitest";
import { answerFromMemory } from "./askMoriAnswer";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";

function memory(
  id: string,
  overrides: Partial<StoredAcceptedProjectMemory> = {},
): StoredAcceptedProjectMemory {
  return {
    id,
    projectId: "p-1",
    kind: "promotedDecision",
    title: `Decision ${id}`,
    summary: `Summary for ${id}`,
    status: "accepted",
    importance: "medium",
    confidence: { label: "medium" },
    evidenceRefs: [{ kind: "session", sessionId: "s-1", sessionTitle: "Sprint one" }],
    sourceSessionIds: ["s-1"],
    originProposalIds: [`prop-${id}`],
    relatedIssueIds: [],
    relatedDecisionIds: [],
    proposedAction: "promote",
    sensitivity: "normal",
    resumeEligible: true,
    reportEligibility: "personal",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
    acceptedAt: "2026-05-12T10:00:00Z",
    acceptedBy: "local-user",
    reviewActionIds: [],
    schemaVersion: 1,
    adapter: "browser-local-storage",
    ...overrides,
  };
}

describe("answerFromMemory", () => {
  it("returns a noMemory answer when retrieval finds nothing", async () => {
    const answer = await answerFromMemory({
      question: "인증은 어떻게 했지?",
      acceptedMemories: [],
    });
    expect(answer.basis).toBe("noMemory");
    expect(answer.usedLlm).toBe(false);
    expect(answer.citations).toHaveLength(0);
    expect(answer.containsNonCurrent).toBe(false);
  });

  it("falls back to a deterministic listing when no LLM is provided", async () => {
    const answer = await answerFromMemory({
      question: "인증은 어떻게 했지?",
      acceptedMemories: [memory("a", { title: "인증 방식 결정", summary: "JWT 채택" })],
    });
    expect(answer.basis).toBe("deterministicFallback");
    expect(answer.usedLlm).toBe(false);
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]?.refId).toBe("a");
    expect(answer.text).toContain("인증 방식 결정");
  });

  it("discloses when the answer leaned on provisional memory", async () => {
    const answer = await answerFromMemory({
      question: "인증은 어떻게 했지?",
      acceptedMemories: [
        memory("a", { title: "인증 방식 결정", summary: "JWT 채택", status: "provisional" }),
      ],
    });
    expect(answer.containsProvisional).toBe(true);
    expect(answer.citations[0]?.provisional).toBe(true);
    // A confirmed memory does not trip the provisional flag.
    const confirmed = await answerFromMemory({
      question: "인증은 어떻게 했지?",
      acceptedMemories: [memory("b", { title: "인증 방식 결정", summary: "JWT 채택" })],
    });
    expect(confirmed.containsProvisional).toBe(false);
    expect(confirmed.citations[0]?.provisional).toBe(false);
  });

  it("uses the injected LLM and returns its prose as an llm answer", async () => {
    const llm = vi.fn().mockResolvedValue("JWT 기반으로 결정했습니다 [M1]");
    const answer = await answerFromMemory(
      { question: "인증 결정", acceptedMemories: [memory("a", { title: "인증 방식 결정" })] },
      { llm },
    );
    expect(llm).toHaveBeenCalledOnce();
    expect(answer.basis).toBe("llm");
    expect(answer.usedLlm).toBe(true);
    expect(answer.text).toBe("JWT 기반으로 결정했습니다 [M1]");
    expect(answer.citations[0]?.tag).toBe("M1");
  });

  it("degrades to the deterministic listing when the LLM throws", async () => {
    const llm = vi.fn().mockRejectedValue(new Error("unreachable"));
    const answer = await answerFromMemory(
      { question: "인증 결정", acceptedMemories: [memory("a", { title: "인증 방식 결정" })] },
      { llm },
    );
    expect(answer.basis).toBe("deterministicFallback");
    expect(answer.usedLlm).toBe(false);
    expect(answer.llmFailed).toBe(true);
    expect(answer.text).toContain("실패");
  });

  it("does not claim LLM failure when no LLM was configured", async () => {
    const answer = await answerFromMemory({
      question: "인증 결정",
      acceptedMemories: [memory("a", { title: "인증 방식 결정" })],
    });
    expect(answer.llmFailed).toBe(false);
    expect(answer.text).not.toContain("실패");
  });

  it("flags non-current memory in the answer", async () => {
    const answer = await answerFromMemory({
      question: "인증 결정",
      acceptedMemories: [memory("a", { title: "인증 방식 결정", status: "stale" })],
    });
    expect(answer.citations[0]?.isCurrent).toBe(false);
    expect(answer.containsNonCurrent).toBe(true);
  });

  // The question only names "인증". Memory `b` never mentions 인증, but `a`'s
  // title introduces "미들웨어", which `b` shares — so a second round reaches it.
  const expansionMemories = [
    memory("a", { title: "인증 미들웨어 도입", summary: "요청 가로채기" }),
    memory("b", { title: "미들웨어 토큰 검증", summary: "검증 로직" }),
  ];

  it("finds only the directly-matching memory in a single round", async () => {
    const answer = await answerFromMemory({
      question: "인증",
      acceptedMemories: expansionMemories,
    });
    expect(answer.citations.map((c) => c.refId)).toEqual(["a"]);
  });

  it("reaches differently-worded memory through a second retrieval round", async () => {
    const answer = await answerFromMemory({
      question: "인증",
      acceptedMemories: expansionMemories,
      expandRounds: 2,
    });
    const ids = answer.citations.map((c) => c.refId).sort();
    expect(ids).toEqual(["a", "b"]);
  });

  it("terminates when a round surfaces no new terms", async () => {
    const answer = await answerFromMemory({
      question: "인증",
      acceptedMemories: [memory("a", { title: "인증 방식 결정", summary: "JWT" })],
      expandRounds: 4,
    });
    // Only the one matching memory exists; extra rounds add nothing and the
    // loop stops cleanly instead of spinning.
    expect(answer.citations.map((c) => c.refId)).toEqual(["a"]);
  });

  it("bridges a Korean question to English-titled memory via synonyms", async () => {
    const answer = await answerFromMemory({
      question: "인증은 어떻게 했나요?",
      // The memory is titled in English; only the curated 인증→auth bridge
      // connects the Korean question to it in a single round.
      acceptedMemories: [memory("en", { title: "Auth rework", summary: "Moved to JWT" })],
    });
    expect(answer.citations.map((c) => c.refId)).toEqual(["en"]);
  });
});
