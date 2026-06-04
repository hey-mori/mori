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
    expect(answer.text).toContain("로컬 LLM");
  });

  it("flags non-current memory in the answer", async () => {
    const answer = await answerFromMemory({
      question: "인증 결정",
      acceptedMemories: [memory("a", { title: "인증 방식 결정", status: "stale" })],
    });
    expect(answer.citations[0]?.isCurrent).toBe(false);
    expect(answer.containsNonCurrent).toBe(true);
  });
});
