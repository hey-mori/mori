/**
 * Reopening an auto-discovered session must not store its transcript again
 * (#167). Before the fix, every open built an import whose id carried the
 * capture time, so returning to a session added another full copy.
 *
 * These tests drive the store and the shared resolver as the UI does, with the
 * native readers stubbed at the IPC boundary and a real browser repository
 * underneath, so what they count is what storage holds.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWorkSessionMeta } from "../lib/trace/sources/ai/workSessions";
import type { ClaudeMessage } from "../lib/claude/types";

const reader = vi.hoisted(() => ({ detail: vi.fn(), meta: new Map<string, unknown>() }));

vi.mock("../lib/desktop/llmEndpointRegistry", () => ({ syncLlmAllowedEndpoints: () => {} }));
vi.mock("../lib/trace/sources/ai/workSessions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAgentWorkSession: (meta: unknown) => reader.detail(meta),
  listAllAgentWorkSessions: async () => [],
}));
/** Accepted project memory as its own store holds it. On desktop that is
 *  SQLite, never the app-storage repository these tests run over. */
const acceptedStore = vi.hoisted(() => ({ list: null as null | (() => Promise<unknown>) }));
vi.mock("../lib/project-memory/acceptedMemoryRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/project-memory/acceptedMemoryRepository")>();
  class StoreBacked extends actual.AcceptedMemoryRepository {
    override async listAllAcceptedProjectMemories() {
      return acceptedStore.list ? ((await acceptedStore.list()) as never) : super.listAllAcceptedProjectMemories();
    }
  }
  return { ...actual, AcceptedMemoryRepository: StoreBacked };
});
vi.mock("../lib/session/autoImportMetaStore", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAutoImportMeta: (id: string) => reader.meta.get(id) ?? null,
}));

import { setSessionRepositoryForTesting, useSessionStore } from "./sessionStore";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import { agentSessionToStoredDraft, autoImportedSessionId, autoImportedProjectId } from "../lib/session/autoImportSessions";
import { useSessionResolver, type SessionOpenOutcome } from "../features/session/useSessionResolver";
import { buildPrimaryImportCandidateFromAgentWorkSession } from "../lib/import/agentWorkSessionImport";
import { normalizeManualNote } from "../lib/import";
import { mockSession } from "../domain/mock-data";

function meta(id: string, title: string, agent: "claude" | "codex" = "claude"): AgentWorkSessionMeta {
  return {
    agentId: agent,
    agentName: agent === "claude" ? "Claude Code" : "Codex",
    importKind: agent === "claude" ? "claude-code" : "codex-session",
    id,
    sessionId: id,
    projectPath: "/home/u/dev/infra",
    projectName: "infra",
    filePath: `/x/${id}.jsonl`,
    sourceFilePath: `/x/${id}.jsonl`,
    startedAt: "2026-10-08T09:00:00Z",
    updatedAt: "2026-10-08T09:00:00Z",
    messageCount: 4,
    title,
  };
}

/** A transcript of `turns` question/answer turns, one minute apart. */
function transcript(turns: number, openLast = false): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];
  for (let index = 0; index < turns; index += 1) {
    const minute = String(index).padStart(2, "0");
    messages.push({ id: `u${index}`, role: "human", content: `question ${index}`, createdAt: `2026-10-08T09:${minute}:00Z` });
    if (!(openLast && index === turns - 1)) {
      messages.push({ id: `a${index}`, role: "assistant", content: `answer ${index}`, createdAt: `2026-10-08T09:${minute}:30Z` });
    }
  }
  return messages;
}

function detail(m: AgentWorkSessionMeta, messages: ClaudeMessage[]) {
  return m.importKind === "claude-code"
    ? { ...m, messages, claudeDetail: { ...m, filePath: m.sourceFilePath, messages } }
    : { ...m, messages };
}

let repository: BrowserDraftRepository;
let storage: MemoryKeyValueStorage;
/** What each session's transcript currently is, as the reader would return it. */
const sources = new Map<string, ClaudeMessage[]>();

