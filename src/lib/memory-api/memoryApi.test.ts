import { describe, expect, it, vi } from "vitest";
import { memoryAsk, memoryDefineTerm, memoryGlossary, memorySearch } from "./memoryApi";
import type { MemoryCapabilityInput } from "./memoryApiTypes";
import type { StoredAcceptedProjectMemory } from "../storage/storageTypes";
import type { SourceRef, TimelineEvent } from "../../domain/types";
import type { GlossaryTerm } from "../glossary/glossaryTypes";

function memory(id: string, title: string): StoredAcceptedProjectMemory {
  return {
    id,
    projectId: "p-1",
    kind: "promotedDecision",
    title,
    summary: `Summary for ${title}`,
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
  } as StoredAcceptedProjectMemory;
}

function event(id: string, title: string, summary: string): TimelineEvent {
  return { id, title, summary } as unknown as TimelineEvent;
}

function source(id: string, title: string, detail: string): SourceRef {
  return { id, title, detail } as unknown as SourceRef;
}

const input: MemoryCapabilityInput = {
  acceptedMemories: [memory("m1", "인증 방식 결정")],
  reviewActions: [],
  events: [event("e1", "인증 흐름 구현", "searchAcceptedMemories 호출 추가")],
  sources: [source("s1", "auth notes", "JWT 관련")],
};

describe("memorySearch", () => {
  it("returns both accepted-memory hits and active-session references", () => {
    const result = memorySearch(input, { text: "인증" });
    expect(result.memories.matchCount).toBeGreaterThanOrEqual(1);
    expect(result.references.some((r) => r.refId === "e1")).toBe(true);
  });

  it("searches across sessionEvidence with attribution when provided", () => {
    const crossSession: MemoryCapabilityInput = {
      ...input,
      // Active-session top-level evidence is ignored once sessionEvidence is set.
      events: [event("e1", "인증 흐름 구현", "활성 세션")],
      sessionEvidence: [
        {
          sessionId: "s2",
          sessionTitle: "라우팅 세션",
          events: [event("e9", "인증 미들웨어", "다른 세션의 근거")],
          sources: [],
        },
      ],
    };
    const result = memorySearch(crossSession, { text: "인증" });
    const hit = result.references.find((r) => r.refId === "e9");
    expect(hit?.sessionLabel).toBe("라우팅 세션");
    // The active-session top-level event is not double-counted.
    expect(result.references.some((r) => r.refId === "e1")).toBe(false);
  });
});

describe("memoryAsk", () => {
  it("delegates to answerFromMemory and uses the injected LLM", async () => {
    const llm = vi.fn().mockResolvedValue("JWT로 결정했습니다 [M1]");
    const answer = await memoryAsk(input, "인증 결정", { llm });
    expect(answer.basis).toBe("llm");
    expect(answer.text).toContain("JWT");
  });

  it("degrades honestly without an LLM", async () => {
    const answer = await memoryAsk(input, "인증 결정");
    expect(["deterministicFallback", "noMemory"]).toContain(answer.basis);
  });
});

describe("memoryGlossary", () => {
  it("extracts terms from the active session evidence", () => {
    const result = memoryGlossary(input);
    expect(result.terms.some((t) => t.term === "searchAcceptedMemories")).toBe(true);
  });
});

describe("memoryDefineTerm", () => {
  it("delegates to defineGlossaryTerm with the injected LLM", async () => {
    const term: GlossaryTerm = {
      term: "JWT",
      kind: "acronym",
      occurrences: 1,
      evidenceRefs: [{ kind: "source", id: "s1", title: "auth notes" }],
      salience: 1.3,
    };
    const llm = vi.fn().mockResolvedValue("JWT는 서명된 토큰입니다.");
    const def = await memoryDefineTerm(term, { llm });
    expect(def.basis).toBe("llm");
    expect(def.text).toContain("JWT");
  });
});
