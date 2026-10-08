/**
 * Reopening a long agent session.
 *
 * The defect: a Claude Code transcript over the detailed reader's 8 MiB cap
 * opened as an empty session ("세션에 가져온 소스 없음"). The read failed, the
 * placeholder was already active, and the resolver reported success anyway; a
 * second open was then short-circuited as "already active", so it could never
 * be retried. These tests drive the store and the shared resolver the way the
 * UI does, with the native readers stubbed at the IPC boundary.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkSessionMeta } from "../lib/trace/sources/ai/workSessions";
import type { ClaudeCodeSessionWindow, ClaudeMessage } from "../lib/claude/types";
import { MAX_RETAINED_WINDOWS } from "../lib/session/sessionWindow";

const reader = vi.hoisted(() => ({
  detail: vi.fn(),
  window: vi.fn(),
  meta: new Map<string, unknown>(),
}));

vi.mock("../lib/desktop/llmEndpointRegistry", () => ({ syncLlmAllowedEndpoints: () => {} }));
vi.mock("../lib/trace/sources/ai/workSessions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAgentWorkSession: (meta: unknown) => reader.detail(meta),
  listAllAgentWorkSessions: async () => [],
}));
vi.mock("../lib/claude/claudeTauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getClaudeCodeSessionWindow: (path: string, cursor?: unknown) => reader.window(path, cursor),
}));
vi.mock("../lib/session/autoImportMetaStore", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAutoImportMeta: (id: string) => reader.meta.get(id) ?? null,
}));

import { selectActiveSessionWindow, setSessionRepositoryForTesting, useSessionStore } from "./sessionStore";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import { agentSessionToStoredDraft, autoImportedSessionId } from "../lib/session/autoImportSessions";
import { useSessionResolver, type SessionOpenOutcome } from "../features/session/useSessionResolver";
import { SessionSourceWindow } from "../features/session/SessionSourceWindow";

const TOO_LARGE = "Claude Code session is too large (140509184 bytes > 8388608 byte cap).";

function meta(id: string, title: string): AgentWorkSessionMeta {
  return {
    agentId: "claude",
    agentName: "Claude Code",
    importKind: "claude-code",
    id,
    sessionId: id,
    projectPath: "/home/u/dev/infra",
    projectName: "infra",
    filePath: `/home/u/.claude/projects/-home-u-dev-infra/${id}.jsonl`,
    sourceFilePath: `/home/u/.claude/projects/-home-u-dev-infra/${id}.jsonl`,
    startedAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-08T09:00:00Z",
    messageCount: 40,
    title,
  };
}

function message(id: string, content: string, role = "assistant"): ClaudeMessage {
  return { id, role, content, createdAt: "2026-10-08T08:59:00Z" };
}

function window(start: number, end: number, events: ClaudeMessage[], extra: Partial<ClaudeCodeSessionWindow> = {}): ClaudeCodeSessionWindow {
  return {
    filePath: "/home/u/.claude/projects/-home-u-dev-infra/long.jsonl",
    sourceId: "src-1",
    fileBytes: 140_509_184,
    startOffset: start,
    startAnchor: `anchor-${start}`,
    endAnchor: `end-${end}`,
    endOffset: end,
    reachedStart: start === 0,
    events,
    fileTouches: [],
    stats: { rawLines: events.length, parsed: events.length, skipped: 0, unparseable: 0 },
    omittedRecords: 0,
    omittedBytes: 0,
    ...extra,
  };
}

let repository: BrowserDraftRepository;

/** Register a discovered session the way the auto-import poll does. */
function register(m: AgentWorkSessionMeta): string {
  const id = autoImportedSessionId(m);
  reader.meta.set(id, m);
  repository.putStoredSessionDraft(agentSessionToStoredDraft(m));
  return id;
}

