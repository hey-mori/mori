import { describe, expect, it } from "vitest";
import { IntakeBrowserStore } from "../../lib/live-intake";
import { MemoryKeyValueStorage } from "../../lib/storage/memoryStorage";
import type { KeyValueStorage } from "../../lib/storage/storageTypes";
import type { ClaudeCodeSessionMeta, ClaudeFileTouch, ClaudeMessage } from "../../lib/claude/types";
import { initialAgentStoreFollowState } from "../../lib/live-follow";
import { buildLiveFeed, type FollowedSession } from "./liveFeed";
import { persistObservedRows } from "./useIntakeWriter";

/**
 * The hook is a thin React effect; what is locked down here is the function it
 * calls. Above all the failure contract: intake runs in the shell now, on every
 * screen, so a fault in it must never be able to take down the app around it.
 */

const NOW = Date.parse("2026-08-06T12:00:00.000Z");

/**
 * A file the agent edited. `messageId` matters: touches are attributed to the
 * message that made them, so a touch tagged with another session's message id
 * silently attaches to nothing.
 */
function fileTouch(path: string, messageId: string): ClaudeFileTouch {
  return {
    path,
    tool: "Edit",
    changeKind: "edited",
    at: new Date(NOW - 60_000).toISOString(),
    additions: 3,
    deletions: 1,
    messageId,
  } as ClaudeFileTouch;
}

function session(
  filePath: string,
  messages: ClaudeMessage[],
  fileTouches: ClaudeFileTouch[] = [],
): FollowedSession {
  const meta: ClaudeCodeSessionMeta = {
    sessionId: filePath.replace(/\W/g, ""),
    projectPath: "/dev/mori",
    projectName: "mori",
    filePath,
    startedAt: new Date(NOW - 3_600_000).toISOString(),
    modifiedAt: new Date(NOW - 60_000).toISOString(),
    messageCount: messages.length,
    title: "",
  };
  return {
    meta,
    follow: { ...initialAgentStoreFollowState(0), messages, fileTouches },
  };
}

function ask(id: string, content: string): ClaudeMessage {
  return {
    id,
    role: "human",
    content,
    createdAt: new Date(NOW - 60_000).toISOString(),
  } as ClaudeMessage;
}

/** An assistant step with the turn still open, so the session reads as working. */
function midTurn(id: string, content: string): ClaudeMessage {
  return {
    id,
    role: "assistant",
    content,
    createdAt: new Date(NOW - 30_000).toISOString(),
  } as ClaudeMessage;
}

/** A cleanly ended assistant turn, which is what a finished run looks like. */
function endedTurn(id: string, content: string): ClaudeMessage {
  return {
    id,
    role: "assistant",
    content,
    stopReason: "end_turn",
    createdAt: new Date(NOW - 30_000).toISOString(),
  } as ClaudeMessage;
}

function run(store: IntakeBrowserStore, sessions: FollowedSession[], written = new Map()) {
  const requests = buildLiveFeed(sessions, { now: NOW });
  return { result: persistObservedRows(store, sessions, requests, written, () => NOW), written };
}

describe("persistObservedRows · retention", () => {
  it("keeps rows the follower has since forgotten", () => {
    // The follower trims its own message history, so an old request drops out of
    // the feed. Replacing a session's rows wholesale used to discard what Mori
    // had already observed; upserting keeps it.
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();

    run(store, [session("/s/a.jsonl", [ask("a1", "old ask"), midTurn("a2", "x")])], written);
    expect(store.listSessionRows("/s/a.jsonl")).toHaveLength(1);

    // A later poll whose window no longer reaches the first request.
    run(store, [session("/s/a.jsonl", [ask("a3", "new ask"), midTurn("a4", "y")])], written);

    const titles = store.listSessionRows("/s/a.jsonl").map((row) => row.title);
    expect(titles).toContain("old ask");
    expect(titles).toContain("new ask");
  });

  it("overwrites a row in place when the same request is re-observed", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();

    run(store, [session("/s/a.jsonl", [ask("a1", "ask"), midTurn("a2", "one step")])], written);
    run(
      store,
      [session("/s/a.jsonl", [ask("a1", "ask"), midTurn("a2", "one step"), midTurn("a3", "two")])],
      written,
    );

    const rows = store.listSessionRows("/s/a.jsonl");
    expect(rows).toHaveLength(1);
    expect(rows[0].stepCount).toBe(2);
  });
});

