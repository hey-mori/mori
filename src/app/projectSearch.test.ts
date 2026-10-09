/**
 * Searching a project's confirmed sessions, and opening a result.
 *
 * The native search and window reader are replaced at the IPC boundary by a
 * fake set of transcripts (records with byte ranges and anchors). The kernel
 * side uses the real membership rule through `buildProjectSearchInventory`.
 * These tests drive the stores the way the 프로젝트 page does.
 */
import { createElement } from "react";
import { findPhrase } from "../lib/session/sessionSearch";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkSessionMeta } from "../lib/trace/sources/ai/workSessions";
import type { ClaudeCodeSearchBatch, ClaudeCodeSearchHit, ClaudeCodeSessionWindow } from "../lib/claude/types";
import type { KernelContext, MoriRecord } from "../lib/record-kernel/kernelTypes";

type FakeRecord = { id: string; content: string; start: number; end: number };
type Cursor = { beforeOffset?: number; afterOffset?: number; sourceId?: string; anchor?: string; endAnchor?: string };

const RECORD = 100;
const WINDOW_RECORDS = 3;
const SCAN_RECORDS = 4;

const fake = vi.hoisted(() => ({
  transcripts: new Map<string, { sourceId: string; records: FakeRecord[]; unsearchable?: number }>(),
  meta: new Map<string, unknown>(),
  gate: null as null | ((call: { kind: "window" | "search"; path: string; cursor?: unknown }) => Promise<void> | void),
  /** Kept copies by session id: what `keptArchiveRead` answers. */
  archives: new Map<string, { path: string; archive: { archivedAt: string; bytes: number }; integrity?: string; sourceId?: string }>(),
  calls: [] as { kind: "window" | "search"; path: string; cursor?: unknown }[],
  /** Anchors that cover only a record's head, as real ones do (its
   *  parentUuid), instead of its content: the checks after the anchor run. */
  headAnchors: false,
  inflight: 0,
  maxInflight: 0,
}));

vi.mock("../lib/desktop/llmEndpointRegistry", () => ({ syncLlmAllowedEndpoints: () => {} }));
vi.mock("../lib/session/sessionArchiveRead", () => ({
  keptArchiveRead: async (sessionId: string) => {
    const kept = fake.archives.get(sessionId);
    return kept ? { integrity: "ok", ...kept } : null;
  },
  isUsableArchive: (kept: { integrity: string }) => kept.integrity === "ok" || kept.integrity === "unknown",
  keptArchiveSourceId: async (sessionId: string) => fake.archives.get(sessionId)?.sourceId ?? null,
}));
vi.mock("../lib/claude/claudeTauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getClaudeCodeSessionWindow: async (path: string, cursor?: Cursor) => {
    fake.calls.push({ kind: "window", path, cursor });
    await fake.gate?.({ kind: "window", path, cursor });
    return readWindow(path, cursor);
  },
  searchClaudeCodeSession: async (path: string, query: string, cursor?: Cursor, maxHits?: number, wholeWords = false) => {
    fake.calls.push({ kind: "search", path, cursor });
    fake.inflight += 1;
    fake.maxInflight = Math.max(fake.maxInflight, fake.inflight);
    try {
      await fake.gate?.({ kind: "search", path, cursor });
      await Promise.resolve();
      return searchTranscript(path, query, cursor, maxHits ?? 50, wholeWords);
    } finally {
      fake.inflight -= 1;
    }
  },
}));
vi.mock("../lib/session/autoImportMetaStore", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAutoImportMeta: (id: string) => fake.meta.get(id) ?? null,
}));

import { selectActiveSessionWindow, setSessionRepositoryForTesting, useSessionStore } from "./sessionStore";
import { useProjectSearchStore } from "./projectSearchStore";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import { agentSessionToStoredDraft } from "../lib/session/autoImportSessions";
import {
  buildProjectSearchInventory,
  canContinue,
  PROJECT_SEARCH_CONCURRENCY,
  PROJECT_SEARCH_PHASE_STEPS,
  projectSearchCoverage,
  projectSearchStatusLine,
  type ProjectSearchInventory,
} from "../lib/session/projectSearch";
import { isAtLatest, isLoadedWindow, MAX_RETAINED_WINDOWS, type LoadedSessionWindow } from "../lib/session/sessionWindow";
import { SessionSourceWindow } from "../features/session/SessionSourceWindow";
import { buildPassageDraft, sha256Hex } from "../lib/capture/passageCapture";
import { redactText } from "../lib/connectors/redaction";

// ─── fake transcripts ──────────────────────────────────────────────────────

/** A window read through the same fake the store uses. */
async function getClaudeCodeSessionWindowForTest(path: string) {
  const { getClaudeCodeSessionWindow } = await import("../lib/claude/claudeTauri");
  return getClaudeCodeSessionWindow(path);
}

function transcript(path: string) {
  const found = fake.transcripts.get(path);
  if (!found) throw new Error("SOURCE_MISSING: no such file");
  return found;
}

const endAnchorOf = (records: FakeRecord[], offset: number) => {
  const before = records.find((record) => record.end === offset);
  if (!before) return "";
  return fake.headAnchors ? `e-${before.id}` : `e-${before.id}:${before.content}`;
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
    events: picked.map((record) => ({
      id: record.id,
      role: "assistant",
      content: record.content,
      createdAt: "2026-10-08T00:00:00Z",
      record: { start: record.start, end: record.end, anchor: endAnchorOf(all, record.end) },
    })),
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
    return windowOf(path, records.filter((record) => record.start >= cursor.afterOffset!).slice(0, WINDOW_RECORDS), records, sourceId, cursor.afterOffset);
  }
  const before = cursor?.beforeOffset ?? records[records.length - 1]!.end;
  if (cursor?.endAnchor !== undefined && cursor.endAnchor !== endAnchorOf(records, before)) {
    throw new Error("SOURCE_CHANGED: the record before the cursor is not the one it named.");
  }
  return windowOf(path, records.filter((record) => record.end <= before).slice(-WINDOW_RECORDS), records, sourceId, before);
}