function register(m: AgentWorkSessionMeta, messages: ClaudeMessage[]): string {
  const id = autoImportedSessionId(m);
  reader.meta.set(id, m);
  sources.set(m.id, messages);
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

/** Storage keys holding imports of a session: what #167 counted. */
function importKeys(sessionId: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(`mori.sessionImportEntry.${sessionId}.`)) keys.push(key);
  }
  return keys.sort();
}
const eventCount = (sessionId: string) =>
  repository.listSessionImports(sessionId).reduce((sum, entry) => sum + entry.events.length, 0);

/** Restart: a fresh store over the same persisted storage. */
function restart() {
  useSessionStore.setState({ initialized: true, draft: null, imports: [], sessionWindow: null, source: "browser-draft" });
}

let clock = Date.parse("2026-10-08T12:00:00Z");
beforeEach(() => {
  storage = new MemoryKeyValueStorage();
  repository = new BrowserDraftRepository(storage);
  setSessionRepositoryForTesting(repository);
  restart();
  reader.detail.mockReset();
  reader.meta.clear();
  acceptedStore.list = null;
  sources.clear();
  // Each read is a different capture time, as in the app.
  vi.useFakeTimers({ toFake: ["Date"] });
  clock = Date.parse("2026-10-08T12:00:00Z");
  vi.setSystemTime(clock);
  reader.detail.mockImplementation(async (m: AgentWorkSessionMeta) => {
    clock += 61_000;
    vi.setSystemTime(clock);
    return detail(m, sources.get(m.id)!);
  });
});

afterEach(() => {
  vi.useRealTimers();
  setSessionRepositoryForTesting(null);
});

describe("reopening a small auto-imported session (#167)", () => {
  it("I1 · the first open stores exactly one import", async () => {
    const a = register(meta("a", "A"), transcript(3));
    expect(await resolver()(a)).toBe("opened");
    expect(importKeys(a)).toHaveLength(1);
    expect(eventCount(a)).toBe(3);
  });

  it("I2 / I4 / I5 · reopening after visiting another session, twenty times, stores nothing more", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const b = register(meta("b", "B"), transcript(2));
    const resolve = resolver();
    await resolve(a);
    const [key] = importKeys(a);
    const savedAt = repository.listSessionImports(a)[0]!.savedAt;
    for (let round = 0; round < 20; round += 1) {
      await resolve(b);
      await resolve(a);
    }
    expect(importKeys(a)).toEqual([key]);
    expect(eventCount(a)).toBe(3);
    expect(importKeys(b)).toHaveLength(1);
    // Reopening is not a write: the import keeps its time.
    expect(repository.listSessionImports(a)[0]!.savedAt).toBe(savedAt);
    expect(reader.detail.mock.calls.length).toBeGreaterThan(20);
  });

  it("I3 · after a restart the reopen stores nothing more", async () => {
    const a = register(meta("a", "A"), transcript(3));
    await resolver()(a);
    restart();
    await resolver()(a);
    expect(importKeys(a)).toHaveLength(1);
    expect(eventCount(a)).toBe(3);
  });

  it("I8 · an import stored by an older build is recognised, not copied", async () => {
    const m = meta("a", "A");
    const a = register(m, transcript(3));
    // What the old code stored: same source, an older capture time in its id.
    const legacy = buildPrimaryImportCandidateFromAgentWorkSession(detail(m, transcript(3)) as never, {
      projectId: autoImportedProjectId(m),
      sessionId: a,
      capturedAt: "2026-10-01T08:00:00.000Z",
    });
    repository.addSessionImport(a, legacy);
    const before = importKeys(a);
    await resolver()(a);
    expect(importKeys(a)).toEqual(before);
  });

  it("I9 · copies an older build already stored are neither multiplied nor removed", async () => {
    const m = meta("a", "A");
    const a = register(m, transcript(3));
    for (const capturedAt of ["2026-10-01T08:00:00.000Z", "2026-10-02T08:00:00.000Z"]) {
      repository.addSessionImport(
        a,
        buildPrimaryImportCandidateFromAgentWorkSession(detail(m, transcript(3)) as never, {
          projectId: autoImportedProjectId(m),
          sessionId: a,
          capturedAt,
        }),
      );
    }
    const before = JSON.stringify(repository.listSessionImports(a));
    sources.set("a", transcript(5));
    await resolver()(a);
    expect(importKeys(a)).toHaveLength(2);
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(before);
  });

  it("I10 · another source in the session is neither mistaken for the transcript nor touched", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    await resolve(a);
    const note = normalizeManualNote({ projectId: "p", sessionId: a, title: "메모", note: "따로 적은 메모", capturedAt: "2026-10-08T11:00:00Z" });
    useSessionStore.getState().addImport(note);
    const noteBefore = JSON.stringify(repository.listSessionImports(a).find((entry) => entry.source.kind !== "claudeTranscript"));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    expect(importKeys(a)).toHaveLength(2);
    expect(JSON.stringify(repository.listSessionImports(a).find((entry) => entry.source.kind !== "claudeTranscript"))).toBe(noteBefore);
  });

  it("I6 / I7 · different agents or different conversations with the same title stay separate", async () => {
    const resolve = resolver();
    const a = register(meta("same-id", "Same title"), transcript(2));
    const c = register(meta("same-id", "Same title", "codex"), transcript(2));
    const d = register(meta("other-id", "Same title"), transcript(2));
    for (const id of [a, c, d]) await resolve(id);
    for (const id of [a, c, d]) await resolve(id);
    for (const id of [a, c, d]) expect(importKeys(id)).toHaveLength(1);
    expect(new Set([a, c, d]).size).toBe(3);
  });
});

