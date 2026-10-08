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
    expect(state && "earlierError" in state ? state.earlierError?.kind : null).toBe("changed");
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
