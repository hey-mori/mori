import { describe, expect, it } from "vitest";
import { IntakeBrowserStore } from "../../lib/live-intake";
import { MemoryKeyValueStorage } from "../../lib/storage/memoryStorage";
import type { KeyValueStorage } from "../../lib/storage/storageTypes";
import type { ClaudeCodeSessionMeta, ClaudeMessage } from "../../lib/claude/types";
import { initialAgentStoreFollowState } from "../../lib/live-follow";
import { buildLiveFeed, type FollowedSession } from "./liveFeed";
import { persistObservedRows } from "./useIntakeWriter";

/**
 * The hook itself is a two-line React effect; what is locked down here is the
 * contract it calls, and above all the failure contract: intake must never be
 * able to take down the live view it is observing from.
 */

const NOW = Date.parse("2026-08-06T12:00:00.000Z");

function session(filePath: string, messages: ClaudeMessage[]): FollowedSession {
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
    follow: { ...initialAgentStoreFollowState(0), messages, fileTouches: [] },
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

function run(store: IntakeBrowserStore, sessions: FollowedSession[], written = new Map()) {
  const requests = buildLiveFeed(sessions, { now: NOW });
  return { result: persistObservedRows(store, sessions, requests, written, () => NOW), written };
}

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
