import { describe, expect, it } from "vitest";
import { searchProjectMemoryReferences } from "./queryableMemory";
import type { EventActor, TimelineEvent } from "../../domain/types";

function event(id: string, title: string, actor?: EventActor): TimelineEvent {
  return {
    id,
    sessionId: "s1",
    projectId: "p1",
    start: "2026-06-04T09:00:00Z",
    type: "aiConversation",
    title,
    summary: title,
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...(actor ? { actor } : {}),
  };
}

describe("searchProjectMemoryReferences tool exclusion", () => {
  it("excludes tool events so their raw output is never cited", () => {
    const refs = searchProjectMemoryReferences(
      {
        timelineEvents: [
          event("t1", "↳ 도구 결과: RAG-only test failed", "tool"),
          event("c1", "RAG 구조를 어떻게 갈지 논의", "assistant"),
        ],
      },
      { text: "rag" },
    );
    expect(refs.map((r) => r.refId)).toEqual(["c1"]);
  });

  it("excludes already-imported events whose title is a tool envelope even if actor is assistant", () => {
    const refs = searchProjectMemoryReferences(
      {
        timelineEvents: [
          // Leaky case: a tool-result paired with an assistant reply was
          // imported with actor "assistant" but a "↳ 도구 결과" title.
          event("a1", "↳ 도구 결과: RAG-only test", "assistant"),
          event("c1", "RAG 설계 결정", "assistant"),
        ],
      },
      { text: "rag" },
    );
    expect(refs.map((r) => r.refId)).toEqual(["c1"]);
  });
});