function searchTranscript(path: string, query: string, cursor: Cursor | undefined, maxHits: number, wholeWords = false): ClaudeCodeSearchBatch {
  const found = transcript(path);
  const { sourceId, records } = found;
  if (cursor?.sourceId && cursor.sourceId !== sourceId) throw new Error("SOURCE_CHANGED: replaced");
  const end = cursor?.beforeOffset ?? records[records.length - 1]!.end;
  const scanned = records.filter((record) => record.end <= end).slice(-SCAN_RECORDS).reverse();
  const hits: ClaudeCodeSearchHit[] = [];
  let scanStart = scanned[scanned.length - 1]?.start ?? 0;
  let hitLimit = false;
  for (const record of scanned) {
    const at = findPhrase(record.content, query, wholeWords)?.[0]?.[0] ?? -1;
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
  const reachedStart = scanStart === 0;
  return {
    sourceId,
    fileBytes: records[records.length - 1]!.end,
    scanEnd: end,
    scanStart,
    scanStartAnchor: `s-${scanStart}`,
    reachedStart,
    hits,
    hitLimit,
    searchedRecords: scanned.length,
    unsearchableRecords: reachedStart ? (found.unsearchable ?? 0) : 0,
    unsearchableBytes: 0,
  };
}

// ─── kernel and sessions ───────────────────────────────────────────────────

const ctx = (id: string, name: string, extra: Partial<KernelContext> = {}): KernelContext => ({
  id,
  type: "project",
  name,
  createdAt: "2026-10-08T00:00:00Z",
  ...extra,
});
const contexts = [ctx("ctx-infra", "infra"), ctx("ctx-infra-2", "infra"), ctx("ctx-home", "home")];

let records: MoriRecord[] = [];
let repository: BrowserDraftRepository;

/** A discovered Claude Code session: its transcript, its draft, its kernel
 *  record (filed under `contextId` when given), and its descriptor. */
function session(
  name: string,
  contents: string[],
  options: { contextId?: string; title?: string; activeAt?: string; ids?: { [index: number]: string }; path?: string; agent?: "claude" | "codex"; unsearchable?: number } = {},
) {
  const path = options.path ?? `/home/u/.claude/projects/-home-u-dev-infra/${name}.jsonl`;
  if (!fake.transcripts.has(path)) {
    fake.transcripts.set(path, {
      sourceId: `src-${name}`,
      unsearchable: options.unsearchable,
      records: contents.map((content, index) => ({ id: options.ids?.[index] ?? `${name}-m${index}`, content, start: index * RECORD, end: (index + 1) * RECORD })),
    });
  }
  const agent = options.agent ?? "claude";
  const m: AgentWorkSessionMeta = {
    agentId: agent,
    agentName: agent === "claude" ? "Claude Code" : "Codex",
    importKind: agent === "claude" ? "claude-code" : "codex-session",
    id: name,
    sessionId: name,
    projectPath: "/home/u/dev/infra",
    projectName: "infra",
    filePath: path,
    sourceFilePath: path,
    startedAt: "2026-09-01T00:00:00Z",
    updatedAt: options.activeAt ?? "2026-10-08T00:00:00Z",
    messageCount: contents.length,
    title: options.title ?? name,
  };
  const id = `auto-${agent}-${name}`;
  fake.meta.set(id, m);
  repository.putStoredSessionDraft({ ...agentSessionToStoredDraft(m), session: { ...agentSessionToStoredDraft(m).session, id } });
  records.push({
    id,
    schemaId: "agent-session",
    title: options.title ?? name,
    body: "",
    capturedAt: "2026-10-08T00:00:00Z",
    occurredStart: "2026-09-01T00:00:00Z",
    occurredEnd: options.activeAt ?? "2026-10-08T00:00:00Z",
    timeBasis: "source-observed",
    status: "active",
    origin: "automation",
    ownership: "db",
    contextIds: options.contextId ? [options.contextId] : [],
    properties: { agentId: agent },
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
  });
  return id;
}

function inventory(projectId = "ctx-infra"): Extract<ProjectSearchInventory, { kind: "ok" }> {
  const result = buildProjectSearchInventory({
    projectId,
    contexts,
    records,
    descriptorOf: (id) => {
      const m = fake.meta.get(id) as AgentWorkSessionMeta | undefined;
      return m ? { agentName: m.agentName, importKind: m.importKind, sourcePath: m.sourceFilePath ?? null } : null;
    },
    sessionOf: (id) => {
      const m = fake.meta.get(id) as AgentWorkSessionMeta | undefined;
      return m ? { title: m.title, lastActiveAt: m.updatedAt } : null;
    },
  });
  if (result.kind !== "ok") throw new Error("unavailable");
  return result;
}

const lines = (count: number, special: { [index: number]: string } = {}) =>
  Array.from({ length: count }, (_, index) => special[index] ?? `routine work ${index}`);

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const search = () => useProjectSearchStore.getState().search!;
const hitsOf = (id: string) => search().sources[id]?.hits.map((hit) => hit.messageId) ?? [];
function view(): LoadedSessionWindow {
  const state = useSessionStore.getState().sessionWindow;
  if (!isLoadedWindow(state)) throw new Error(`no loaded window: ${JSON.stringify(state)}`);
  return state;
}
const markup = () => {
  const state = selectActiveSessionWindow(useSessionStore.getState());
  return state ? renderToStaticMarkup(createElement(SessionSourceWindow, { state })) : "TABS";
};

beforeEach(() => {
  repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
  setSessionRepositoryForTesting(repository);
  useSessionStore.setState({ initialized: true, draft: null, imports: [], sessionWindow: null, sessionSearch: null, source: "browser-draft" });
  useProjectSearchStore.getState().close();
  fake.transcripts.clear();
  fake.archives.clear();
  fake.meta.clear();
  fake.gate = null;
  fake.calls = [];
  fake.inflight = 0;
  fake.maxInflight = 0;
  records = [];
});

afterEach(() => {
  setSessionRepositoryForTesting(null);
});

// ─── orchestration ─────────────────────────────────────────────────────────

describe("searching a project's confirmed sessions", () => {
  it("finds a match whichever session holds it: first, second or oldest", async () => {
    const newest = session("newest", lines(10, { 2: "needle in newest" }), { contextId: "ctx-infra", activeAt: "2026-10-09T00:00:00Z" });
    const middle = session("middle", lines(10, { 7: "needle in middle" }), { contextId: "ctx-infra", activeAt: "2026-10-05T00:00:00Z" });
    const oldest = session("oldest", lines(10, { 0: "needle in oldest" }), { contextId: "ctx-infra", activeAt: "2026-09-01T00:00:00Z" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect([hitsOf(newest), hitsOf(middle), hitsOf(oldest)]).toEqual([["newest-m2"], ["middle-m7"], ["oldest-m0"]]);
    expect(projectSearchCoverage(search())).toMatchObject({ searchable: 3, done: 3, complete: true, sessionsWithHits: 3 });
  });

  it("searches only confirmed members, never a suggested, unfiled or other-project session", async () => {
    const member = session("member", lines(5, { 1: "needle" }), { contextId: "ctx-infra" });
    session("unfiled", lines(5, { 1: "needle" }));
    session("twin-project", lines(5, { 1: "needle" }), { contextId: "ctx-infra-2" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(search().order).toEqual([member]);
    expect(new Set(fake.calls.map((call) => call.path))).toEqual(new Set(["/home/u/.claude/projects/-home-u-dev-infra/member.jsonl"]));
  });

  it("says the project has no match only when every confirmed session was searched to its start", async () => {
    session("a", lines(10), { contextId: "ctx-infra" });
    session("b", lines(3), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "absent");
    expect(projectSearchStatusLine(search())).toContain("확정된 대화 전체에서 찾지 못했습니다");
    session("c", lines(3), { contextId: "ctx-infra", agent: "codex" });
    await useProjectSearchStore.getState().start(inventory(), "absent");
    expect(projectSearchStatusLine(search())).toContain("찾은 대화에서는 없었습니다");
    expect(projectSearchStatusLine(search())).not.toContain("전체에서");
  });

  it("matches whole words by default and any substring when asked", async () => {
    const id = session("words", lines(6, { 1: "two candidate backings", 3: "Decision: Candidate B" }), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "candidate b");
    expect(hitsOf(id)).toEqual(["words-m3"]);
    expect(search().wholeWords).toBe(true);
    await useProjectSearchStore.getState().start(inventory(), "candidate b", false);
    expect(hitsOf(id)).toEqual(["words-m3", "words-m1"]);
    // A substring result opens and is checked under the substring rule.
    expect(await useProjectSearchStore.getState().openHit(id, search().sources[id]!.hits[1]!)).toBe("opened");
    expect(view().focus).toMatchObject({ messageId: "words-m1", wholeWords: false });
  });

  it("never claims the whole project was searched when a record was too large to search", async () => {
    // The only place the phrase could be is a record the viewer cannot show.
    session("a", lines(6), { contextId: "ctx-infra", unsearchable: 1 });
    session("b", lines(4), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const coverage = projectSearchCoverage(search());
    expect(coverage).toMatchObject({ complete: true, unsearchableRecords: 1, hits: 0 });
    const line = projectSearchStatusLine(search());
    expect(line).not.toContain("전체에서 찾지 못했습니다");
    expect(line).toContain("너무 큰 기록 1개");
  });

  it("gives every source a step before any gets a second, with bounded concurrency", async () => {
    const big = session("big", lines(40), { contextId: "ctx-infra", activeAt: "2026-10-09T00:00:00Z" });
    session("small", lines(4, { 1: "needle" }), { contextId: "ctx-infra", activeAt: "2026-10-01T00:00:00Z" });
    session("tiny", lines(2), { contextId: "ctx-infra", activeAt: "2026-09-01T00:00:00Z" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const order = fake.calls.filter((call) => call.kind === "search").map((call) => call.path.split("/").pop());
    // The large source's second step comes only after both others had theirs.
    expect(order.slice(0, 3).sort()).toEqual(["big.jsonl", "small.jsonl", "tiny.jsonl"]);
    expect(PROJECT_SEARCH_CONCURRENCY).toBe(2);
    expect(fake.maxInflight).toBe(2);
    expect(search().sources[big]!.steps).toBe(10);
  });

  it("continues a source over several steps with its own cursor, and many matches per step", async () => {
    const many = session("many", lines(40, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i, `needle ${i}`]))), { contextId: "ctx-infra" });
    const other = session("other", lines(12, { 5: "needle x" }), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(hitsOf(many)).toHaveLength(40);
    expect(new Set(hitsOf(many)).size).toBe(40);
    const manyCursors = fake.calls.filter((call) => call.path.endsWith("many.jsonl")).map((call) => (call.cursor as Cursor | undefined)?.beforeOffset ?? null);
    expect(manyCursors).toEqual([null, 3600, 3200, 2800, 2400, 2000, 1600, 1200, 800, 400]);
    expect(hitsOf(other)).toEqual(["other-m5"]);
  });

  it("stops a phase at its step budget, says it is partial, and continues without duplicates", async () => {
    const ids = Array.from({ length: 3 }, (_, i) =>
      session(`huge${i}`, lines(200, { 0: `needle at the start of ${i}` }), { contextId: "ctx-infra" }),
    );
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(fake.calls.filter((call) => call.kind === "search")).toHaveLength(PROJECT_SEARCH_PHASE_STEPS);
    expect(search().status).toBe("idle");
    expect(canContinue(search())).toBe(true);
    expect(projectSearchStatusLine(search())).toContain("아직 찾지 않은 부분이 있습니다");
    // Fair: each source got a third of the phase.
    expect(ids.map((id) => search().sources[id]!.steps)).toEqual([8, 8, 8]);
    while (canContinue(search())) await useProjectSearchStore.getState().more();
    expect(ids.map((id) => hitsOf(id))).toEqual(ids.map((_, i) => [`huge${i}-m0`]));
    expect(projectSearchCoverage(search()).complete).toBe(true);
  });

  it("stopping schedules no further steps and keeps what was found", async () => {
    session("a", lines(40, { 39: "needle late" }), { contextId: "ctx-infra" });
    session("b", lines(40), { contextId: "ctx-infra" });
    let steps = 0;
    fake.gate = ({ kind }) => {
      if (kind === "search" && ++steps === 3) useProjectSearchStore.getState().stop();
    };
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const before = fake.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.calls.length).toBe(before);
    expect(search().status).toBe("stopped");
    expect(projectSearchCoverage(search()).complete).toBe(false);
    expect(Object.values(search().sources).some((source) => source.status === "searching")).toBe(false);
  });

  it("a new query or another project drops the old search's late replies", async () => {
    session("a", lines(4, { 3: "alpha here" }), { contextId: "ctx-infra" });
    session("h", lines(4, { 3: "alpha at home" }), { contextId: "ctx-home" });
    const held = deferred();
    fake.gate = ({ kind }) => (kind === "search" ? held.promise : undefined);
    const first = useProjectSearchStore.getState().start(inventory(), "alpha");
    fake.gate = null;
    await useProjectSearchStore.getState().start(inventory("ctx-home"), "alpha");
    held.release();
    await first;
    expect(search().projectId).toBe("ctx-home");
    expect(Object.keys(search().sources)).toEqual(["auto-claude-h"]);
    expect(hitsOf("auto-claude-h")).toEqual(["h-m3"]);
  });

  it("an old query's step landing while the new query's step for the same source runs is dropped", async () => {
    const only = session("only", lines(4, { 3: "alpha here", 2: "beta here" }), { contextId: "ctx-infra" });
    const oldStep = deferred();
    const newStep = deferred();
    let calls = 0;
    fake.gate = ({ kind }) => (kind === "search" ? (++calls === 1 ? oldStep.promise : newStep.promise) : undefined);
    const first = useProjectSearchStore.getState().start(inventory(), "alpha");
    const second = useProjectSearchStore.getState().start(inventory(), "beta");
    oldStep.release();
    await first;
    newStep.release();
    await second;
    expect(search().query).toBe("beta");
    expect(hitsOf(only)).toEqual(["only-m2"]);
  });

  it("a session that leaves the project mid-search stops being searched and its results are not offered", async () => {
    const leaving = session("leaving", lines(40, { 39: "needle" }), { contextId: "ctx-infra" });
    const staying = session("staying", lines(40, { 0: "needle" }), { contextId: "ctx-infra" });
    let steps = 0;
    fake.gate = ({ kind }) => {
      if (kind === "search" && ++steps === 3) {
        // The operator unfiles it: the page recomputes the scope and restricts the search.
        records = records.map((record) => (record.id === leaving ? { ...record, contextIds: [] } : record));
        useProjectSearchStore.getState().restrict("ctx-infra", new Set(inventory().entries.map((entry) => entry.sessionId)));
      }
    };
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(search().sources[leaving]!.status).toBe("excluded");
    expect(projectSearchCoverage(search())).toMatchObject({ excluded: 1, sessionsWithHits: 1 });
    expect(fake.calls.filter((call) => call.path.endsWith("leaving.jsonl")).length).toBeLessThan(3);
    expect(hitsOf(staying)).toEqual(["staying-m0"]);
    expect(await useProjectSearchStore.getState().openHit(leaving, search().sources[leaving]!.hits[0] ?? ({} as ClaudeCodeSearchHit))).toBe("superseded");
  });

  it("reports a source that disappears or fails, and searches the rest", async () => {
    const gone = session("gone", lines(40), { contextId: "ctx-infra", activeAt: "2026-10-09T00:00:00Z" });
    const ok = session("ok", lines(8, { 2: "needle" }), { contextId: "ctx-infra" });
    let first = true;
    fake.gate = ({ kind, path }) => {
      if (kind === "search" && path.endsWith("gone.jsonl") && !first) fake.transcripts.delete(path);
      if (path.endsWith("gone.jsonl")) first = false;
    };
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(search().sources[gone]!.status).toBe("missing");
    expect(hitsOf(ok)).toEqual(["ok-m2"]);
    expect(projectSearchCoverage(search())).toMatchObject({ unavailable: 1, complete: false });
    expect(projectSearchStatusLine(search())).not.toContain("전체에서");
  });

  it("searches a kept copy when a member's original is gone, and says which copy it read", async () => {
    const gone = session("gonekept", lines(8, { 3: "needle" }), { contextId: "ctx-infra" });
    const path = "/home/u/.claude/projects/-home-u-dev-infra/gonekept.jsonl";
    const archivePath = `/home/u/Mori/Records/archives/claude-code/${"c".repeat(64)}.jsonl`;
    fake.transcripts.set(archivePath, fake.transcripts.get(path)!);
    fake.transcripts.delete(path);
    fake.archives.set(gone, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 800 } });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const source = search().sources[gone]!;
    expect(source.archive).toEqual({ archivedAt: "2026-10-09T10:00:00.000Z", bytes: 800 });
    expect(source.sourcePath).toBe(archivePath);
    expect(hitsOf(gone)).toEqual(["gonekept-m3"]);
    // Opening the hit reads the kept copy and marks the view as such.
    expect(await useProjectSearchStore.getState().openHit(gone, source.hits[0]!)).toBe("opened");
    expect(view().archive?.archivedAt).toBe("2026-10-09T10:00:00.000Z");
  });

  it("reads a source shared by two sessions once, and counts unsearchable records", async () => {
    const path = "/home/u/.claude/projects/-home-u-dev-infra/shared.jsonl";
    const first = session("shared-a", lines(6, { 4: "needle" }), { contextId: "ctx-infra", path, activeAt: "2026-10-09T00:00:00Z", unsearchable: 2 });
    session("shared-b", [], { contextId: "ctx-infra", path, activeAt: "2026-10-01T00:00:00Z" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(search().order).toEqual([first]);
    expect(fake.calls.filter((call) => call.kind === "search")).toHaveLength(2);
    expect(projectSearchCoverage(search())).toMatchObject({ sameSource: 1, unsearchableRecords: 2 });
  });
});

// ─── opening a result ──────────────────────────────────────────────────────

describe("opening a project search result", () => {
  it("opens the right session at the exact record, with context, without importing it", async () => {
    const target = session("storage", lines(40, { 20: "Decision: Candidate B, SMB served from nuc-srv" }), { contextId: "ctx-infra", title: "같은 제목" });
    session("lookalike", lines(40, { 20: "Candidate B was rejected elsewhere" }), { contextId: "ctx-infra-2", title: "같은 제목" });
    await useProjectSearchStore.getState().start(inventory(), "Candidate B");
    const hit = search().sources[target]!.hits[0]!;
    const before = JSON.stringify(repository.listSessionImports(target));
    expect(await useProjectSearchStore.getState().openHit(target, hit)).toBe("opened");
    expect(useSessionStore.getState().draft?.session.id).toBe(target);
    expect(view().events.map((event) => event.id)).toEqual(["storage-m18", "storage-m19", "storage-m20", "storage-m21", "storage-m22", "storage-m23"]);
    expect(view().focus).toMatchObject({ messageId: "storage-m20", query: "Candidate B" });
    expect(isAtLatest(view())).toBe(false);
    const html = markup();
    expect(html).toContain("<mark>Candidate B</mark>");
    // The way back renders from this (a static render reads stores' initial state).
    expect(useProjectSearchStore.getState().openedSessionId).toBe(target);
    expect(JSON.stringify(repository.listSessionImports(target))).toBe(before);
    expect(useSessionStore.getState().imports).toEqual([]);
  });

  it("navigates earlier, newer and back to the latest from the opened passage", async () => {
    const target = session("t", lines(40, { 20: "needle" }), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    await useProjectSearchStore.getState().openHit(target, search().sources[target]!.hits[0]!);
    await useSessionStore.getState().loadEarlierSessionWindow();
    expect(view().events[0]!.id).toBe("t-m15");
    while (!isAtLatest(view())) {
      await useSessionStore.getState().loadNewerSessionWindow();
      expect(view().spans.length).toBeLessThanOrEqual(MAX_RETAINED_WINDOWS);
    }
    expect(view().events.at(-1)!.id).toBe("t-m39");
    await useSessionStore.getState().loadLatestSessionWindow();
    expect(view().focus).toBeNull();
    // The way back to the results is still there.
    expect(useProjectSearchStore.getState().search?.query).toBe("needle");
    expect(useProjectSearchStore.getState().openedSessionId).toBe(target);
  });

  it("targets the record the result names when two records share an id", async () => {
    const target = session("dup", lines(30, { 20: "first version", 21: "second version names the needle" }), {
      contextId: "ctx-infra",
      ids: { 20: "same", 21: "same" },
    });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(await useProjectSearchStore.getState().openHit(target, search().sources[target]!.hits[0]!)).toBe("opened");
    const focused = markup().match(/is-search-focus[^>]*>[\s\S]*?<\/li>/g) ?? [];
    expect(focused).toHaveLength(1);
    expect(focused[0]).toContain("<mark>needle</mark>");
  });

  it("opens a small session that already has an import at the passage, without touching the import", async () => {
    const target = session("small", lines(6, { 2: "needle" }), { contextId: "ctx-infra" });
    const imported = { source: { id: "src-small", sessionId: target, kind: "claudeTranscript", title: "small", detail: "", trustLevel: "observed", redactionStatus: "pending", rawRetention: "summaryOnly", capturedAt: "", relatedEventIds: [] }, events: [] };
    repository.addSessionImport(target, imported as never);
    const importsBefore = JSON.stringify(repository.listSessionImports(target));
    await useProjectSearchStore.getState().start(inventory(), "needle");
    expect(await useProjectSearchStore.getState().openHit(target, search().sources[target]!.hits[0]!)).toBe("opened");
    expect(useSessionStore.getState().imports.length).toBe(1);
    // The window shows over the import while it is focused on the passage...
    expect(markup()).toContain("<mark>needle</mark>");
    // ...and the session's own tabs return once the focus is let go of.
    await useSessionStore.getState().loadLatestSessionWindow();
    expect(markup()).toBe("TABS");
    expect(JSON.stringify(repository.listSessionImports(target))).toBe(importsBefore);
  });

  it("refuses a changed or missing source and leaves the active session alone", async () => {
    const target = session("t", lines(20, { 10: "needle" }), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const hit = search().sources[target]!.hits[0]!;
    const path = "/home/u/.claude/projects/-home-u-dev-infra/t.jsonl";
    fake.transcripts.get(path)!.records[10]!.content = "rewritten";
    expect(await useProjectSearchStore.getState().openHit(target, hit)).toBe("changed");
    expect(useSessionStore.getState().draft).toBeNull();
    expect(useProjectSearchStore.getState().openError).toMatchObject({ outcome: "changed" });
    fake.transcripts.delete(path);
    expect(await useProjectSearchStore.getState().openHit(target, hit)).toBe("missing");
    expect(useSessionStore.getState().draft).toBeNull();
  });

  it("an append does not invalidate an older result", async () => {
    const target = session("t", lines(20, { 5: "needle" }), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const hit = search().sources[target]!.hits[0]!;
    const file = fake.transcripts.get("/home/u/.claude/projects/-home-u-dev-infra/t.jsonl")!;
    file.records.push({ id: "t-new", content: "appended", start: 2000, end: 2100 });
    expect(await useProjectSearchStore.getState().openHit(target, hit)).toBe("opened");
    expect(view().focus?.messageId).toBe("t-m5");
  });

  it("only the last result clicked opens; an old click finishing late changes nothing", async () => {
    const a = session("a", lines(20, { 5: "needle in a" }), { contextId: "ctx-infra" });
    const b = session("b", lines(20, { 7: "needle in b" }), { contextId: "ctx-infra" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const held = deferred();
    fake.gate = ({ kind, path }) => (kind === "window" && path.endsWith("a.jsonl") ? held.promise : undefined);
    const first = useProjectSearchStore.getState().openHit(a, search().sources[a]!.hits[0]!);
    expect(await useProjectSearchStore.getState().openHit(b, search().sources[b]!.hits[0]!)).toBe("opened");
    held.release();
    expect(await first).toBe("superseded");
    expect(useSessionStore.getState().draft?.session.id).toBe(b);
    expect(view().focus?.messageId).toBe("b-m7");
  });

  it("a result still opening when the search moves to another project changes nothing", async () => {
    const a = session("a", lines(20, { 5: "needle" }), { contextId: "ctx-infra" });
    session("h", lines(5), { contextId: "ctx-home" });
    await useProjectSearchStore.getState().start(inventory(), "needle");
    const held = deferred();
    fake.gate = ({ kind }) => (kind === "window" ? held.promise : undefined);
    const opening = useProjectSearchStore.getState().openHit(a, search().sources[a]!.hits[0]!);
    fake.gate = null;
    await useProjectSearchStore.getState().start(inventory("ctx-home"), "anything");
    held.release();
    expect(await opening).toBe("superseded");
    expect(useSessionStore.getState().draft).toBeNull();
    expect(useSessionStore.getState().sessionWindow).toBeNull();
  });

  it("opens a session at its latest reply without importing it, and only if still wanted", async () => {
    const id = session("waiting", lines(12, { 11: "Gate 4 waits for you" }), { contextId: "ctx-infra" });
    const path = "/home/u/.claude/projects/-home-u-dev-infra/waiting.jsonl";
    expect(await useSessionStore.getState().openSessionAtLatestReply({ sessionId: id, sourcePath: path, stillWanted: () => false })).toBe("superseded");
    expect(useSessionStore.getState().draft).toBeNull();
    expect(await useSessionStore.getState().openSessionAtLatestReply({ sessionId: id, sourcePath: path, stillWanted: () => true })).toBe("opened");
    expect(view().focus).toMatchObject({ messageId: "waiting-m11", query: "" });
    expect(isAtLatest(view())).toBe(true);
    expect(repository.listSessionImports(id)).toEqual([]);
    fake.transcripts.delete(path);
    expect(await useSessionStore.getState().openSessionAtLatestReply({ sessionId: id, sourcePath: path, stillWanted: () => true })).toBe("missing");
  });

  describe("opening the passage a record was saved from", () => {
    async function savedPassage(name: string, contents: string[], index: number, selection?: string) {
      const id = session(name, contents, { contextId: "ctx-infra" });
      const path = `/home/u/.claude/projects/-home-u-dev-infra/${name}.jsonl`;
      const window = (await getClaudeCodeSessionWindowForTest(path))!;
      const message = window.events.find((event) => event.id === `${name}-m${index}`)!;
      const result = await buildPassageDraft({ sessionId: id, sourceId: window.sourceId, message, selection: selection === undefined ? undefined : { text: selection } });
      if (!("draft" in result)) throw new Error(result.refused);
      return { id, path, locator: result.draft.locator };
    }

    it("reads back to the saved record, checks its text, and focuses it without importing", async () => {
      const { id, locator } = await savedPassage("p", lines(6, { 4: "Decision: Candidate B" }), 4, "Candidate B");
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("opened");
      expect(useSessionStore.getState().draft?.session.id).toBe(id);
      expect(view().focus).toMatchObject({ messageId: "p-m4", query: "Candidate B", wholeWords: false, range: { from: locator.from, to: locator.to } });
      // Exactly the kept range is marked, even where the words repeat.
      expect(markup().match(/<mark>/g)?.length).toBe(1);
      expect(repository.listSessionImports(id)).toEqual([]);
    });

    it("says missing when the transcript is gone, without opening anything", async () => {
      const { path, locator } = await savedPassage("gone", lines(6, { 4: "keep me" }), 4);
      fake.transcripts.delete(path);
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("missing");
      expect(useSessionStore.getState().sessionWindow).toBeNull();
    });

    it("says missing when Mori no longer knows the session", async () => {
      const { locator } = await savedPassage("unknown", lines(6, { 4: "keep me" }), 4);
      expect(await useSessionStore.getState().openSessionAtPassage({ locator: { ...locator, sessionId: "auto-claude-nobody" }, stillWanted: () => true })).toBe("missing");
    });

    it("says changed when the record at that place no longer holds the saved text", async () => {
      const { path, locator } = await savedPassage("edit", lines(6, { 3: "original words" }), 3);
      const held = fake.transcripts.get(path)!;
      held.records[3] = { ...held.records[3]!, content: "rewritten words" };
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("changed");
      expect(useSessionStore.getState().sessionWindow).toBeNull();
    });

    it("says changed when the text at the saved range does not hash to the excerpt", async () => {
      const { locator } = await savedPassage("hash", lines(6, { 3: "original words" }), 3);
      const tampered = { ...locator, excerptHash: "0".repeat(64) };
      expect(await useSessionStore.getState().openSessionAtPassage({ locator: tampered, stillWanted: () => true })).toBe("changed");
    });

    it("says changed when the transcript was replaced by another", async () => {
      const { path, locator } = await savedPassage("swap", lines(6, { 3: "original words" }), 3);
      fake.transcripts.get(path)!.sourceId = "src-other";
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("changed");
    });

    it("says changed when another record now ends at that place", async () => {
      const { locator } = await savedPassage("other", lines(6, { 3: "original words" }), 3);
      expect(await useSessionStore.getState().openSessionAtPassage({ locator: { ...locator, messageId: "other-m9" }, stillWanted: () => true })).toBe("changed");
    });

    describe("with anchors that cover only a record's head, as real ones do", () => {
      beforeEach(() => {
        fake.headAnchors = true;
      });
      afterEach(() => {
        fake.headAnchors = false;
      });

      it("says changed when the saved text was rewritten in place (the excerpt hash decides)", async () => {
        const { path, locator } = await savedPassage("headedit", lines(6, { 3: "original words" }), 3);
        const held = fake.transcripts.get(path)!;
        held.records[3] = { ...held.records[3]!, content: "rewritten words" };
        expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("changed");
      });

      it("says changed when the record now starts elsewhere though it ends at the same place", async () => {
        const { path, locator } = await savedPassage("headstart", lines(6, { 3: "original words" }), 3);
        const held = fake.transcripts.get(path)!;
        // The record before it shrank: the saved record begins earlier, with
        // the same id, the same text and the same end. Only its start differs.
        held.records[2] = { ...held.records[2]!, end: held.records[2]!.end - 10 };
        held.records[3] = { ...held.records[3]!, start: held.records[3]!.start - 10 };
        expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("changed");
      });

      it("opens a passage after the transcript grew past it", async () => {
        const { path, locator } = await savedPassage("headgrow", lines(6, { 3: "original words" }), 3);
        const held = fake.transcripts.get(path)!;
        const last = held.records[held.records.length - 1]!;
        held.records.push({ id: "headgrow-m6", content: "later turn", start: last.end, end: last.end + RECORD });
        expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("opened");
        expect(view().focus).toMatchObject({ messageId: "headgrow-m3" });
      });

      it("marks exactly a Korean selection, where the phrase repeats", async () => {
        const text = "결정: 후보 B로 간다. 다시 말해 후보 B가 맞다.";
        const { locator } = await savedPassage("headko", lines(6, { 3: text }), 3, "후보 B가");
        expect(text.slice(locator.from, locator.to)).toBe("후보 B가");
        expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("opened");
        expect(markup().match(/<mark>/g)?.length).toBe(1);
        expect(markup()).toContain("<mark>후보 B가</mark>");
      });

      it("still opens an unchanged passage", async () => {
        const { locator } = await savedPassage("headsame", lines(6, { 3: "original words" }), 3);
        expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("opened");
      });
    });

    it("re-checks a redacted passage after the same redaction", async () => {
      const secret = "token ghp_abcdefghijklmnopqrstuvwxyz0123456789 here";
      const { locator } = await savedPassage("red", lines(6, { 4: secret }), 4);
      const keptHash = await sha256Hex(redactText(secret).redacted);
      const redacted = { ...locator, excerptHash: keptHash, redacted: true as const };
      expect(await useSessionStore.getState().openSessionAtPassage({ locator: redacted, stillWanted: () => true })).toBe("opened");
      expect(await useSessionStore.getState().openSessionAtPassage({ locator: { ...redacted, redacted: undefined }, stillWanted: () => true })).toBe("changed");
    });

    it("opens a passage from the kept copy when the file at the path is another conversation", async () => {
      const { id, path, locator } = await savedPassage("swapkept", lines(6, { 4: "Decision: Candidate B" }), 4, "Candidate B");
      const archivePath = `/home/u/Mori/Records/archives/claude-code/${"c".repeat(64)}.jsonl`;
      const original = fake.transcripts.get(path)!;
      fake.transcripts.set(archivePath, { ...original, records: [...original.records] });
      fake.transcripts.get(path)!.sourceId = "src-another";
      fake.archives.set(id, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 600 }, sourceId: locator.sourceId });
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("opened");
      expect(view().archive).toMatchObject({ replacedOriginal: true });
      expect(view().sourcePath).toBe(archivePath);
    });

    it("refuses a kept copy that is gone or no longer the file kept", async () => {
      const { id, path, locator } = await savedPassage("bad", lines(6, { 4: "Decision: Candidate B" }), 4, "Candidate B");
      const archivePath = `/home/u/Mori/Records/archives/claude-code/${"b".repeat(64)}.jsonl`;
      fake.transcripts.set(archivePath, fake.transcripts.get(path)!);
      fake.transcripts.delete(path);
      for (const integrity of ["damaged", "missing"]) {
        fake.archives.set(id, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 600 }, integrity });
        expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("missing");
      }
    });

    it("opens a kept copy when the original is gone, verified the same way, and says so", async () => {
      const { id, path, locator } = await savedPassage("kept", lines(6, { 4: "Decision: Candidate B" }), 4, "Candidate B");
      const archivePath = `/home/u/Mori/Records/archives/claude-code/${"a".repeat(64)}.jsonl`;
      fake.transcripts.set(archivePath, fake.transcripts.get(path)!);
      fake.transcripts.delete(path);
      fake.archives.set(id, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 600 } });
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("opened");
      expect(view().archive).toEqual({ archivedAt: "2026-10-09T10:00:00.000Z", bytes: 600 });
      expect(view().sourcePath).toBe(archivePath);
      expect(markup()).toContain("보관한 원본");
    });

    it("keeps saying 보관한 원본 after 최신 대화로", async () => {
      const { id, path, locator } = await savedPassage("keptlatest", lines(9, { 7: "Decision: Candidate B" }), 7, "Candidate B");
      const archivePath = `/home/u/Mori/Records/archives/claude-code/${"d".repeat(64)}.jsonl`;
      fake.transcripts.set(archivePath, fake.transcripts.get(path)!);
      fake.transcripts.delete(path);
      fake.archives.set(id, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 900 } });
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("opened");
      await useSessionStore.getState().loadLatestSessionWindow();
      expect(view().focus).toBeNull();
      expect(view().archive?.archivedAt).toBe("2026-10-09T10:00:00.000Z");
      expect(markup()).toContain("보관한 원본");
    });

    it("says missing for a passage written after the kept copy was taken", async () => {
      const { id, path, locator } = await savedPassage("toolate", lines(6, { 5: "said later" }), 5);
      const archivePath = `/home/u/Mori/Records/archives/claude-code/${"e".repeat(64)}.jsonl`;
      const original = fake.transcripts.get(path)!;
      fake.transcripts.set(archivePath, { ...original, records: original.records.slice(0, 3) });
      fake.transcripts.delete(path);
      fake.archives.set(id, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 300 } });
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("missing");
    });

    it("never reads the kept copy when the original exists but cannot be read just now", async () => {
      const { id, path, locator } = await savedPassage("locked", lines(6, { 4: "keep me" }), 4);
      const archivePath = `/home/u/Mori/Records/archives/claude-code/${"f".repeat(64)}.jsonl`;
      fake.transcripts.set(archivePath, fake.transcripts.get(path)!);
      fake.archives.set(id, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 600 } });
      fake.gate = ({ path: read }) => {
        if (read === path) throw new Error("SOURCE_UNREADABLE: Failed to open: permission denied");
      };
      // Not "gone": the page must not say the original no longer exists.
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("failed");
      expect(fake.calls.some((call) => call.path === archivePath)).toBe(false);
    });

    it("still says missing when neither the original nor a kept copy exists", async () => {
      const { path, locator } = await savedPassage("none", lines(6, { 4: "keep me" }), 4);
      fake.transcripts.delete(path);
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("missing");
    });

    it("refuses a kept copy that does not hold the saved text", async () => {
      const { id, path, locator } = await savedPassage("wrongcopy", lines(6, { 4: "original words" }), 4);
      const archivePath = `/home/u/Mori/Records/archives/claude-code/${"b".repeat(64)}.jsonl`;
      const original = fake.transcripts.get(path)!;
      fake.transcripts.set(archivePath, { ...original, records: original.records.map((r, i) => (i === 4 ? { ...r, content: "other words" } : r)) });
      fake.transcripts.delete(path);
      fake.archives.set(id, { path: archivePath, archive: { archivedAt: "2026-10-09T10:00:00.000Z", bytes: 600 } });
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => true })).toBe("changed");
    });

    it("changes nothing when the user moved on", async () => {
      const { locator } = await savedPassage("late", lines(6, { 3: "original words" }), 3);
      expect(await useSessionStore.getState().openSessionAtPassage({ locator, stillWanted: () => false })).toBe("superseded");
      expect(useSessionStore.getState().draft).toBeNull();
    });
  });

  it("searching and opening results write nothing durable beyond the active-session pointer", async () => {
    const target = session("t", lines(20, { 5: "needle" }), { contextId: "ctx-infra" });
    const drafts = JSON.stringify(repository.listStoredSessions());
    const recordsBefore = JSON.stringify(records);
    await useProjectSearchStore.getState().start(inventory(), "needle");
    await useProjectSearchStore.getState().openHit(target, search().sources[target]!.hits[0]!);
    expect(JSON.stringify(repository.listStoredSessions())).toBe(drafts);
    expect(JSON.stringify(records)).toBe(recordsBefore);
    expect(repository.listSessionImports(target)).toEqual([]);
  });
});