/** The shared resolver, taken out of a render the way a surface holds it. */
function resolver(): (sessionId: string) => Promise<SessionOpenOutcome> {
  let resolve: ((sessionId: string) => Promise<SessionOpenOutcome>) | null = null;
  function Probe() {
    resolve = useSessionResolver();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return resolve!;
}

/** What Session Detail shows for the active session: its window view, or
 *  (when there is no window) the tabbed detail, marked here by "TABS". */
function detailMarkup(): string {
  const state = selectActiveSessionWindow(useSessionStore.getState());
  return state ? renderToStaticMarkup(createElement(SessionSourceWindow, { state })) : "TABS";
}

beforeEach(() => {
  repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
  setSessionRepositoryForTesting(repository);
  useSessionStore.setState({ initialized: true, draft: null, imports: [], sessionWindow: null, source: "browser-draft" });
  reader.detail.mockReset();
  reader.window.mockReset();
  reader.meta.clear();
});

afterEach(() => {
  setSessionRepositoryForTesting(null);
});

describe("reopening a session too long to import", () => {
  it("opens to its recent conversation instead of an empty session", async () => {
    const id = register(meta("long", "Personal systems architecture discovery"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    reader.window.mockResolvedValue(
      window(139_460_608, 140_509_184, [message("u1", "다음 단계는 storage phase 2", "human"), message("a1", "access 경로를 정리했습니다")]),
    );

    expect(await resolver()(id)).toBe("opened");

    const html = detailMarkup();
    expect(html).toContain("최근 대화 일부 표시 중");
    expect(html).toContain("access 경로를 정리했습니다");
    expect(html).toContain("이전 대화 더 보기");
    expect(html).not.toContain("세션에 가져온 소스 없음");
  });

  it("never imports or persists the partial window", async () => {
    const id = register(meta("long", "Long"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    reader.window.mockResolvedValue(window(100, 200, [message("a1", "recent")]));
    const before = JSON.stringify(repository.listStoredSessions());

    await resolver()(id);

    expect(useSessionStore.getState().imports).toEqual([]);
    expect(repository.listSessionImports(id)).toEqual([]);
    expect(JSON.stringify(repository.listStoredSessions())).toBe(before);
    // Analysis and report tabs are not offered over a partial window.
    expect(detailMarkup()).not.toBe("TABS");
  });

  it("prepends earlier history in order without duplicates and stops at the start", async () => {
    const id = register(meta("long", "Long"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    reader.window
      .mockResolvedValueOnce(window(200, 300, [message("m3", "three"), message("m4", "four")]))
      .mockResolvedValueOnce(window(100, 200, [message("m2", "two"), message("m3", "three")]))
      .mockResolvedValueOnce(window(0, 100, [message("m1", "one")]));

    await resolver()(id);
    await useSessionStore.getState().loadEarlierSessionWindow();
    await useSessionStore.getState().loadEarlierSessionWindow();

    const state = useSessionStore.getState().sessionWindow;
    expect(state?.status).toBe("full");
    expect(state && "events" in state ? state.events.map((event) => event.id) : []).toEqual(["m1", "m2", "m3", "m4"]);
    // The cursor carried the previous window's fingerprints back.
    expect(reader.window.mock.calls[1]![1]).toEqual({ beforeOffset: 200, sourceId: "src-1", anchor: "anchor-200" });
    expect(detailMarkup()).toContain("대화의 시작");
  });

  it("reads past a tail that holds nothing to show", async () => {
    const id = register(meta("long", "Long"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    reader.window
      .mockResolvedValueOnce(window(500, 600, []))
      .mockResolvedValueOnce(window(400, 500, [message("m1", "visible")]));

    await resolver()(id);

    const state = useSessionStore.getState().sessionWindow;
    expect(state && "events" in state ? state.events.map((event) => event.id) : []).toEqual(["m1"]);
  });

  it("shows a failed read as an error with a retry, and reopening retries it", async () => {
    const id = register(meta("long", "Long"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    reader.window.mockRejectedValueOnce(new Error("SOURCE_MISSING: Failed to resolve long.jsonl"));
    const resolve = resolver();

    expect(await resolve(id)).toBe("opened");
    let html = detailMarkup();
    expect(html).toContain("원본 대화를 찾을 수 없습니다");
    expect(html).toContain("다시 시도");
    expect(html).not.toContain("세션에 가져온 소스 없음");

    // The same session is active, but still unread: opening it again reads again.
    reader.window.mockResolvedValueOnce(window(0, 100, [message("m1", "back")]));
    expect(await resolve(id)).toBe("opened");
    html = detailMarkup();
    expect(html).toContain("back");
    expect(reader.window).toHaveBeenCalledTimes(2);
  });

  it("an earlier page for a replaced transcript says so instead of splicing", async () => {
    const id = register(meta("long", "Long"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    reader.window
      .mockResolvedValueOnce(window(200, 300, [message("m3", "three")]))
      .mockRejectedValueOnce(new Error("SOURCE_CHANGED: the record at the cursor is not the one it named."));

    await resolver()(id);
    await useSessionStore.getState().loadEarlierSessionWindow();

    const state = useSessionStore.getState().sessionWindow;
    expect(state && "pageError" in state ? state.pageError?.error.kind : null).toBe("changed");
    expect(state && "events" in state ? state.events.map((event) => event.id) : []).toEqual(["m3"]);
    expect(detailMarkup()).toContain("최신 대화로 다시 열기");
  });
});

describe("a session within the import limit", () => {
  it("still imports whole, with no window and the tabs shown", async () => {
    const id = register(meta("short", "Short"));
    const m = meta("short", "Short");
    const messages = [message("u1", "고쳐줘", "human"), message("a1", "done")];
    reader.detail.mockResolvedValue({
      ...m,
      messages,
      claudeDetail: { ...m, filePath: m.sourceFilePath, messages },
    });

    expect(await resolver()(id)).toBe("opened");

    expect(reader.window).not.toHaveBeenCalled();
    expect(useSessionStore.getState().sessionWindow).toBeNull();
    expect(useSessionStore.getState().imports).toHaveLength(1);
    expect(detailMarkup()).toBe("TABS");
  });

  it("a non-size failure is shown as an error, not retried as a window", async () => {
    const id = register(meta("gone", "Gone"));
    reader.detail.mockRejectedValue(new Error("Failed to resolve /x/gone.jsonl: No such file or directory"));

    expect(await resolver()(id)).toBe("opened");

    expect(reader.window).not.toHaveBeenCalled();
    expect(detailMarkup()).toContain("원본 대화를 찾을 수 없습니다");
  });
});

describe("an agent without a window reader", () => {
  it("shows an oversized Codex transcript as too large, never as empty and never retried as a window", async () => {
    const m = { ...meta("codex-long", "Long Codex"), agentId: "codex" as const, importKind: "codex-session" as const };
    const id = register(m);
    reader.detail.mockRejectedValue(new Error("Codex session is too large (9437184 bytes > 8388608 byte cap)."));

    expect(await resolver()(id)).toBe("opened");

    expect(reader.window).not.toHaveBeenCalled();
    const html = detailMarkup();
    expect(html).toContain("아직 열 수 없는 긴 대화입니다");
    expect(html).not.toContain("다시 시도");
    expect(repository.listSessionImports(id)).toEqual([]);
  });
});

describe("navigation races", () => {
  it("a slow read for a session the user left never lands on the next session", async () => {
    const slowId = register(meta("slow", "Slow"));
    const nextId = register(meta("next", "Next"));
    let finishSlow: (value: unknown) => void = () => {};
    reader.detail.mockImplementation((m: AgentWorkSessionMeta) =>
      m.id === "slow"
        ? new Promise((resolve) => {
            finishSlow = resolve;
          })
        : Promise.reject(new Error(TOO_LARGE)),
    );
    reader.window.mockResolvedValue(window(0, 100, [message("n1", "next session")]));
    const resolve = resolver();

    const slow = resolve(slowId);
    expect(await resolve(nextId)).toBe("opened");
    // The first read finishes late, with a whole, importable transcript.
    const slowMeta = meta("slow", "Slow");
    const slowMessages = [message("s1", "slow session")];
    finishSlow({ ...slowMeta, messages: slowMessages, claudeDetail: { ...slowMeta, filePath: slowMeta.sourceFilePath, messages: slowMessages } });

    expect(await slow).toBe("superseded");
    const store = useSessionStore.getState();
    expect(store.draft?.session.id).toBe(nextId);
    expect(store.imports).toEqual([]);
    expect(repository.listSessionImports(nextId)).toEqual([]);
    expect(repository.listSessionImports(slowId)).toEqual([]);
  });

  it("an earlier page that arrives after the user switched sessions is dropped", async () => {
    const firstId = register(meta("first", "First"));
    const secondId = register(meta("second", "Second"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    let finishEarlier: (value: ClaudeCodeSessionWindow) => void = () => {};
    reader.window
      .mockResolvedValueOnce(window(200, 300, [message("a2", "first recent")]))
      .mockImplementationOnce(
        () =>
          new Promise<ClaudeCodeSessionWindow>((resolve) => {
            finishEarlier = resolve;
          }),
      )
      .mockResolvedValueOnce(window(0, 100, [message("b1", "second")]));
    const resolve = resolver();

    await resolve(firstId);
    const earlier = useSessionStore.getState().loadEarlierSessionWindow();
    expect(await resolve(secondId)).toBe("opened");
    finishEarlier(window(100, 200, [message("a1", "first earlier")]));
    await earlier;

    const state = useSessionStore.getState().sessionWindow;
    expect(state?.sessionId).toBe(secondId);
    expect(state && "events" in state ? state.events.map((event) => event.id) : []).toEqual(["b1"]);
  });

  it("a window for a session the user left is dropped", async () => {
    const firstId = register(meta("first", "First"));
    const secondId = register(meta("second", "Second"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    let finishFirst: (value: ClaudeCodeSessionWindow) => void = () => {};
    reader.window
      .mockImplementationOnce(
        () =>
          new Promise<ClaudeCodeSessionWindow>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(window(0, 100, [message("b", "second")]));
    const resolve = resolver();

    const first = resolve(firstId);
    await Promise.resolve();
    await Promise.resolve();
    expect(await resolve(secondId)).toBe("opened");
    finishFirst(window(0, 100, [message("a", "first")]));

    expect(await first).toBe("superseded");
    const state = useSessionStore.getState().sessionWindow;
    expect(state?.sessionId).toBe(secondId);
    expect(state && "events" in state ? state.events.map((event) => event.id) : []).toEqual(["b"]);
  });
});

describe("reading a long session back and forth", () => {
  /** Windows of 100 bytes ending at `end`, one message each, named by start. */
  const page = (end: number) => window(end - 100, end, [message(`m${end - 100}`, `at ${end - 100}`)]);
  const held = () => {
    const state = useSessionStore.getState().sessionWindow;
    return state && "events" in state ? state : null;
  };
  const ids = () => held()?.events.map((event) => event.id) ?? [];

  async function openAt(end: number): Promise<string> {
    const id = register(meta("long", "Long"));
    reader.detail.mockRejectedValue(new Error(TOO_LARGE));
    reader.window.mockResolvedValueOnce(page(end));
    await resolver()(id);
    return id;
  }

  it("B2 · a page in flight leaves the view as it is", async () => {
    await openAt(1000);
    let finish: (value: ClaudeCodeSessionWindow) => void = () => {};
    reader.window.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const before = held()!.events;
    const pending = useSessionStore.getState().loadEarlierSessionWindow();
    expect(held()!.events).toBe(before);
    expect(held()!.paging).toBe("earlier");
    finish(page(900));
    await pending;
    expect(ids()).toEqual(["m800", "m900"]);
  });

  it("B4 · opening the session again does not replace the history being read", async () => {
    const id = await openAt(1000);
    reader.window.mockResolvedValueOnce(page(900));
    await useSessionStore.getState().loadEarlierSessionWindow();
    const view = held();
    const calls = reader.window.mock.calls.length;
    expect(await resolver()(id)).toBe("opened");
    expect(held()).toBe(view);
    expect(reader.window.mock.calls.length).toBe(calls);
  });

  it("an auto-import poll landing mid-page does not disturb the view", async () => {
    await openAt(1000);
    let finish: (value: ClaudeCodeSessionWindow) => void = () => {};
    reader.window.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const pending = useSessionStore.getState().loadEarlierSessionWindow();
    // The poll re-registers this very session's placeholder as it grows.
    useSessionStore.getState().registerDiscoveredSessions([agentSessionToStoredDraft(meta("long", "Long"))]);
    finish(page(900));
    await pending;
    expect(ids()).toEqual(["m800", "m900"]);
  });

  it("a page asked for before the session was reopened is dropped, even at the same offsets", async () => {
    const longId = await openAt(1000);
    const otherId = register(meta("other", "Other"));
    let finish: (value: ClaudeCodeSessionWindow) => void = () => {};
    reader.window.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const pending = useSessionStore.getState().loadEarlierSessionWindow();
    reader.window.mockResolvedValueOnce(page(500));
    await resolver()(otherId);
    reader.window.mockResolvedValueOnce(page(1000));
    await resolver()(longId);
    finish(page(900));
    await pending;
    expect(held()!.sessionId).toBe(longId);
    expect(ids()).toEqual(["m900"]);
  });

  it("B7 · a failed page keeps what is shown and says why", async () => {
    await openAt(1000);
    reader.window.mockRejectedValueOnce(new Error("SOURCE_MISSING: gone"));
    await useSessionStore.getState().loadEarlierSessionWindow();
    expect(ids()).toEqual(["m900"]);
    expect(held()!.pageError).toMatchObject({ direction: "earlier", error: { kind: "missing" } });
    expect(held()!.paging).toBeNull();
  });

  it("B10 · reading far back holds a bounded number of windows", async () => {
    await openAt(2000);
    for (let end = 1900; end >= 1000; end -= 100) {
      reader.window.mockResolvedValueOnce(page(end));
      await useSessionStore.getState().loadEarlierSessionWindow();
    }
    const view = held()!;
    expect(view.spans).toHaveLength(MAX_RETAINED_WINDOWS);
    expect(ids()).toEqual(["m900", "m1000", "m1100", "m1200"]);
    expect(view.released).toHaveLength(11 - MAX_RETAINED_WINDOWS);
    expect(view.loadedBytes).toBe(100 * MAX_RETAINED_WINDOWS);
  });

  it("B11 · every window let go of reads back, in order, by its own cursor", async () => {
    await openAt(1400);
    for (const end of [1300, 1200, 1100, 1000, 900]) {
      reader.window.mockResolvedValueOnce(page(end));
      await useSessionStore.getState().loadEarlierSessionWindow();
    }
    expect(ids()).toEqual(["m800", "m900", "m1000", "m1100"]);
    for (const end of [1300, 1400]) {
      reader.window.mockResolvedValueOnce(page(end));
      await useSessionStore.getState().loadNewerSessionWindow();
      // The cursor names the record that ended the window, not the record after it.
      expect(reader.window.mock.calls.at(-1)![1]).toEqual({ beforeOffset: end, sourceId: "src-1", endAnchor: `end-${end}` });
    }
    expect(ids()).toEqual(["m1000", "m1100", "m1200", "m1300"]);
    expect(held()!.released).toHaveLength(0);
    // Back at the newest window: earlier history is still one page away.
    expect(held()!.startOffset).toBe(1000);
  });

  it("최신 대화로 replaces the view with the transcript's current end", async () => {
    await openAt(1000);
    for (const end of [900, 800, 700, 600]) {
      reader.window.mockResolvedValueOnce(page(end));
      await useSessionStore.getState().loadEarlierSessionWindow();
    }
    reader.window.mockResolvedValueOnce(page(1200));
    await useSessionStore.getState().loadLatestSessionWindow();
    expect(ids()).toEqual(["m1100"]);
    expect(held()!.released).toHaveLength(0);
    expect(reader.window.mock.calls.at(-1)![1]).toBeUndefined();
  });

  it("a reply that does not continue the view is reported as changed, not left spinning", async () => {
    await openAt(1400);
    for (const end of [1300, 1200, 1100, 1000]) {
      reader.window.mockResolvedValueOnce(page(end));
      await useSessionStore.getState().loadEarlierSessionWindow();
    }
    const before = ids();
    reader.window.mockResolvedValueOnce(window(1250, 1400, [message("x", "rewritten")]));
    await useSessionStore.getState().loadNewerSessionWindow();
    expect(ids()).toEqual(before);
    expect(held()!.paging).toBeNull();
    expect(held()!.pageError).toMatchObject({ direction: "newer", error: { kind: "changed" } });
  });
});
