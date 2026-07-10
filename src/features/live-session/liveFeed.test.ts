import { describe, expect, it } from "vitest";

import type { ClaudeCodeSessionMeta, ClaudeMessage } from "../../lib/claude/types";
import type { AgentStoreFollowState } from "../../lib/live-follow";
import { buildLiveFeed, sessionShortLabel } from "./liveFeed";

const NOW = Date.parse("2026-01-01T00:10:00Z");

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
  it("keeps full message text as per-message items, newest request on top", () => {
    const longReply = "아주 긴 응답입니다. ".repeat(40).trim();
    const sessionA = {
      meta: meta("sessA", "C:/dev/mori"),
      follow: state([
        msg("a-u1", "human", "A의 첫 요청", "2026-01-01T00:00:00Z"),
        msg("a-m1", "assistant", longReply, "2026-01-01T00:00:01Z"),
      ]),
    };
    const sessionB = {
      meta: meta("sessB", "C:/dev/ng-gw"),
      follow: state([
        msg("b-u1", "human", "B의 요청 (더 최신)", "2026-01-01T00:05:00Z"),
        msg("b-m1", "assistant", "B 응답", "2026-01-01T00:05:01Z"),
      ]),
    };

    const feed = buildLiveFeed([sessionA, sessionB], { now: NOW });
    expect(feed).toHaveLength(2);
    expect(feed[0].requestTitle).toBe("B의 요청 (더 최신)");
    expect(feed[0].sessionLabel).toBe("ng-gw");
    expect(feed[1].sessionLabel).toBe("mori");
    // The long reply is kept in full, not truncated with an ellipsis.
    expect(feed[1].items[0].text).toBe(longReply);
    expect(feed[1].items[0].text).not.toContain("…");
  });

  it("derives a live status from how recently the request was touched", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    const working = {
      meta: meta("s1", "repo"),
      follow: state([
        msg("u1", "human", "지금 작업 중", "2026-01-01T00:09:30Z"),
        msg("m1", "assistant", "진행 중", "2026-01-01T00:09:40Z"),
      ]),
    };
    const recent = {
      meta: meta("s2", "repo"),
      follow: state([
        msg("u2", "human", "방금 끝남", "2026-01-01T00:06:00Z"),
        msg("m2", "assistant", "끝", "2026-01-01T00:06:10Z"),
      ]),
    };
    const done = {
      meta: meta("s3", "repo"),
      follow: state([
        msg("u3", "human", "오래 전", "2026-01-01T00:00:00Z"),
        msg("m3", "assistant", "완료", "2026-01-01T00:00:10Z"),
      ]),
    };
    const feed = buildLiveFeed([working, recent, done], { now });
    const byTitle = new Map(feed.map((r) => [r.requestTitle, r.status]));
    expect(byTitle.get("지금 작업 중")).toBe("working");
    expect(byTitle.get("방금 끝남")).toBe("recent");
    expect(byTitle.get("오래 전")).toBe("done");
  });

  it("collapses consecutive identical steps and does not let injected messages open a request", () => {
    const followed = {
      meta: meta("s", "repo"),
      follow: state([
        msg("u1", "human", "리밋", "2026-01-01T00:00:00Z"),
        msg("m1", "assistant", "You've hit your session limit", "2026-01-01T00:00:01Z"),
        msg("m2", "assistant", "You've hit your session limit", "2026-01-01T00:00:02Z"),
        msg("m3", "assistant", "You've hit your session limit", "2026-01-01T00:00:03Z"),
        // A harness task-notification must not open its own request.
        msg("u2", "human", "<task-notification>\n<task-id>x</task-id>", "2026-01-01T00:00:04Z"),
        msg("m4", "assistant", "이어서 진행", "2026-01-01T00:00:05Z"),
      ]),
    };
    const feed = buildLiveFeed([followed], { now: NOW });
    expect(feed).toHaveLength(1);
    const items = feed[0].items;
    // The three identical replies collapse to one ×3, then the post-notification reply.
    expect(items[0].text).toBe("You've hit your session limit");
    expect(items[0].repeatCount).toBe(3);
    expect(items[items.length - 1].text).toBe("이어서 진행");
  });

  it("caps the feed to the most recent requests", () => {
    const messages: ClaudeMessage[] = [];
    for (let i = 0; i < 10; i += 1) {
      const t = `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`;
      messages.push(msg(`u${i}`, "human", `요청 ${i}`, t));
      messages.push(msg(`m${i}`, "assistant", `응답 ${i}`, `2026-01-01T00:${String(i).padStart(2, "0")}:30Z`));
    }
    const feed = buildLiveFeed([{ meta: meta("s", "repo"), follow: state(messages) }], {
      now: NOW,
      limit: 3,
    });
    expect(feed.map((r) => r.requestTitle)).toEqual(["요청 9", "요청 8", "요청 7"]);
  });
});

describe("sessionShortLabel", () => {
  it("takes the last path segment", () => {
    expect(sessionShortLabel(meta("s", "C:/dev/mori"))).toBe("mori");
    expect(sessionShortLabel(meta("s", "C:\\dev\\ng-gw"))).toBe("ng-gw");
  });
});
