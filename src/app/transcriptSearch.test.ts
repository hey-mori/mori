/**
 * Searching inside an open long transcript, and opening a result.
 *
 * The native reader and search are stubbed at the IPC boundary by a small fake
 * transcript (records with byte ranges and anchors), so these tests drive the
 * store and the view the way the UI does: a search finds a passage far back,
 * a result opens the window that holds it directly, and paging, latest and
 * stale replies behave around that jump.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkSessionMeta } from "../lib/trace/sources/ai/workSessions";
import type { ClaudeCodeSearchBatch, ClaudeCodeSearchHit, ClaudeCodeSessionWindow } from "../lib/claude/types";
import { isAtLatest, isLoadedWindow, MAX_RETAINED_WINDOWS, type LoadedSessionWindow } from "../lib/session/sessionWindow";

type FakeRecord = { id: string; content: string; start: number; end: number };
type Cursor = { beforeOffset?: number; afterOffset?: number; sourceId?: string; anchor?: string; endAnchor?: string };

const RECORD = 100;
const WINDOW_RECORDS = 3;
const SCAN_RECORDS = 4;

const fake = vi.hoisted(() => ({
  transcripts: new Map<string, { sourceId: string; records: FakeRecord[] }>(),
  meta: new Map<string, unknown>(),
  /** When set, the next reader or search call waits on it. */
  gate: null as null | ((call: { kind: "window" | "search"; path: string; cursor?: unknown }) => Promise<void> | void),
  calls: [] as { kind: "window" | "search"; path: string; cursor?: unknown }[],
}));

vi.mock("../lib/desktop/llmEndpointRegistry", () => ({ syncLlmAllowedEndpoints: () => {} }));
vi.mock("../lib/trace/sources/ai/workSessions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAgentWorkSession: async () => {
    throw new Error("Claude Code session is too large (140509184 bytes > 8388608 byte cap).");
  },
  listAllAgentWorkSessions: async () => [],
}));
vi.mock("../lib/claude/claudeTauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getClaudeCodeSessionWindow: async (path: string, cursor?: Cursor) => {
    fake.calls.push({ kind: "window", path, cursor });
    await fake.gate?.({ kind: "window", path, cursor });
    return readWindow(path, cursor);
  },
  searchClaudeCodeSession: async (path: string, query: string, cursor?: Cursor, maxHits?: number) => {
    fake.calls.push({ kind: "search", path, cursor });
    await fake.gate?.({ kind: "search", path, cursor });
    return searchTranscript(path, query, cursor, maxHits ?? 50);
  },
}));
vi.mock("../lib/session/autoImportMetaStore", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAutoImportMeta: (id: string) => fake.meta.get(id) ?? null,
}));

import { selectActiveSessionWindow, setSessionRepositoryForTesting, useSessionStore } from "./sessionStore";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import { agentSessionToStoredDraft, autoImportedSessionId } from "../lib/session/autoImportSessions";
import { useSessionResolver, type SessionOpenOutcome } from "../features/session/useSessionResolver";
import { SessionSourceWindow } from "../features/session/SessionSourceWindow";

// ─── the fake transcript ────────────────────────────────────────────────────

function transcript(path: string) {
  const found = fake.transcripts.get(path);
  if (!found) throw new Error("SOURCE_MISSING: no such file");
  return found;
}

const endAnchorOf = (records: FakeRecord[], offset: number) => {
  const before = records.find((record) => record.end === offset);
  return before ? `e-${before.id}:${before.content.length}` : "";
};

function windowOf(path: string, picked: FakeRecord[], all: FakeRecord[], sourceId: string, fallback: number): ClaudeCodeSessionWindow {
  const start = picked[0]?.start ?? fallback;
  const end = picked[picked.length - 1]?.end ?? fallback;
  const fileEnd = all[all.length - 1]!.end;
  return {
    filePath: path,
    sourceId,
    fileBytes: fileEnd,
    startOffset: start,
    startAnchor: `s-${start}`,
    endAnchor: endAnchorOf(all, end),
    endOffset: end,
    reachedStart: start === 0,
    reachedEnd: end === fileEnd,
    events: picked.map((record) => ({ id: record.id, role: "assistant", content: record.content, createdAt: "2026-10-08T00:00:00Z" })),
    fileTouches: [],
    stats: { rawLines: picked.length, parsed: picked.length, skipped: 0, unparseable: 0 },
    omittedRecords: 0,
    omittedBytes: 0,
  };
}

