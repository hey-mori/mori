import { describe, expect, it } from "vitest";

import type { ClaudeCodeSessionMeta, ClaudeMessage } from "../../lib/claude/types";
import type { AgentStoreFollowState } from "../../lib/live-follow";
import { buildLiveFeed, sessionShortLabel } from "./liveFeed";

function state(messages: ClaudeMessage[]): AgentStoreFollowState {
  return {
    offset: 0,
    messages,
    fileTouches: [],
    stats: { rawLines: 0, parsed: 0, skipped: 0, unparseable: 0 },
  };
}

function meta(id: string, projectName: string): ClaudeCodeSessionMeta {
  return {
    sessionId: id,
    projectPath: projectName,
    projectName,
    filePath: `/root/${id}.jsonl`,
    startedAt: "2026-01-01T00:00:00Z",
    modifiedAt: "2026-01-01T00:00:00Z",
    messageCount: 0,
    title: id,
  };
}

function msg(id: string, role: ClaudeMessage["role"], content: string, at: string): ClaudeMessage {
  return { id, role, content, createdAt: at };
}

describe("buildLiveFeed", () => {
  it("merges requests across sessions newest-first and tags each with its session", () => {
    const sessionA = {
      meta: meta("sessA", "C:/dev/mori"),
      follow: state([
        msg("a-u1", "human", "A의 첫 요청", "2026-01-01T00:00:00Z"),
        msg("a-m1", "assistant", "A 응답", "2026-01-01T00:00:01Z"),
      ]),
    };
    const sessionB = {
      meta: meta("sessB", "C:/dev/ng-gw"),
      follow: state([
        msg("b-u1", "human", "B의 요청 (더 최신)", "2026-01-01T00:05:00Z"),
        msg("b-m1", "assistant", "B 응답", "2026-01-01T00:05:01Z"),
      ]),
    };

    const feed = buildLiveFeed([sessionA, sessionB]);
    expect(feed).toHaveLength(2);
    // Newest request on top.
    expect(feed[0].requestTitle).toBe("B의 요청 (더 최신)");
    expect(feed[0].sessionLabel).toBe("ng-gw");
    expect(feed[1].requestTitle).toBe("A의 첫 요청");
    expect(feed[1].sessionLabel).toBe("mori");
    // The reply is an item; the ask (header) is not duplicated.
    expect(feed[0].items.map((i) => i.text)).toEqual(["B 응답"]);
  });

  it("collapses consecutive identical items into a repeat count", () => {
    const followed = {
      meta: meta("sess", "repo"),
      follow: state([
        msg("u1", "human", "리밋 재현", "2026-01-01T00:00:00Z"),
        msg("m1", "assistant", "You've hit your session limit", "2026-01-01T00:00:01Z"),
        // Three more identical replies (the rate-limit spam).
        msg("u2", "human", "다시", "2026-01-01T00:00:02Z"),
        msg("m2", "assistant", "You've hit your session limit", "2026-01-01T00:00:03Z"),
        msg("u3", "human", "또", "2026-01-01T00:00:04Z"),
        msg("m3", "assistant", "You've hit your session limit", "2026-01-01T00:00:05Z"),
      ]),
    };

    // All three asks open their own request, but each request's single reply is
    // identical, within a request there's one item. Force them into one request
    // by making the follow-ups tool results instead: simpler to assert the
    // collapse directly on one request with repeated replies.
    const oneRequest = {
      meta: meta("sess2", "repo"),
      follow: state([
        msg("u1", "human", "리밋", "2026-01-01T00:00:00Z"),
        msg("m1", "assistant", "You've hit your session limit", "2026-01-01T00:00:01Z"),
        msg("m2", "assistant", "You've hit your session limit", "2026-01-01T00:00:02Z"),
        msg("m3", "assistant", "You've hit your session limit", "2026-01-01T00:00:03Z"),
      ]),
    };

    const feed = buildLiveFeed([oneRequest]);
    expect(feed).toHaveLength(1);
    const items = feed[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("You've hit your session limit");
    expect(items[0].repeatCount).toBe(3);
    // The unrelated multi-request fixture still produces a feed without throwing.
    expect(buildLiveFeed([followed]).length).toBeGreaterThan(0);
  });

  it("caps the feed to the most recent requests", () => {
    const messages: ClaudeMessage[] = [];
    for (let i = 0; i < 10; i += 1) {
      const t = `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`;
      messages.push(msg(`u${i}`, "human", `요청 ${i}`, t));
      messages.push(msg(`m${i}`, "assistant", `응답 ${i}`, `2026-01-01T00:${String(i).padStart(2, "0")}:30Z`));
    }
    const feed = buildLiveFeed([{ meta: meta("s", "repo"), follow: state(messages) }], { limit: 3 });
    expect(feed).toHaveLength(3);
    // Newest three requests.
    expect(feed.map((r) => r.requestTitle)).toEqual(["요청 9", "요청 8", "요청 7"]);
  });
});

describe("sessionShortLabel", () => {
  it("takes the last path segment", () => {
    expect(sessionShortLabel(meta("s", "C:/dev/mori"))).toBe("mori");
    expect(sessionShortLabel(meta("s", "C:\\dev\\ng-gw"))).toBe("ng-gw");
  });
});
