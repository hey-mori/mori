import { describe, expect, it } from "vitest";
import {
  buildImportCandidateFromClaudeCodeSession,
  buildImportCandidateFromClaudeConversation,
  pairMessagesIntoTurns,
  rebindCandidateToSession,
} from "./claudeImport";
import type {
  ClaudeCodeSessionDetail,
  ClaudeConversationDetail,
} from "./types";

const captureInput = {
  projectId: "proj-1",
  sessionId: "sess-1",
  capturedAt: "2026-05-21T12:00:00.000Z",
};

describe("pairMessagesIntoTurns", () => {
  it("pairs consecutive human + assistant messages into one turn", () => {
    const turns = pairMessagesIntoTurns([
      {
        id: "m1",
        role: "human",
        content: "What's the plan?",
        createdAt: "2026-05-21T00:00:00Z",
      },
      {
        id: "m2",
        role: "assistant",
        content: "Here is the plan: ...",
        createdAt: "2026-05-21T00:00:01Z",
      },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].title).toContain("plan");
    expect(turns[0].summary).toContain("Here is");
    expect(turns[0].timestamp).toBe("2026-05-21T00:00:01Z");
  });

  it("keeps an unmatched human turn rather than silently dropping it", () => {
    const turns = pairMessagesIntoTurns([
      {
        id: "m1",
        role: "human",
        content: "Question with no answer",
        createdAt: "2026-05-21T00:00:00Z",
      },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].title).toContain("Question");
    // Without an assistant message, the title seed is reused as the
    // summary — the point of the test is that the human turn survives.
    expect(turns[0].summary).toContain("Question");
  });
});

describe("buildImportCandidateFromClaudeConversation", () => {
  it("produces a source + per-turn timeline events", () => {
    const conversation: ClaudeConversationDetail = {
      id: "conv-1",
      title: "Plan brainstorming",
      createdAt: "2026-05-20T00:00:00Z",
      updatedAt: "2026-05-21T00:00:00Z",
      source: "desktop",
      messageCount: 2,
      messages: [
        {
          id: "m1",
          role: "human",
          content: "Lay out the next steps for Mori.",
          createdAt: "2026-05-20T12:00:00Z",
        },
        {
          id: "m2",
          role: "assistant",
          content: "Sure — first, ship Claude Connections.",
          createdAt: "2026-05-20T12:00:01Z",
        },
      ],
    };
    const candidate = buildImportCandidateFromClaudeConversation(conversation, captureInput);
    expect(candidate.events).toHaveLength(1);
    expect(candidate.events[0].sessionId).toBe("sess-1");
    expect(candidate.events[0].projectId).toBe("proj-1");
    expect(candidate.events[0].trustLevel).toBe("observed");
    expect(candidate.events[0].type).toBe("aiConversation");
    expect(candidate.source.kind).toBe("claudeTranscript");
    expect(candidate.source.relatedEventIds).toEqual([candidate.events[0].id]);
    expect(candidate.source.title).toContain("Plan brainstorming");
  });

  it("always emits at least one event even when the conversation is empty", () => {
    const conversation: ClaudeConversationDetail = {
      id: "conv-empty",
      title: "",
      createdAt: "",
      updatedAt: "",
      source: "desktop",
      messageCount: 0,
      messages: [],
    };
    const candidate = buildImportCandidateFromClaudeConversation(conversation, captureInput);
    expect(candidate.events).toHaveLength(1);
    expect(candidate.events[0].summary).toContain("no Q&A turns");
    expect(candidate.source.title).toContain("Claude");
  });
});

describe("buildImportCandidateFromClaudeCodeSession", () => {
  it("uses observed trust and claudeTranscript kind for code sessions", () => {
    const session: ClaudeCodeSessionDetail = {
      sessionId: "abc-123",
      projectPath: "-Users-alice-mori",
      projectName: "/Users/alice/mori",
      filePath: "/somewhere/abc-123.jsonl",
      startedAt: "2026-05-20T12:00:00Z",
      messageCount: 2,
      title: "Set up Claude Connections page",
      messages: [
        {
          id: "m1",
          role: "human",
          content: "Set up Claude Connections page",
          createdAt: "2026-05-20T12:00:00Z",
        },
        {
          id: "m2",
          role: "assistant",
          content: "On it — discovery first, then UI.",
          createdAt: "2026-05-20T12:00:01Z",
        },
      ],
    };
    const candidate = buildImportCandidateFromClaudeCodeSession(session, captureInput);
    expect(candidate.events).toHaveLength(1);
    expect(candidate.source.kind).toBe("claudeTranscript");
    expect(candidate.source.title).toContain("Claude Code");
    expect(candidate.source.detail).toContain("/Users/alice/mori");
  });
});

describe("rebindCandidateToSession", () => {
  const base: ClaudeCodeSessionDetail = {
    sessionId: "abc-123",
    projectPath: "-Users-alice-mori",
    projectName: "/Users/alice/mori",
    filePath: "/somewhere/abc-123.jsonl",
    startedAt: "2026-05-20T12:00:00Z",
    messageCount: 2,
    title: "Set up Claude Connections page",
    messages: [
      { id: "m1", role: "human", content: "Set up the page", createdAt: "2026-05-20T12:00:00Z" },
      { id: "m2", role: "assistant", content: "On it.", createdAt: "2026-05-20T12:00:01Z" },
    ],
  };

  it("rewrites the session id on the source and every event", () => {
    const candidate = buildImportCandidateFromClaudeCodeSession(base, captureInput);
    const rebound = rebindCandidateToSession(candidate, {
      sessionId: "sess-new",
      projectId: "proj-new",
    });

    expect(rebound.source.sessionId).toBe("sess-new");
    expect(rebound.events.every((event) => event.sessionId === "sess-new")).toBe(true);
    expect(rebound.events.every((event) => event.projectId === "proj-new")).toBe(true);
  });

  it("keeps stable event / source ids and connector identities intact", () => {
    const candidate = buildImportCandidateFromClaudeCodeSession(base, captureInput);
    const rebound = rebindCandidateToSession(candidate, { sessionId: "sess-new" });

    expect(rebound.source.id).toBe(candidate.source.id);
    expect(rebound.events.map((event) => event.id)).toEqual(
      candidate.events.map((event) => event.id),
    );
    expect(rebound.events[0].connectorEventId).toBe(candidate.events[0].connectorEventId);
    // projectId untouched when no project override is supplied.
    expect(rebound.events[0].projectId).toBe(candidate.events[0].projectId);
  });
});