function readWindow(path: string, cursor?: Cursor): ClaudeCodeSessionWindow {
  const { sourceId, records } = transcript(path);
  if (cursor?.sourceId && cursor.sourceId !== sourceId) throw new Error("SOURCE_CHANGED: replaced");
  if (cursor?.afterOffset !== undefined) {
    if (cursor.endAnchor !== endAnchorOf(records, cursor.afterOffset)) throw new Error("SOURCE_CHANGED: before cursor");
    const picked = records.filter((record) => record.start >= cursor.afterOffset!).slice(0, WINDOW_RECORDS);
    return windowOf(path, picked, records, sourceId, cursor.afterOffset);
  }
  const before = cursor?.beforeOffset ?? records[records.length - 1]!.end;
  if (cursor?.endAnchor !== undefined && cursor.endAnchor !== endAnchorOf(records, before)) {
    throw new Error("SOURCE_CHANGED: the record before the cursor is not the one it named.");
  }
  const picked = records.filter((record) => record.end <= before).slice(-WINDOW_RECORDS);
  return windowOf(path, picked, records, sourceId, before);
}

function searchTranscript(path: string, query: string, cursor: Cursor | undefined, maxHits: number): ClaudeCodeSearchBatch {
  const { sourceId, records } = transcript(path);
  if (cursor?.sourceId && cursor.sourceId !== sourceId) throw new Error("SOURCE_CHANGED: replaced");
  const end = cursor?.beforeOffset ?? records[records.length - 1]!.end;
  const scanned = records.filter((record) => record.end <= end).slice(-SCAN_RECORDS).reverse();
  const hits: ClaudeCodeSearchHit[] = [];
  let scanStart = scanned[scanned.length - 1]?.start ?? 0;
  let hitLimit = false;
  for (const record of scanned) {
    const at = record.content.toLowerCase().indexOf(query.toLowerCase());
    if (at === -1) continue;
    hits.push({
      messageId: record.id,
      role: "assistant",
      subkind: "",
      createdAt: "2026-10-08T00:00:00Z",
      recordStart: record.start,
      recordEnd: record.end,
      recordAnchor: endAnchorOf(records, record.end),
      snippetBefore: record.content.slice(0, at),
      snippetMatch: record.content.slice(at, at + query.length),
      snippetAfter: record.content.slice(at + query.length),
      matchesInMessage: 1,
    });
    if (hits.length >= maxHits) {
      hitLimit = true;
      scanStart = record.start;
      break;
    }
  }
  return {
    sourceId,
    fileBytes: records[records.length - 1]!.end,
    scanEnd: end,
    scanStart,
    scanStartAnchor: `s-${scanStart}`,
    reachedStart: scanStart === 0,
    hits,
    hitLimit,
    searchedRecords: scanned.length,
    unsearchableRecords: 0,
    unsearchableBytes: 0,
  };
}

function makeTranscript(path: string, contents: string[], sourceId = `src-${path}`) {
  const records = contents.map((content, index) => ({ id: `${path}-m${index}`, content, start: index * RECORD, end: (index + 1) * RECORD }));
  fake.transcripts.set(path, { sourceId, records });
}

// ─── harness ────────────────────────────────────────────────────────────────

let repository: BrowserDraftRepository;

function register(name: string): string {
  const m: AgentWorkSessionMeta = {
    agentId: "claude",
    agentName: "Claude Code",
    importKind: "claude-code",
    id: name,
    sessionId: name,
    projectPath: "/home/u/dev/infra",
    projectName: "infra",
    filePath: name,
    sourceFilePath: name,
    startedAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-08T09:00:00Z",
    messageCount: 40,
    title: name,
  };
  const id = autoImportedSessionId(m);
  fake.meta.set(id, m);
  repository.putStoredSessionDraft(agentSessionToStoredDraft(m));
  return id;
}