describe("a transcript that changed since it was imported", () => {
  it("I12 · new turns are appended to the same import, under its own id", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    await resolve(a);
    const [key] = importKeys(a);
    const sourceId = repository.listSessionImports(a)[0]!.source.id;
    sources.set("a", transcript(5));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    expect(importKeys(a)).toEqual([key]);
    const stored = repository.listSessionImports(a)[0]!;
    expect(stored.events).toHaveLength(5);
    expect(stored.events.every((event) => event.sourceRefs.includes(sourceId))).toBe(true);
    expect(stored.source.relatedEventIds).toHaveLength(5);
  });

  it("a prompt answered since the import takes its answer", async () => {
    const a = register(meta("a", "A"), transcript(2, true));
    const resolve = resolver();
    await resolve(a);
    const before = repository.listSessionImports(a)[0]!.events[1]!;
    sources.set("a", transcript(2));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    const stored = repository.listSessionImports(a);
    expect(stored).toHaveLength(1);
    const after = stored[0]!.events[1]!;
    // The same turn, now dated by its reply: a new id, the reply's text.
    expect(after.turnIndex).toBe(before.turnIndex);
    expect(after.id).not.toBe(before.id);
    expect(after.summary).not.toBe(before.summary);
    expect(stored[0]!.events).toHaveLength(2);
    expect(stored[0]!.source.relatedEventIds).toEqual(stored[0]!.events.map((event) => event.id));
  });

  it("a session opened mid tool loop takes the reply to its tool result", async () => {
    const working: ClaudeMessage[] = [
      { id: "u0", role: "human", content: "run the tests", createdAt: "2026-10-08T09:00:00Z" },
      { id: "a0", role: "assistant", content: "🔧 Bash: npm test", createdAt: "2026-10-08T09:00:10Z" },
      { id: "u1", role: "human", content: "↳ 도구 결과 all passed", createdAt: "2026-10-08T09:00:20Z" },
    ];
    const a = register(meta("a", "A"), working);
    const resolve = resolver();
    await resolve(a);
    const before = repository.listSessionImports(a)[0]!.events;
    sources.set("a", [...working, { id: "a1", role: "assistant", content: "All tests pass.", createdAt: "2026-10-08T09:00:30Z" }]);
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    const after = repository.listSessionImports(a)[0]!.events;
    // Growth, not a rewrite: the tool-result turn now carries its reply.
    expect(after).toHaveLength(before.length);
    expect(after[after.length - 1]!.summary).toContain("All tests pass.");
    expect(useSessionStore.getState().divergedSourceSessionId).toBeNull();
  });

  it("an analysis that pointed at the unanswered prompt follows it to the answered turn", async () => {
    const a = register(meta("a", "A"), transcript(2, true));
    const resolve = resolver();
    await resolve(a);
    const prompt = repository.listSessionImports(a)[0]!.events[1]!;
    repository.saveSessionAnalysis(a, {
      runId: "run-1",
      providerName: "deterministic-heuristic-v1",
      providerLabel: "Deterministic",
      sessionId: a,
      projectId: "p",
      generatedAt: "2026-10-08T11:00:00.000Z",
      durationMs: 1,
      inputEventCount: 2,
      inputSourceCount: 1,
      summary: { sessionSummary: "", resumePrompt: "", highlights: [] },
      issues: [{ ...mockSession.issues[0]!, id: "iss-1", sourceEventIds: [prompt.id] }],
      decisions: [],
      relationships: [],
      nextActions: [],
      rendered: { summary: { id: "s", sessionId: a, sessionSummary: "", resumePrompt: "", reportMarkdown: "", nextActionIds: [], generatedAt: "2026-10-08T11:00:00.000Z" } },
      confidence: 0.5,
      notes: [],
    } as never);
    sources.set("a", transcript(2));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    const answered = repository.listSessionImports(a)[0]!.events[1]!;
    expect(answered.id).not.toBe(prompt.id);
    expect(repository.loadSessionAnalysis(a)?.result.issues[0]!.sourceEventIds).toEqual([answered.id]);
  });

  it("I11 · an event the user edited keeps the edit while new turns arrive", async () => {
    const a = register(meta("a", "A"), transcript(2, true));
    const resolve = resolver();
    await resolve(a);
    const edited = repository.listSessionImports(a)[0]!.events[1]!;
    expect(useSessionStore.getState().updateSessionEvent(edited.id, { title: "내가 고친 제목" })).toBe(true);
    sources.set("a", transcript(4));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    const events = repository.listSessionImports(a)[0]!.events;
    expect(events).toHaveLength(4);
    const kept = events.find((event) => event.id === edited.id)!;
    expect(kept.title).toBe("내가 고친 제목");
    expect(kept.userModified).toBe(true);
    expect(kept.summary).toBe(edited.summary);
  });

  it("I11 · an edit to a completed turn survives the refresh that brings new turns", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    await resolve(a);
    const first = repository.listSessionImports(a)[0]!.events[0]!;
    expect(useSessionStore.getState().updateSessionEvent(first.id, { title: "내가 고친 제목", summary: "내 요약" })).toBe(true);
    sources.set("a", transcript(4));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    const events = repository.listSessionImports(a)[0]!.events;
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ id: first.id, title: "내가 고친 제목", summary: "내 요약", userModified: true });
  });

  it("a rewritten transcript leaves the stored import as it is and adds no copy", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    await resolve(a);
    const before = JSON.stringify(repository.listSessionImports(a));
    // Same session, different history (earlier turns now carry other times).
    sources.set(
      "a",
      transcript(3).map((message) => ({ ...message, createdAt: message.createdAt.replace("09:", "10:") })),
    );
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(before);
  });
});