describe("persistObservedRows · bounds", () => {
  it("reports nothing dropped for an ordinary session", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const { result } = run(store, [session("/s/a.jsonl", [ask("a1", "ask a")])]);

    expect(result.evicted).toBe(0);
  });

  it("drops an observation too old to be about now, and says so", () => {
    // Merging keeps rows the follower forgot; without a bound that set only ever
    // grows, in a localStorage budget issue #12 already reports as exhausted.
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();
    const ancient = new Date(NOW - 90 * 24 * 60 * 60 * 1000).toISOString();
    store.saveSessionRows("/s/a.jsonl", [
      {
        schemaVersion: 2,
        id: "/s/a.jsonl::old",
        sessionKey: "/s/a.jsonl",
        projectPath: "/dev/mori",
        sessionLabel: "mori",
        title: "석 달 전 요청",
        titleTruncated: false,
        startedAt: ancient,
        endedAt: ancient,
        stepCount: 1,
        tools: [],
        files: [],
        hasError: false,
        status: "completed",
        locator: { path: "/s/a.jsonl", offset: 0 },
        observedAt: ancient,
      },
    ]);

    const { result } = run(store, [session("/s/a.jsonl", [ask("a1", "ask a")])], written);

    expect(result.evicted).toBe(1);
    expect(store.listSessionRows("/s/a.jsonl").map((r) => r.title)).not.toContain("석 달 전 요청");
  });

  it("still keeps a recent row the follower has forgotten", () => {
    // The bound must not undo what merging is for.
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();

    run(store, [session("/s/a.jsonl", [ask("a1", "old ask"), midTurn("a2", "x")])], written);
    run(store, [session("/s/a.jsonl", [ask("a3", "new ask"), midTurn("a4", "y")])], written);

    const titles = store.listSessionRows("/s/a.jsonl").map((r) => r.title);
    expect(titles).toContain("old ask");
    expect(titles).toContain("new ask");
  });
});

describe("persistObservedRows · conflicts", () => {
  it("raises a conflict when two sessions change the same file", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();

    // The touch rides on the agent's step, not on the human request that opened
    // it: the opener becomes the request itself and is never a step.
    run(
      store,
      [
        session(
          "/s/a.jsonl",
          [ask("a1", "ask a"), midTurn("a2", "editing")],
          [fileTouch("src/app.ts", "a2")],
        ),
      ],
      written,
    );
    const { result } = run(
      store,
      [
        session(
          "/s/b.jsonl",
          [ask("b1", "ask b"), midTurn("b2", "editing too")],
          [fileTouch("src/app.ts", "b2")],
        ),
      ],
      written,
    );

    const conflict = result.notifications.find((n) => n.id.startsWith("intake:conflict:"));
    expect(conflict?.title).toContain("같은 파일");
    // The point of the notice is that the user opens both traces, so both are
    // linked rather than summarised.
    expect(conflict?.evidenceRefs).toHaveLength(2);
  });

  it("raises no conflict when only one session is involved", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();
    const touches = [fileTouch("src/app.ts", "a2"), fileTouch("src/app.ts", "a4")];

    run(
      store,
      [session("/s/a.jsonl", [ask("a1", "ask a"), midTurn("a2", "editing")], touches)],
      written,
    );
    const { result } = run(
      store,
      [
        session(
          "/s/a.jsonl",
          [ask("a1", "ask a"), midTurn("a2", "editing"), ask("a3", "again"), midTurn("a4", "more")],
          touches,
        ),
      ],
      written,
    );

    expect(result.notifications.filter((n) => n.id.startsWith("intake:conflict:"))).toEqual([]);
  });
});