function resolver(): (sessionId: string) => Promise<SessionOpenOutcome> {
  let resolve: ((sessionId: string) => Promise<SessionOpenOutcome>) | null = null;
  function Probe() {
    resolve = useSessionResolver();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return resolve!;
}

function view(): LoadedSessionWindow {
  const state = useSessionStore.getState().sessionWindow;
  if (!isLoadedWindow(state)) throw new Error(`no loaded window: ${JSON.stringify(state)}`);
  return state;
}

const ids = () => view().events.map((event) => event.id);

function markup(): string {
  const state = selectActiveSessionWindow(useSessionStore.getState());
  return state ? renderToStaticMarkup(createElement(SessionSourceWindow, { state })) : "TABS";
}

/** A call the test releases by hand. */
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const contents = (count: number, special: Record<number, string> = {}) =>
  Array.from({ length: count }, (_, index) => special[index] ?? `routine work ${index}`);

beforeEach(() => {
  repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
  setSessionRepositoryForTesting(repository);
  useSessionStore.setState({ initialized: true, draft: null, imports: [], sessionWindow: null, sessionSearch: null, source: "browser-draft" });
  fake.transcripts.clear();
  fake.meta.clear();
  fake.gate = null;
  fake.calls = [];
});

afterEach(() => {
  setSessionRepositoryForTesting(null);
});

async function openWithSearch(special: Record<number, string>, count = 40) {
  makeTranscript("long", contents(count, special));
  const id = register("long");
  await resolver()(id);
  return id;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("searching a long transcript and opening a result", () => {
  it("finds a passage far back and opens the window that holds it, with no paging", async () => {
    await openWithSearch({ 5: "Finding B: the firewall parser ignores ALLOW/DENY" });
    expect(ids()).toEqual(["long-m37", "long-m38", "long-m39"]);

    await useSessionStore.getState().searchSessionWindow("Firewall Parser");
    const search = useSessionStore.getState().sessionSearch!;
    expect(search.hits.map((hit) => hit.messageId)).toEqual(["long-m5"]);
    expect(search.reachedStart).toBe(true);
    expect(search.status).toBe("idle");

    fake.calls = [];
    await useSessionStore.getState().openSessionSearchHit(search.hits[0]!);

    // One read ending at the matched record, one read forward after it.
    expect(fake.calls.map((call) => call.kind)).toEqual(["window", "window"]);
    expect(fake.calls[0]!.cursor).toEqual({ beforeOffset: 600, sourceId: "src-long", endAnchor: expect.stringContaining("e-long-m5") });
    expect(fake.calls[1]!.cursor).toMatchObject({ afterOffset: 600, sourceId: "src-long" });
    expect(ids()).toEqual(["long-m3", "long-m4", "long-m5", "long-m6", "long-m7", "long-m8"]);
    expect(view().focus).toMatchObject({ messageId: "long-m5", query: "Firewall Parser" });

    const html = markup();
    expect(html).toContain("<mark>firewall parser</mark>");
    expect(html).toContain("is-search-focus");
    expect(html).toContain("이전 대화 일부 표시 중");
    expect(html).not.toContain("최근 대화 일부 표시 중");
    expect(html).toContain("다음 대화 보기");
    expect(html).toContain("최신 대화로");
    expect(html).toContain("이전 대화 더 보기");
    expect(html).toContain("파일 앞에서 약 7% 지점");
  });

  it("a middle part is never the latest, and newer pages read forward until it is", async () => {
    await openWithSearch({ 5: "the needle" });
    await useSessionStore.getState().searchSessionWindow("needle");
    await useSessionStore.getState().openSessionSearchHit(useSessionStore.getState().sessionSearch!.hits[0]!);
    expect(isAtLatest(view())).toBe(false);
    expect(view().status).toBe("partial");

    let guard = 0;
    while (!isAtLatest(view()) && guard < 20) {
      await useSessionStore.getState().loadNewerSessionWindow();
      expect(view().spans.length).toBeLessThanOrEqual(MAX_RETAINED_WINDOWS);
      guard += 1;
    }
    expect(isAtLatest(view())).toBe(true);
    expect(ids().at(-1)).toBe("long-m39");
    // Contiguous, no record twice.
    expect(new Set(ids()).size).toBe(ids().length);
    const numbers = ids().map((id) => Number(id.split("-m")[1]));
    expect(numbers).toEqual(numbers.map((_, index) => numbers[0]! + index));
    expect(markup()).toContain("최근 대화 일부 표시 중");
  });

  it("earlier pages after a jump release the newest and read it back before reading forward", async () => {
    await openWithSearch({ 20: "the needle" });
    await useSessionStore.getState().searchSessionWindow("needle");
    await useSessionStore.getState().openSessionSearchHit(useSessionStore.getState().sessionSearch!.hits[0]!);
    for (let page = 0; page < 3; page += 1) await useSessionStore.getState().loadEarlierSessionWindow();
    expect(view().spans.length).toBe(MAX_RETAINED_WINDOWS);
    expect(view().released.length).toBe(1);
    expect(ids()[0]).toBe("long-m9");

    fake.calls = [];
    await useSessionStore.getState().loadNewerSessionWindow();
    expect(fake.calls[0]!.cursor).toHaveProperty("beforeOffset", 2400);
    await useSessionStore.getState().loadNewerSessionWindow();
    expect(fake.calls[1]!.cursor).toHaveProperty("afterOffset", 2400);
    expect(ids().at(-1)).toBe("long-m26");
  });

  it("최신 대화로 returns to the end and drops the focus, the results stay", async () => {
    await openWithSearch({ 5: "the needle" });
    await useSessionStore.getState().searchSessionWindow("needle");
    await useSessionStore.getState().openSessionSearchHit(useSessionStore.getState().sessionSearch!.hits[0]!);
    await useSessionStore.getState().loadLatestSessionWindow();
    expect(ids()).toEqual(["long-m37", "long-m38", "long-m39"]);
    expect(view().focus).toBeNull();
    expect(isAtLatest(view())).toBe(true);
    expect(useSessionStore.getState().sessionSearch?.hits).toHaveLength(1);
  });

  it("gathers a page of matches across bounded steps and continues on request", async () => {
    const special: Record<number, string> = {};
    for (let index = 0; index < 40; index += 1) special[index] = `needle ${index}`;
    await openWithSearch(special);
    await useSessionStore.getState().searchSessionWindow("needle");
    let search = useSessionStore.getState().sessionSearch!;
    expect(search.hits).toHaveLength(20);
    expect(search.reachedStart).toBe(false);
    expect(search.hits[0]!.messageId).toBe("long-m39");
    expect(markup()).not.toContain("찾지 못했습니다");

    await useSessionStore.getState().searchMoreSessionWindow();
    search = useSessionStore.getState().sessionSearch!;
    expect(search.hits).toHaveLength(40);
    expect(new Set(search.hits.map((hit) => hit.messageId)).size).toBe(40);
    expect(search.reachedStart).toBe(true);
  });

  it("says a partial search found nothing only for the part it searched", async () => {
    makeTranscript("long", contents(40));
    const id = register("long");
    await resolver()(id);
    let steps = 0;
    fake.gate = ({ kind }) => {
      if (kind === "search" && ++steps === 3) useSessionStore.getState().cancelSessionSearch();
    };
    await useSessionStore.getState().searchSessionWindow("absent phrase");
    const search = useSessionStore.getState().sessionSearch!;
    expect(search.status).toBe("cancelled");
    expect(search.reachedStart).toBe(false);
    expect(markup()).not.toContain("원본 전체에서 찾지 못했습니다");

    fake.gate = null;
    await useSessionStore.getState().searchSessionWindow("absent phrase");
    expect(useSessionStore.getState().sessionSearch!.reachedStart).toBe(true);
    // The markup renders the panel only while it is open; the status line is pure.
    const { searchStatusLine } = await import("../lib/session/sessionSearch");
    expect(searchStatusLine(useSessionStore.getState().sessionSearch!)).toBe("원본 전체에서 찾지 못했습니다");
  });
});

describe("stale searches and jumps", () => {
  it("a search reply for one session never lands after another opens", async () => {
    makeTranscript("a", contents(40, { 3: "needle in a" }));
    makeTranscript("b", contents(40, { 3: "needle in b" }));
    const a = register("a");
    const b = register("b");
    await resolver()(a);
    const held = deferred();
    fake.gate = ({ kind }) => (kind === "search" ? held.promise : undefined);
    const searching = useSessionStore.getState().searchSessionWindow("needle");
    fake.gate = null;
    await resolver()(b);
    const before = view();
    held.release();
    await searching;
    expect(useSessionStore.getState().sessionSearch).toBeNull();
    expect(view()).toBe(before);
    expect(view().sessionId).toBe(b);
  });

  it("a new query drops the previous query's late reply", async () => {
    // "alpha" sits in the first step's range, so a late alpha step would carry a hit.
    await openWithSearch({ 38: "alpha here", 30: "beta here" });
    const held = deferred();
    fake.gate = ({ kind }) => (kind === "search" ? held.promise : undefined);
    const first = useSessionStore.getState().searchSessionWindow("alpha");
    fake.gate = null;
    await useSessionStore.getState().searchSessionWindow("beta");
    held.release();
    await first;
    const search = useSessionStore.getState().sessionSearch!;
    expect(search.query).toBe("beta");
    expect(search.hits.map((hit) => hit.messageId)).toEqual(["long-m30"]);
  });

  it("only the last of two quick result clicks moves the view", async () => {
    await openWithSearch({ 5: "needle five", 25: "needle twenty-five" });
    await useSessionStore.getState().searchSessionWindow("needle");
    const [later, earlier] = useSessionStore.getState().sessionSearch!.hits;
    const held = deferred();
    fake.gate = ({ cursor }) => ((cursor as Cursor | undefined)?.beforeOffset === later!.recordEnd ? held.promise : undefined);
    const first = useSessionStore.getState().openSessionSearchHit(later!);
    await useSessionStore.getState().openSessionSearchHit(earlier!);
    held.release();
    await first;
    expect(view().focus?.messageId).toBe("long-m5");
    expect(ids()).toContain("long-m5");
    expect(ids()).not.toContain("long-m25");
  });

  it("a jump that replies after another session opened does nothing", async () => {
    makeTranscript("a", contents(40, { 3: "needle in a" }));
    makeTranscript("b", contents(40));
    const a = register("a");
    const b = register("b");
    await resolver()(a);
    await useSessionStore.getState().searchSessionWindow("needle");
    const hit = useSessionStore.getState().sessionSearch!.hits[0]!;
    const held = deferred();
    fake.gate = ({ kind }) => (kind === "window" ? held.promise : undefined);
    const jumping = useSessionStore.getState().openSessionSearchHit(hit);
    fake.gate = null;
    await resolver()(b);
    const before = view();
    held.release();
    await jumping;
    expect(view()).toBe(before);
    expect(view().focus).toBeNull();
  });

  it("a jump from one session never lands in another session's new search", async () => {
    makeTranscript("a", contents(40, { 3: "needle in a" }));
    makeTranscript("b", contents(40, { 30: "needle in b" }));
    const a = register("a");
    const b = register("b");
    await resolver()(a);
    await useSessionStore.getState().searchSessionWindow("needle");
    const hitInA = useSessionStore.getState().sessionSearch!.hits[0]!;
    const held = deferred();
    fake.gate = ({ kind, path }) => (kind === "window" && path === "a" ? held.promise : undefined);
    const jumping = useSessionStore.getState().openSessionSearchHit(hitInA);
    await resolver()(b);
    await useSessionStore.getState().searchSessionWindow("needle");
    const before = view();
    held.release();
    await jumping;
    expect(view()).toBe(before);
    expect(ids().every((id) => id.startsWith("b-"))).toBe(true);
  });

  it("refuses a result whose record or message changed, and leaves the view alone", async () => {
    await openWithSearch({ 5: "the needle" });
    await useSessionStore.getState().searchSessionWindow("needle");
    const hit = useSessionStore.getState().sessionSearch!.hits[0]!;
    const before = view();
    // Rewritten in place: the record before the cursor no longer matches its anchor.
    fake.transcripts.get("long")!.records[5]!.content = "rewritten text";
    await useSessionStore.getState().openSessionSearchHit(hit);
    expect(view()).toBe(before);
    expect(useSessionStore.getState().sessionSearch!.openError?.error.kind).toBe("changed");
  });

  it("refuses a result whose message no longer holds the phrase even when the anchor agrees", async () => {
    await openWithSearch({ 5: "the needle" });
    await useSessionStore.getState().searchSessionWindow("needle");
    const hit = useSessionStore.getState().sessionSearch!.hits[0]!;
    const before = view();
    // Same length, so the fake's anchor (id and length) still agrees.
    fake.transcripts.get("long")!.records[5]!.content = "the eldeen";
    await useSessionStore.getState().openSessionSearchHit(hit);
    expect(view()).toBe(before);
    expect(useSessionStore.getState().sessionSearch!.openError?.error.kind).toBe("changed");
  });

  it("an earlier page in flight when a result opens does not splice into the new place", async () => {
    await openWithSearch({ 5: "the needle" });
    await useSessionStore.getState().searchSessionWindow("needle");
    const hit = useSessionStore.getState().sessionSearch!.hits[0]!;
    const held = deferred();
    fake.gate = ({ cursor }) => ((cursor as Cursor | undefined)?.anchor ? held.promise : undefined);
    const paging = useSessionStore.getState().loadEarlierSessionWindow();
    fake.gate = null;
    await useSessionStore.getState().openSessionSearchHit(hit);
    const jumped = view();
    held.release();
    await paging;
    expect(view()).toBe(jumped);
    expect(view().paging).toBeNull();
  });

  it("searching and opening results never writes to storage", async () => {
    await openWithSearch({ 5: "the needle" });
    const before = JSON.stringify(repository.listStoredSessions());
    await useSessionStore.getState().searchSessionWindow("needle");
    await useSessionStore.getState().openSessionSearchHit(useSessionStore.getState().sessionSearch!.hits[0]!);
    expect(JSON.stringify(repository.listStoredSessions())).toBe(before);
    expect(useSessionStore.getState().imports).toEqual([]);
  });
});
