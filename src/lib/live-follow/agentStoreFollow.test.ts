import { describe, expect, it } from "vitest";

import { buildImportCandidateFromClaudeCodeSession } from "../claude/claudeImport";
import type {
  ClaudeCodeSessionDelta,
  ClaudeCodeSessionDetail,
  ClaudeFileTouch,
  ClaudeMessage,
} from "../claude/types";
import { buildRequestSpans } from "../timeline/requestSpans";
import {
  appendDelta,
  buildFollowSubject,
  initialAgentStoreFollowState,
  runAgentStoreFollowPoll,
} from "./agentStoreFollow";
import { decideFollowReaction, followReducer, initialFollowState } from "./followController";

function msg(
  id: string,
  role: ClaudeMessage["role"],
  content: string,
  at: string,
  subkind?: ClaudeMessage["subkind"],
): ClaudeMessage {
  return { id, role, content, createdAt: at, ...(subkind ? { subkind } : {}) };
}

function delta(
  events: ClaudeMessage[],
  newOffset: number,
  stats?: Partial<ClaudeCodeSessionDelta["stats"]>,
  fileTouches: ClaudeFileTouch[] = [],
): ClaudeCodeSessionDelta {
  return {
    filePath: "/root/session.jsonl",
    newOffset,
    events,
    fileTouches,
    stats: {
      rawLines: stats?.rawLines ?? events.length,
      parsed: stats?.parsed ?? events.length,
      skipped: stats?.skipped ?? 0,
      unparseable: stats?.unparseable ?? 0,
    },
  };
}

