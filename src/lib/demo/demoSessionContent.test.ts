import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDemoSessionContent,
  hasDemoSessionContent,
} from "./demoSessionContent";
import { DEMO_SESSION_SUMMARIES } from "./demoSessionFixtures";
import {
  selectSessionMode,
  selectSessionView,
  setSessionPersistenceServiceForSessionStore,
  setSessionRepositoryForTesting,
  useSessionStore,
} from "../../app/sessionStore";
import { BrowserDraftRepository } from "../storage/localStorageAdapter";
import { MemoryKeyValueStorage } from "../storage/memoryStorage";
import { SessionPersistenceService } from "../storage/sessionPersistenceService";

describe("buildDemoSessionContent", () => {
  it("returns null for an id that is not a bundled demo session", () => {
    expect(buildDemoSessionContent("sess-real-123")).toBeNull();
    expect(buildDemoSessionContent("missing-session")).toBeNull();
  });

  it("has authored content for every demo summary id", () => {
    for (const summary of DEMO_SESSION_SUMMARIES) {
      expect(hasDemoSessionContent(summary.sessionId)).toBe(true);
      expect(buildDemoSessionContent(summary.sessionId)).not.toBeNull();
    }
  });

  it("returns a stable cached reference per id", () => {
    const id = DEMO_SESSION_SUMMARIES[0]!.sessionId;
    expect(buildDemoSessionContent(id)).toBe(buildDemoSessionContent(id));
  });

  it("builds a session whose identity matches its summary", () => {
    for (const summary of DEMO_SESSION_SUMMARIES) {
      const built = buildDemoSessionContent(summary.sessionId)!;
      expect(built.session.id).toBe(summary.sessionId);
      expect(built.session.title).toBe(summary.title);
      expect(built.project.id).toBe(summary.projectId);
      expect(built.project.name).toBe(summary.projectName);
      expect(built.session.sourceLabel).toBe(summary.sourceLabel);
      expect(built.session.status).toBe(summary.status);
    }
  });

  it("gives distinct sessions distinct reconstructed content", () => {
    const jwt = buildDemoSessionContent("demo-ng-gw-jwt-auth")!;
    const rate = buildDemoSessionContent("demo-ng-gw-rate-limiter")!;
    expect(jwt.session.title).toBe("JWT 인증 미들웨어 도입");
    expect(rate.session.title).toBe("레이트 리미터 토큰 버킷 구현");
    expect(jwt.events.map((e) => e.title)).not.toEqual(rate.events.map((e) => e.title));
    expect(jwt.summary.sessionSummary).not.toBe(rate.summary.sessionSummary);
  });

  it("produces internally consistent, non-empty bodies", () => {
    for (const summary of DEMO_SESSION_SUMMARIES) {
      const built = buildDemoSessionContent(summary.sessionId)!;

      expect(built.events.length).toBeGreaterThan(0);
      expect(built.decisions.length).toBeGreaterThan(0);
      expect(built.issues.length).toBeGreaterThan(0);
      expect(built.nextActions.length).toBeGreaterThan(0);
      expect(built.sources.length).toBeGreaterThan(0);

      const eventIds = new Set(built.events.map((e) => e.id));
      // Unique event ids, all scoped to this session.
      expect(eventIds.size).toBe(built.events.length);
      for (const event of built.events) {
        expect(event.sessionId).toBe(summary.sessionId);
        for (const srcId of event.sourceRefs) {
          expect(built.sources.some((s) => s.id === srcId)).toBe(true);
        }
      }

      // Decisions / issues anchor to real events.
      for (const decision of built.decisions) {
        for (const id of decision.sourceEventIds) expect(eventIds.has(id)).toBe(true);
      }
      for (const issue of built.issues) {
        for (const id of issue.sourceEventIds) expect(eventIds.has(id)).toBe(true);
      }

      // Relationships reference ids that exist in the session.
      const knownIds = new Set<string>([
        ...eventIds,
        ...built.issues.map((i) => i.id),
        ...built.decisions.map((d) => d.id),
        ...built.artifacts.map((a) => a.id),
      ]);
      for (const rel of built.relationships) {
        expect(knownIds.has(rel.fromId)).toBe(true);
        expect(knownIds.has(rel.toId)).toBe(true);
      }

      // Summary points at the session's own next actions.
      expect(built.summary.nextActionIds).toEqual(built.nextActions.map((a) => a.id));
    }
  });
});

describe("session store opens demo sessions", () => {
  beforeEach(() => {
    const repository = new BrowserDraftRepository(new MemoryKeyValueStorage());
    setSessionRepositoryForTesting(repository);
    setSessionPersistenceServiceForSessionStore(
      new SessionPersistenceService({ runtime: "browser", repository }),
    );
    useSessionStore.setState({
      initialized: true,
      draft: null,
      demoSessionId: null,
      imports: [],
      analysis: null,
      analysisStatus: "idle",
      source: "demo",
    });
  });

  afterEach(() => {
    setSessionRepositoryForTesting(null);
    setSessionPersistenceServiceForSessionStore(null);
  });

  it("loadBrowserSession opens a demo session's own view (read-only)", () => {
    const id = "demo-ng-gw-jwt-auth";
    const opened = useSessionStore.getState().loadBrowserSession(id);
    expect(opened).toBe(true);

    const state = useSessionStore.getState();
    expect(state.demoSessionId).toBe(id);
    expect(state.draft).toBeNull();
    expect(selectSessionMode(state)).toBe("demo");

    const view = selectSessionView(state);
    expect(view.isDemo).toBe(true);
    expect(view.session.id).toBe(id);
    expect(view.session.title).toBe("JWT 인증 미들웨어 도입");

    // Demo sessions stay read-only — write actions are no-ops.
    expect(useSessionStore.getState().renameSession(id, "다른 제목")).toBe(false);
  });

  it("switching between two demo sessions swaps the view", () => {
    const store = useSessionStore.getState();
    store.loadBrowserSession("demo-ng-gw-jwt-auth");
    expect(selectSessionView(useSessionStore.getState()).session.title).toBe(
      "JWT 인증 미들웨어 도입",
    );

    store.loadBrowserSession("demo-ng-gw-rate-limiter");
    expect(selectSessionView(useSessionStore.getState()).session.title).toBe(
      "레이트 리미터 토큰 버킷 구현",
    );
  });

  it("still returns false for an unknown non-demo session id", () => {
    expect(useSessionStore.getState().loadBrowserSession("missing-session")).toBe(false);
    expect(useSessionStore.getState().demoSessionId).toBeNull();
  });
});