/** A minimal analysis whose one issue cites `eventId`. */
function analysisCiting(sessionId: string, eventId: string) {
  return {
    runId: "run-1",
    providerName: "deterministic-heuristic-v1",
    providerLabel: "Deterministic",
    sessionId,
    projectId: "p",
    generatedAt: "2026-10-08T11:00:00.000Z",
    durationMs: 1,
    inputEventCount: 2,
    inputSourceCount: 1,
    summary: { sessionSummary: "", resumePrompt: "", highlights: [] },
    issues: [{ ...mockSession.issues[0]!, id: "iss-1", sourceEventIds: [eventId] }],
    decisions: [],
    relationships: [],
    nextActions: [],
    rendered: { summary: { id: "s", sessionId, sessionSummary: "", resumePrompt: "", reportMarkdown: "", nextActionIds: [], generatedAt: "2026-10-08T11:00:00.000Z" } },
    confidence: 0.5,
    notes: [],
  } as never;
}

describe("release review · what an answered prompt must keep", () => {
  async function openAnsweredLater(setup: (sessionId: string, promptId: string) => void) {
    const a = register(meta("a", "A"), transcript(2, true));
    const resolve = resolver();
    await resolve(a);
    const prompt = repository.listSessionImports(a)[0]!.events[1]!;
    setup(a, prompt.id);
    sources.set("a", transcript(3));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    return { a, prompt, events: repository.listSessionImports(a)[0]!.events };
  }

  it("a note on a waiting prompt survives its answer (a note does not set userModified)", async () => {
    const { prompt, events } = await openAnsweredLater(() => {
      const id = repository.listSessionImports(useSessionStore.getState().draft!.session.id)[0]!.events[1]!.id;
      expect(useSessionStore.getState().updateSessionEvent(id, { note: "다시 볼 것" })).toBe(true);
    });
    const answered = events[1]!;
    expect(prompt.userModified).toBe(false);
    expect(answered.userModified).toBe(false);
    expect(answered.userNote).toBe("다시 볼 것");
    expect(answered.summary).not.toBe(prompt.summary);
    expect(events).toHaveLength(3);
  });

  it("links, artifacts and extra source references on a waiting prompt survive its answer", async () => {
    const { events } = await openAnsweredLater((sessionId) => {
      const [entry] = repository.listSessionImports(sessionId);
      const linked = entry!.events.map((event, index) =>
        index === 1
          ? { ...event, linkedIssueIds: ["iss-9"], linkedDecisionIds: ["dec-9"], relationshipIds: ["rel-9"], artifactIds: ["art-9"], sourceRefs: [...event.sourceRefs, "src-extra"] }
          : event,
      );
      repository.putSessionImports(sessionId, [{ ...entry!, events: linked }]);
      useSessionStore.setState({ imports: repository.listSessionImports(sessionId) });
    });
    expect(events[1]).toMatchObject({
      linkedIssueIds: ["iss-9"],
      linkedDecisionIds: ["dec-9"],
      relationshipIds: ["rel-9"],
      artifactIds: ["art-9"],
    });
    expect(events[1]!.sourceRefs).toContain("src-extra");
  });

  it("a prompt cited by accepted project memory keeps its id, so the citation never dangles", async () => {
    const { prompt, events } = await openAnsweredLater((sessionId, promptId) => {
      repository.saveAcceptedProjectMemory({
        id: "mem-1",
        projectId: "p",
        evidenceRefs: [{ kind: "event", sessionId, eventId: promptId }],
      } as never);
    });
    expect(events[1]!.id).toBe(prompt.id);
    expect(events[1]!.summary).not.toBe(prompt.summary);
    expect(events).toHaveLength(3);
  });

  it("a prompt cited by accepted memory held only in SQLite keeps its id (desktop)", async () => {
    // Desktop writes accepted memory to SQLite alone; app storage has none.
    const { prompt, events } = await openAnsweredLater((sessionId, promptId) => {
      acceptedStore.list = async () => ({
        data: [{ id: "mem-1", projectId: "p", evidenceRefs: [{ kind: "event", sessionId, eventId: promptId }] }],
        source: "desktop-sqlite",
        fellBack: false,
      });
    });
    expect(repository.listAllAcceptedProjectMemories()).toHaveLength(0);
    // Same id, so the citation lands; the turn now carries its reply.
    expect(events[1]!.id).toBe(prompt.id);
    expect(events[1]!.actor).not.toBe("user");
    expect(events[1]!.summary).not.toBe(prompt.summary);
    expect(events).toHaveLength(3);
  });

  it("a cited prompt kept as stored does not freeze the import when the session grows again", async () => {
    const { a, prompt } = await openAnsweredLater((sessionId, promptId) => {
      acceptedStore.list = async () => ({
        data: [{ id: "mem-1", projectId: "p", evidenceRefs: [{ kind: "event", sessionId, eventId: promptId }] }],
        source: "desktop-sqlite",
        fellBack: false,
      });
    });
    sources.set("a", transcript(5));
    const resolve = resolver();
    await resolve(register(meta("c", "C"), transcript(1)));
    await resolve(a);
    const events = repository.listSessionImports(a)[0]!.events;
    expect(events[1]!.id).toBe(prompt.id);
    expect(events).toHaveLength(5);
    expect(useSessionStore.getState().divergedSourceSessionId).toBeNull();
    // A third read of the same transcript changes nothing.
    const settled = JSON.stringify(repository.listSessionImports(a));
    await resolve(register(meta("d", "D"), transcript(1)));
    await resolve(a);
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(settled);
  });

  it("when accepted memory cannot be read from its store, nothing is renamed", async () => {
    const { prompt, events } = await openAnsweredLater(() => {
      acceptedStore.list = async () => ({ data: [], source: "browser-local-storage", fellBack: true });
    });
    expect(events[1]!.id).toBe(prompt.id);
    expect(events).toHaveLength(3);
  });

  it("a prompt cited by an analysis run that is not adopted keeps its id", async () => {
    const { prompt, events, a } = await openAnsweredLater((sessionId, promptId) => {
      repository.saveSessionAnalysis(sessionId, analysisCiting(sessionId, promptId));
      repository.saveSessionAnalysis(sessionId, { ...(analysisCiting(sessionId, "evt-other") as object), runId: "run-2" } as never);
    });
    const history = repository.loadSessionAnalysisHistory(a)!.history;
    expect(history.currentRunId).toBe("run-2");
    expect(events.some((event) => event.id === prompt.id)).toBe(true);
  });

  it("an uncited answered prompt still takes its new id", async () => {
    const { prompt, events } = await openAnsweredLater(() => {
      acceptedStore.list = async () => ({ data: [], source: "desktop-sqlite", fellBack: false });
    });
    expect(events[1]!.id).not.toBe(prompt.id);
  });

  it("a failed analysis write puts the import back, so nothing half-applied stays", async () => {
    const a = register(meta("a", "A"), transcript(2, true));
    const resolve = resolver();
    await resolve(a);
    const prompt = repository.listSessionImports(a)[0]!.events[1]!;
    repository.saveSessionAnalysis(a, analysisCiting(a, prompt.id));
    const importBefore = JSON.stringify(repository.listSessionImports(a));
    const analysisBefore = JSON.stringify(repository.loadSessionAnalysis(a)?.result);
    sources.set("a", transcript(3));
    await resolve(register(meta("b", "B"), transcript(1)));
    const memoryWrite = vi.spyOn(repository, "saveSessionMemoryBody").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await resolve(a);
    memoryWrite.mockRestore();
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(importBefore);
    expect(JSON.stringify(repository.loadSessionAnalysis(a)?.result)).toBe(analysisBefore);
  });
});

