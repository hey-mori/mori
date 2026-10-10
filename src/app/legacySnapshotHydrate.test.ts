/**
 * A legacy SQLite session snapshot (written only by older builds) must never
 * replace the imports this build stored for the current session at launch:
 * replacing cleared them and re-added only the snapshot's, older events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/desktop/llmEndpointRegistry", () => ({ syncLlmAllowedEndpoints: () => {} }));

import { setSessionRepositoryForTesting, useSessionStore } from "./sessionStore";
import { setSessionPersistenceServiceForTesting } from "../lib/storage/sessionPersistenceService";
import { BrowserDraftRepository } from "../lib/storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../lib/storage/memoryStorage";
import { mockSession } from "../domain/mock-data";

let repository: BrowserDraftRepository;

/** The store keeps the first persistence service it sees: one fake, whose
 *  snapshot each test sets. */
let snapshotEvents: typeof mockSession.events = [];
const service = {
  isDesktop: () => true,
  loadSessionFromDesktop: vi.fn(async () => legacySnapshot(snapshotEvents)),
};

function legacySnapshot(events: typeof mockSession.events) {
  const source = { ...mockSession.sources[0]!, relatedEventIds: events.map((event) => event.id) };
  return {
      session: mockSession,
      draft: { project: mockSession.project, session: { ...mockSession.session, title: "old title" }, savedAt: "2026-01-01T00:00:00Z", adapter: "browser-local-storage" },
      imports: [{ id: source.id, sessionId: mockSession.session.id, source, events, savedAt: "2026-01-01T00:00:00Z", adapter: "browser-local-storage" }],
  };
}

beforeEach(() => {
  repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
  setSessionRepositoryForTesting(repository);
  setSessionPersistenceServiceForTesting(service as never);
  useSessionStore.setState({ initialized: false, draft: null, imports: [] });
});

afterEach(() => {
  setSessionRepositoryForTesting(null);
});

describe("launch with a legacy SQLite snapshot", () => {
  it("keeps the stored imports and their ids; the snapshot does not replace them", async () => {
    const sessionId = mockSession.session.id;
    repository.saveCurrentSessionDraft({ project: mockSession.project, session: mockSession.session });
    const stored = repository.addSessionImport(sessionId, { source: mockSession.sources[0]!, events: mockSession.events.slice(0, 3) });
    snapshotEvents = mockSession.events.slice(0, 1);
    await useSessionStore.getState().hydrate();
    const after = repository.listSessionImports(sessionId);
    expect(after.map((entry) => entry.events.map((event) => event.id))).toEqual([stored.events.map((event) => event.id)]);
    expect(useSessionStore.getState().draft!.session.title).toBe(mockSession.session.title);
  });

  it("still fills in a session whose imports are not stored here", async () => {
    const sessionId = mockSession.session.id;
    repository.saveCurrentSessionDraft({ project: mockSession.project, session: mockSession.session });
    snapshotEvents = mockSession.events.slice(0, 2);
    await useSessionStore.getState().hydrate();
    expect(repository.listSessionImports(sessionId)[0]!.events).toHaveLength(2);
    expect(useSessionStore.getState().source).toBe("desktop-sqlite");
  });
});