describe("appendDelta", () => {
  it("appends new events, advances the offset, and sums stats", () => {
    let state = initialAgentStoreFollowState();
    const first = appendDelta(
      state,
      delta([msg("u1", "human", "first ask", "2026-01-01T00:00:00Z")], 120),
    );
    state = first.state;
    expect(first.newEventIds).toEqual(["u1"]);
    expect(state.offset).toBe(120);
    expect(state.messages).toHaveLength(1);
    expect(state.stats).toEqual({ rawLines: 1, parsed: 1, skipped: 0, unparseable: 0 });

    const second = appendDelta(
      state,
      delta([msg("a1", "assistant", "reply", "2026-01-01T00:00:01Z")], 260, {
        rawLines: 2,
        parsed: 1,
        skipped: 1,
      }),
    );
    state = second.state;
    expect(second.newEventIds).toEqual(["a1"]);
    expect(state.offset).toBe(260);
    expect(state.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    // Stats accumulate across deltas.
    expect(state.stats).toEqual({ rawLines: 3, parsed: 2, skipped: 1, unparseable: 0 });
  });

  it("dedupes a re-read of the same offset by message id and never moves the offset back", () => {
    const state = initialAgentStoreFollowState();
    const first = appendDelta(
      state,
      delta(
        [
          msg("u1", "human", "ask", "2026-01-01T00:00:00Z"),
          msg("a1", "assistant", "reply", "2026-01-01T00:00:01Z"),
        ],
        200,
      ),
    );
    // A defensive re-read returns u1/a1 again plus one genuinely new event, and
    // reports a smaller offset (a stale delta). Only the new event is added; the
    // offset does not regress.
    const second = appendDelta(
      first.state,
      delta(
        [
          msg("u1", "human", "ask", "2026-01-01T00:00:00Z"),
          msg("a1", "assistant", "reply", "2026-01-01T00:00:01Z"),
          msg("u2", "human", "next ask", "2026-01-01T00:00:02Z"),
        ],
        180,
      ),
    );
    expect(second.newEventIds).toEqual(["u2"]);
    expect(second.state.messages.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
    expect(second.state.offset).toBe(200);
  });

  it("dedupes identical file touches across a re-read", () => {
    const touch: ClaudeFileTouch = {
      path: "/repo/a.ts",
      tool: "Edit",
      changeKind: "edited",
      at: "2026-01-01T00:00:01Z",
      additions: 2,
      deletions: 1,
      messageId: "a1",
      diffPreview: "-old\n+new",
    };
    const state = initialAgentStoreFollowState();
    const first = appendDelta(
      state,
      delta([msg("a1", "assistant", "🔧 Edit: a.ts", "2026-01-01T00:00:01Z", "tool_use")], 100, undefined, [
        touch,
      ]),
    );
    expect(first.state.fileTouches).toHaveLength(1);
    // Re-reading the same content contributes no duplicate touch.
    const second = appendDelta(first.state, delta([], 100, { rawLines: 0, parsed: 0 }, [touch]));
    expect(second.state.fileTouches).toHaveLength(1);
  });
});

describe("turn-boundary parity with the full-read import path", () => {
  // The spec's first thing to verify: request boundaries computed from
  // accumulated deltas must match those from a one-shot import of the whole
  // session. Same messages, same order, split three ways as deltas.
  const messages: ClaudeMessage[] = [
    msg("u1", "human", "RAG 파이프라인 고쳐줘", "2026-01-01T00:00:00Z"),
    msg("a1", "assistant", "🔧 Bash: ls", "2026-01-01T00:00:01Z", "tool_use"),
    msg("u2", "human", "↳ 도구 결과: ok", "2026-01-01T00:00:02Z", "tool_result"),
    msg("a2", "assistant", "고쳤습니다.", "2026-01-01T00:00:03Z"),
    msg("u3", "human", "이제 테스트 추가해줘", "2026-01-01T00:00:04Z"),
    msg("a3", "assistant", "테스트를 추가했습니다.", "2026-01-01T00:00:05Z"),
  ];

  const meta = {
    sessionId: "sess-1",
    title: "RAG work",
    startedAt: "2026-01-01T00:00:00Z",
    projectName: "C:/dev/mori",
    filePath: "/root/session.jsonl",
  };
  const input = { projectId: "proj-1", sessionId: "sess-1", capturedAt: "2026-01-01T00:00:00Z" };

  function fullDetail(): ClaudeCodeSessionDetail {
    return {
      sessionId: meta.sessionId,
      projectPath: meta.projectName,
      projectName: meta.projectName,
      filePath: meta.filePath,
      startedAt: meta.startedAt,
      messageCount: messages.length,
      title: meta.title,
      messages,
      fileTouches: [],
    };
  }

  it("produces identical events and request spans whether read whole or in deltas", () => {
    const full = buildImportCandidateFromClaudeCodeSession(fullDetail(), input);

    // Feed the same messages as three separate deltas.
    let state = initialAgentStoreFollowState();
    state = appendDelta(state, delta(messages.slice(0, 2), 100)).state;
    state = appendDelta(state, delta(messages.slice(2, 4), 200)).state;
    state = appendDelta(state, delta(messages.slice(4, 6), 300)).state;
    const followed = buildImportCandidateFromClaudeCodeSession(buildFollowSubject(state, meta), input);

    expect(followed.events).toHaveLength(full.events.length);
    for (let i = 0; i < full.events.length; i += 1) {
      const f = full.events[i];
      const d = followed.events[i];
      expect(d.id).toBe(f.id);
      expect(d.turnId).toBe(f.turnId);
      expect(d.turnIndex).toBe(f.turnIndex);
      expect(d.actor).toBe(f.actor);
      expect(d.openedByUser).toBe(f.openedByUser);
      expect(d.title).toBe(f.title);
    }

    // The actual consumer: request spans must be byte-identical.
    const fullSpans = buildRequestSpans(full.events);
    const followedSpans = buildRequestSpans(followed.events);
    expect(followedSpans).toEqual(fullSpans);
    // The three real user asks (u1, u3, and the tool-result u2 does NOT open one)
    // become two request spans.
    expect(followedSpans.map((s) => s.title)).toEqual(["RAG 파이프라인 고쳐줘", "이제 테스트 추가해줘"]);
  });
});

describe("runAgentStoreFollowPoll", () => {
  it("reads the delta at the current offset, folds it in, and reacts on new events", async () => {
    let brain = followReducer(initialFollowState(), { type: "start", sessionId: "sess-1" });
    const applyPoll = (incomingEventIds: string[], at: string) => {
      brain = followReducer(brain, { type: "poll", incomingEventIds, at });
      return decideFollowReaction(brain);
    };

    const reads: number[] = [];
    const readDelta = async (offset: number): Promise<ClaudeCodeSessionDelta> => {
      reads.push(offset);
      if (offset === 0) {
        return delta([msg("u1", "human", "ask", "2026-01-01T00:00:00Z")], 100);
      }
      return delta([msg("a1", "assistant", "reply", "2026-01-01T00:00:01Z")], 200);
    };

    const first = await runAgentStoreFollowPoll({
      state: initialAgentStoreFollowState(),
      readDelta,
      applyPoll,
      at: "2026-01-01T00:00:00Z",
    });
    expect(first.newEventIds).toEqual(["u1"]);
    expect(first.reaction.shouldReanalyze).toBe(true);
    expect(first.reaction.newCount).toBe(1);
    expect(first.state.offset).toBe(100);

    // Consume the pending events, then poll again from the advanced offset.
    brain = followReducer(brain, { type: "consumePending" });
    const second = await runAgentStoreFollowPoll({
      state: first.state,
      readDelta,
      applyPoll,
      at: "2026-01-01T00:00:05Z",
    });
    expect(reads).toEqual([0, 100]);
    expect(second.newEventIds).toEqual(["a1"]);
    expect(second.state.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(second.reaction.newCount).toBe(1);
  });

  it("reports no reaction when a poll finds nothing new", async () => {
    let brain = followReducer(initialFollowState(), { type: "start", sessionId: "sess-1" });
    const applyPoll = (incomingEventIds: string[], at: string) => {
      brain = followReducer(brain, { type: "poll", incomingEventIds, at });
      return decideFollowReaction(brain);
    };
    const readDelta = async (): Promise<ClaudeCodeSessionDelta> => delta([], 0, { rawLines: 0, parsed: 0 });

    const outcome = await runAgentStoreFollowPoll({
      state: initialAgentStoreFollowState(),
      readDelta,
      applyPoll,
      at: "2026-01-01T00:00:00Z",
    });
    expect(outcome.newEventIds).toEqual([]);
    expect(outcome.reaction.shouldReanalyze).toBe(false);
    expect(outcome.reaction.newCount).toBe(0);
  });
});