describe("persistObservedRows · signals", () => {
  it("raises nothing the first time it sees a session", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const { result } = run(store, [session("/s/a.jsonl", [ask("a1", "ask a")])]);

    expect(result.notifications).toEqual([]);
  });

  it("raises a completion from the change between two observations", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();
    const working = [
      session("/s/a.jsonl", [ask("a1", "ask a"), midTurn("a2", "still going")]),
    ];
    run(store, working, written);

    // The agent finished. The transition is read from what was stored, not from
    // a component's memory, which is the whole point of moving it here.
    const done = [session("/s/a.jsonl", [ask("a1", "ask a"), endedTurn("a2", "done")])];
    const { result } = run(store, done, written);

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].title).toContain("마쳤습니다");
    expect(result.notifications[0].source?.sessionId).toBe("/s/a.jsonl");
  });

  it("does not raise the same completion twice", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const written = new Map<string, string>();
    run(store, [session("/s/a.jsonl", [ask("a1", "ask a"), midTurn("a2", "going")])], written);
    const done = [session("/s/a.jsonl", [ask("a1", "ask a"), endedTurn("a2", "done")])];
    run(store, done, written);

    expect(run(store, done, written).result.notifications).toEqual([]);
  });
});

describe("persistObservedRows", () => {
  it("writes each observed session once", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const { result } = run(store, [
      session("/s/a.jsonl", [ask("a1", "ask a")]),
      session("/s/b.jsonl", [ask("b1", "ask b")]),
    ]);

    expect(result.failure).toBeNull();
    expect(result.writtenSessions).toBe(2);
    expect(store.listAllRows()).toHaveLength(2);
  });

  it("skips a session whose rows did not change", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const sessions = [session("/s/a.jsonl", [ask("a1", "ask a")])];
    const { written } = run(store, sessions);

    // An idle poll costs no storage traffic, even though observedAt moved.
    expect(run(store, sessions, written).result.writtenSessions).toBe(0);
  });

  it("rewrites a session once its work advances", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    const { written } = run(store, [session("/s/a.jsonl", [ask("a1", "ask a")])]);

    const advanced = [session("/s/a.jsonl", [ask("a1", "ask a"), ask("a2", "ask again")])];
    expect(run(store, advanced, written).result.writtenSessions).toBe(1);
    expect(store.listAllRows()).toHaveLength(2);
  });

  it("returns a storage failure instead of throwing it at the view", () => {
    const exploding: KeyValueStorage = {
      length: 0,
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error("disk on fire");
      },
    };

    const { result } = run(new IntakeBrowserStore(exploding), [
      session("/s/a.jsonl", [ask("a1", "ask a")]),
    ]);

    expect(result.failure).toBeInstanceOf(Error);
    expect(result.writtenSessions).toBe(0);
  });

  it("returns a derivation failure too, not only a storage one", () => {
    const store = new IntakeBrowserStore(new MemoryKeyValueStorage());
    // A malformed session is exactly as fatal to the view as a failed save, so
    // the guard has to cover building rows and not just writing them.
    const broken = { meta: undefined, follow: undefined } as unknown as FollowedSession;

    const result = persistObservedRows(store, [broken], [], new Map(), () => NOW);

    expect(result.failure).toBeTruthy();
  });

  it("does not mark a session written when its save failed", () => {
    let fail = true;
    const flaky: KeyValueStorage = {
      length: 0,
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        if (fail) throw new Error("transient");
      },
    };
    const store = new IntakeBrowserStore(flaky);
    const sessions = [session("/s/a.jsonl", [ask("a1", "ask a")])];
    const written = new Map<string, string>();

    run(store, sessions, written);
    expect(written.size).toBe(0);

    // The retry must not be skipped by a fingerprint the failed pass recorded.
    fail = false;
    expect(run(store, sessions, written).result.writtenSessions).toBe(1);
  });
});
