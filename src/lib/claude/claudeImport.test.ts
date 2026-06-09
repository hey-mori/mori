import { describe, expect, it } from "vitest";

import { buildImportCandidateFromClaudeCodeSession } from "./claudeImport";
import type { ClaudeCodeSessionDetail } from "./types";

function codeSession(
  messages: ClaudeCodeSessionDetail["messages"],
  fileTouches: ClaudeCodeSessionDetail["fileTouches"],
): ClaudeCodeSessionDetail {
  return {
    sessionId: "sess-1",
    projectPath: "/repo",
    projectName: "repo",
    filePath: "/repo/.claude/sess-1.jsonl",
    startedAt: "2026-01-01T00:00:00Z",
    messageCount: messages.length,
    title: "Edit the auth file",
    messages,
    fileTouches,
  };
}

describe("buildImportCandidateFromClaudeCodeSession - file touch attribution", () => {
  it("attributes each touch to the turn whose assistant message produced it", () => {
    const detail = codeSession(
      [
        { id: "u1", role: "human", content: "edit a.ts", createdAt: "2026-01-01T00:00:00Z" },
        {
          id: "m1",
          role: "assistant",
          content: "TOOL Edit: a.ts",
          createdAt: "2026-01-01T00:00:01Z",
          subkind: "tool_use",
        },
        { id: "u2", role: "human", content: "thanks", createdAt: "2026-01-01T00:00:02Z" },
        { id: "m2", role: "assistant", content: "all done", createdAt: "2026-01-01T00:00:03Z" },
      ],
      [
        {
          path: "/repo/src/a.ts",
          tool: "Edit",
          changeKind: "edited",
          at: "2026-01-01T00:00:01Z",
          additions: 3,
          deletions: 1,
          messageId: "m1",
          diffPreview: "+const x = 1;\n-const x = 0;",
        },
      ],
    );

    const candidate = buildImportCandidateFromClaudeCodeSession(detail, {
      projectId: "proj",
      sessionId: "sess",
    });

    expect(candidate.source.fileTouches).toHaveLength(1);

    const withTouches = candidate.events.filter(
      (event) => event.fileTouches && event.fileTouches.length > 0,
    );
    expect(withTouches).toHaveLength(1);
    expect(withTouches[0].fileTouches?.[0]?.path).toBe("/repo/src/a.ts");
    expect(withTouches[0].fileTouches?.[0]?.additions).toBe(3);
    expect(candidate.events.some((event) => !event.fileTouches)).toBe(true);
  });

  it("omits fileTouches entirely when the conversation touched no files", () => {
    const detail = codeSession(
      [
        { id: "u1", role: "human", content: "explain the design", createdAt: "2026-01-01T00:00:00Z" },
        { id: "m1", role: "assistant", content: "Here is the design...", createdAt: "2026-01-01T00:00:01Z" },
      ],
      [],
    );

    const candidate = buildImportCandidateFromClaudeCodeSession(detail, {
      projectId: "proj",
      sessionId: "sess",
    });

    expect(candidate.source.fileTouches).toBeUndefined();
    expect(candidate.events.every((event) => event.fileTouches === undefined)).toBe(true);
  });
});

describe("buildImportCandidateFromClaudeCodeSession - turn titles", () => {
  it("titles a boilerplate-prefixed first turn from the assistant reply", () => {
    const detail = codeSession(
      [
        {
          id: "u1",
          role: "human",
          content:
            "This session is being continued from a previous conversation that ran out of context. Summary follows...",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "m1",
          role: "assistant",
          content: "좋은 지적입니다. 이어서 마이그레이션을 확인하겠습니다.",
          createdAt: "2026-01-01T00:00:01Z",
        },
      ],
      [],
    );

    const candidate = buildImportCandidateFromClaudeCodeSession(detail, {
      projectId: "proj",
      sessionId: "sess",
    });

    // The compaction preamble must never become a turn's headline.
    expect(candidate.events[0].title).not.toContain("This session is being continued");
    expect(candidate.events[0].title).toContain("좋은 지적입니다");
  });

  it("falls back to a short label when a boilerplate turn has no assistant reply", () => {
    const detail = codeSession(
      [
        {
          id: "u1",
          role: "human",
          content:
            "This session is being continued from a previous conversation that ran out of context.",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      [],
    );

    const candidate = buildImportCandidateFromClaudeCodeSession(detail, {
      projectId: "proj",
      sessionId: "sess",
    });

    expect(candidate.events[0].title).toBe("세션 이어가기");
  });
});