describe("release review · rewrites the ids do not show", () => {
  it("same event ids with different text are kept as stored, not refreshed", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    await resolve(a);
    const before = JSON.stringify(repository.listSessionImports(a));
    // Rewritten in place and grown: new turns must not be spliced onto it.
    sources.set("a", transcript(5).map((message) => ({ ...message, content: `${message.content} (rewritten)` })));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(before);
  });

  it("a truncated transcript is kept as stored", async () => {
    const a = register(meta("a", "A"), transcript(4));
    const resolve = resolver();
    await resolve(a);
    const before = JSON.stringify(repository.listSessionImports(a));
    sources.set("a", transcript(2));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(before);
  });

  it("a rewritten last turn is not taken for an answered prompt", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    await resolve(a);
    const before = JSON.stringify(repository.listSessionImports(a));
    // The last turn now carries a later reply time and other text: not a prompt that got its answer.
    sources.set("a", transcript(3).map((message, index, all) => (index === all.length - 1 ? { ...message, content: "other", createdAt: "2026-10-08T09:59:00Z" } : message)));
    await resolve(register(meta("b", "B"), transcript(1)));
    await resolve(a);
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(before);
  });
});

describe("reopen failures and races", () => {
  it("I13 · a transcript that has gone keeps what was imported", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    await resolve(a);
    const before = JSON.stringify(repository.listSessionImports(a));
    reader.detail.mockRejectedValueOnce(new Error("SOURCE_MISSING: gone"));
    await resolve(register(meta("b", "B"), transcript(1)));
    reader.detail.mockRejectedValueOnce(new Error("SOURCE_MISSING: gone"));
    await resolve(a);
    expect(JSON.stringify(repository.listSessionImports(a))).toBe(before);
  });

  it("I16 · a failed write is not reported as an import", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const write = vi.spyOn(repository, "addSessionImport").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await resolver()(a);
    write.mockRestore();
    expect(importKeys(a)).toHaveLength(0);
    expect(useSessionStore.getState().sessionWindow).toMatchObject({ status: "error" });
  });

  it("I15 · overlapping opens of the same session store one import", async () => {
    const a = register(meta("a", "A"), transcript(3));
    const resolve = resolver();
    useSessionStore.setState({ draft: null });
    await Promise.all([resolve(a), resolve(a), resolve(a)]);
    expect(importKeys(a)).toHaveLength(1);
  });
});
