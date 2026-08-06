import { describe, expect, it } from "vitest";
import type { ClaudeCodeSessionMeta, ClaudeMessage } from "../claude/types";
import { buildLiveFeed, type FollowedSession } from "../../features/live-session/liveFeed";
import { initialAgentStoreFollowState } from "../live-follow";
import { buildIntakeRows } from "./buildIntakeRows";
import { INTAKE_TITLE_MAX } from "./intakeTypes";

const NOW = Date.parse("2026-08-06T12:00:00.000Z");
const OBSERVED = "2026-08-06T12:00:00.000Z";

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function message(partial: Partial<ClaudeMessage> & { id: string }): ClaudeMessage {
  return {
    role: "human",
    content: "",
    createdAt: at(1),
    ...partial,
  } as ClaudeMessage;
}

function session(
  filePath: string,
  messages: ClaudeMessage[],
  opts: { offset?: number; modifiedAt?: string; projectPath?: string } = {},
): FollowedSession {
  const follow = initialAgentStoreFollowState(opts.offset ?? 0);
  const meta: ClaudeCodeSessionMeta = {
    sessionId: filePath.replace(/\W/g, ""),
    projectPath: opts.projectPath ?? "/dev/mori",
    projectName: "mori",
    filePath,
    startedAt: at(60),
    modifiedAt: opts.modifiedAt ?? at(1),
    messageCount: messages.length,
    title: "",
  };
  return { meta, follow: { ...follow, messages, fileTouches: [] } };
}

function rowsFor(sessions: FollowedSession[]) {
  const requests = buildLiveFeed(sessions, { now: NOW });
  return buildIntakeRows(sessions, requests, { now: NOW, observedAt: OBSERVED });
}

describe("buildIntakeRows", () => {
  it("keeps the request shape and drops every message body", () => {
    const rows = rowsFor([
      session("/s/a.jsonl", [
        message({ id: "m1", content: "add the intake buffer" }),
        message({ id: "m2", role: "assistant", content: "a very long reply body".repeat(50) }),
      ]),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("add the intake buffer");
    expect(rows[0].stepCount).toBe(1);
    // The row carries no field that could hold a message body.
    expect(JSON.stringify(rows[0])).not.toContain("a very long reply body");
  });

  it("carries the full project path, not just the label the projection cannot key on", () => {
    const rows = rowsFor([
      session("/s/a.jsonl", [message({ id: "m1", content: "ask" })], {
        projectPath: "C:\\work\\api",
      }),
    ]);

    expect(rows[0].projectPath).toBe("C:\\work\\api");
    // The label is the trailing segment, which two different projects can
    // share; folding on it would merge /work/api with /play/api.
    expect(rows[0].sessionLabel).not.toBe(rows[0].projectPath);
  });

  it("leaves the project path empty rather than guessing one", () => {
    const rows = rowsFor([
      session("/s/a.jsonl", [message({ id: "m1", content: "ask" })], { projectPath: "" }),
    ]);

    expect(rows[0].projectPath).toBe("");
  });

  it("carries a locator so a reduced row stays re-derivable", () => {
    const rows = rowsFor([
      session("/s/a.jsonl", [message({ id: "m1", content: "do the thing" })], { offset: 4096 }),
    ]);

    expect(rows[0].locator).toEqual({ path: "/s/a.jsonl", offset: 4096 });
  });

  it("caps a pasted wall of text and says that it did", () => {
    const rows = rowsFor([
      session("/s/a.jsonl", [message({ id: "m1", content: "x".repeat(2000) })]),
    ]);

    expect(rows[0].titleTruncated).toBe(true);
    expect(rows[0].title.length).toBeLessThanOrEqual(INTAKE_TITLE_MAX + 3);
  });

  it("leaves a short request untruncated", () => {
    const rows = rowsFor([session("/s/a.jsonl", [message({ id: "m1", content: "short ask" })])]);

    expect(rows[0].titleTruncated).toBe(false);
    expect(rows[0].title).toBe("short ask");
  });

  describe("status", () => {
    it("reports the live session status on the newest request only", () => {
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "first ask", createdAt: at(40) }),
          message({ id: "m2", role: "assistant", content: "done", createdAt: at(39) }),
          message({ id: "m3", content: "second ask", createdAt: at(2) }),
          message({ id: "m4", role: "assistant", content: "working", createdAt: at(1) }),
        ]),
      ]);

      const byTitle = new Map(rows.map((row) => [row.title, row.status]));
      // Newest is mid-turn, so it runs; the earlier one ended when it opened.
      expect(byTitle.get("second ask")).toBe("running");
      expect(byTitle.get("first ask")).toBe("completed");
    });

    it("reads a cleanly ended turn as waiting on the user", () => {
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "ask" }),
          message({
            id: "m2",
            role: "assistant",
            content: "here you go",
            stopReason: "end_turn",
            createdAt: at(1),
          }),
        ]),
      ]);

      expect(rows[0].status).toBe("waitingForUser");
    });

    it("reads a cleanly ended but long-quiet session as completed", () => {
      const rows = rowsFor([
        session(
          "/s/a.jsonl",
          [
            message({ id: "m1", content: "ask", createdAt: at(120) }),
            message({
              id: "m2",
              role: "assistant",
              content: "here you go",
              stopReason: "end_turn",
              createdAt: at(119),
            }),
          ],
          { modifiedAt: at(119) },
        ),
      ]);

      expect(rows[0].status).toBe("completed");
    });

    it("treats any non-tool_use stop reason as ending the turn", () => {
      // A real transcript carries `refusal` alongside `end_turn`; enumerating
      // terminal reasons would read this as an open turn and pulse forever.
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "ask" }),
          message({
            id: "m2",
            role: "assistant",
            content: "I cannot help with that",
            stopReason: "refusal",
            createdAt: at(1),
          }),
        ]),
      ]);

      expect(rows[0].status).toBe("waitingForUser");
    });

    it("keeps a tool_use stop reason open, because more is coming", () => {
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "ask" }),
          message({
            id: "m2",
            role: "assistant",
            content: "🔧 Bash: npm test",
            stopReason: "tool_use",
            createdAt: at(1),
          }),
        ]),
      ]);

      expect(rows[0].status).toBe("running");
    });

    it("reads a tool error result as blocked", () => {
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "ask" }),
          message({ id: "m2", content: "↳ 도구 오류: command failed", createdAt: at(1) }),
        ]),
      ]);

      expect(rows[0].status).toBe("blocked");
    });

    it("reads a stalled open turn as blocked, so a crashed run stops running", () => {
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "ask", createdAt: at(30) }),
          message({ id: "m2", role: "assistant", content: "mid step", createdAt: at(29) }),
        ]),
      ]);

      expect(rows[0].status).toBe("blocked");
    });

    it("does not block an earlier request that met an error and recovered", () => {
      // Real data caught this: tool errors are ordinary mid-request, so keying
      // blocked off "any error" marked a third of a real store as stuck.
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "first ask", createdAt: at(40) }),
          message({
            id: "m2",
            content: "↳ 도구 오류: command failed",
            createdAt: at(39),
          }),
          message({
            id: "m3",
            role: "assistant",
            content: "fixed it, tests pass",
            createdAt: at(38),
          }),
          message({ id: "m4", content: "second ask", createdAt: at(2) }),
        ]),
      ]);

      const first = rows.find((row) => row.title === "first ask");
      expect(first?.status).toBe("completed");
      // The trouble is still recorded, just not as a permanent block.
      expect(first?.hasError).toBe(true);
    });

    it("marks an earlier request blocked when it ended on an error", () => {
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "first ask", createdAt: at(40) }),
          message({
            id: "m2",
            role: "assistant",
            content: "<tool_use_error>command failed</tool_use_error>",
            createdAt: at(39),
          }),
          message({ id: "m3", content: "second ask", createdAt: at(2) }),
        ]),
      ]);

      const byTitle = new Map(rows.map((row) => [row.title, row.status]));
      expect(byTitle.get("first ask")).toBe("blocked");
      expect(rows.find((row) => row.title === "first ask")?.hasError).toBe(true);
    });

    it("does not call ordinary prose an error", () => {
      const rows = rowsFor([
        session("/s/a.jsonl", [
          message({ id: "m1", content: "first ask", createdAt: at(40) }),
          message({
            id: "m2",
            role: "assistant",
            content: "I hit an error earlier but recovered and the tests now pass.",
            createdAt: at(39),
          }),
          message({ id: "m3", content: "second ask", createdAt: at(2) }),
        ]),
      ]);

      expect(rows.find((row) => row.title === "first ask")?.hasError).toBe(false);
    });
  });

  it("keeps each session's own newest request live", () => {
    const rows = rowsFor([
      session("/s/a.jsonl", [
        message({ id: "a1", content: "ask a", createdAt: at(3) }),
        message({ id: "a2", role: "assistant", content: "mid", createdAt: at(1) }),
      ]),
      session("/s/b.jsonl", [
        message({ id: "b1", content: "ask b", createdAt: at(4) }),
        message({
          id: "b2",
          role: "assistant",
          content: "finished",
          stopReason: "end_turn",
          createdAt: at(2),
        }),
      ]),
    ]);

    const byTitle = new Map(rows.map((row) => [row.title, row.status]));
    expect(byTitle.get("ask a")).toBe("running");
    expect(byTitle.get("ask b")).toBe("waitingForUser");
  });

  it("returns nothing for a session with no requests rather than inventing one", () => {
    expect(rowsFor([session("/s/a.jsonl", [])])).toEqual([]);
  });
});
