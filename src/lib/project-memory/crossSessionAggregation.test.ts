import { describe, expect, it } from "vitest";
import type {
  Decision,
  Issue,
  MoriMockSession,
  SourceRef,
  TimelineEvent,
} from "../../domain/types";
import { moriMockSession } from "../../domain/mock-data";
import {
  aggregateCounters,
  aggregateKeyDecisions,
  aggregateKeyEvidence,
  aggregateRecurringIssues,
  aggregateUnresolvedRisks,
  loadedSessionHasBody,
  pickRecommendedNextSession,
} from "./crossSessionAggregation";
import type { ProjectMemoryLoadedSession } from "./projectMemoryModel";

function decision(
  id: string,
  importance: Decision["importance"],
  createdAt: string,
  overrides: Partial<Decision> = {},
): Decision {
  return {
    id,
    sessionId: "session-x",
    projectId: "proj-x",
    title: `Decision ${id}`,
    decision: `We decided ${id}.`,
    rationale: "",
    rejectedOptions: [],
    impact: [],
    importance,
    confirmed: true,
    createdAt,
    sourceEventIds: [],
    relatedSourceIds: [],
    relatedIssueIds: [],
    trustLevel: "verified",
    ...overrides,
  };
}

function issue(
  id: string,
  title: string,
  priority: Issue["priority"] = "medium",
  overrides: Partial<Issue> = {},
): Issue {
  return {
    id,
    sessionId: "session-x",
    projectId: "proj-x",
    title,
    description: `${title} description`,
    priority,
    status: "open",
    sourceEventIds: [],
    relatedDecisionIds: [],
    relatedFileIds: [],
    suggestedNextAction: "",
    trustLevel: "observed",
    confidence: 0.8,
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

function source(id: string, overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    id,
    sessionId: "session-x",
    kind: "aiConversation",
    title: `Source ${id}`,
    detail: "",
    trustLevel: "observed",
    redactionStatus: "notNeeded",
    rawRetention: "summaryOnly",
    capturedAt: "2026-05-01T10:00:00Z",
    relatedEventIds: [],
    ...overrides,
  };
}

function event(id: string, sourceIds: string[]): TimelineEvent {
  return {
    id,
    sessionId: "session-x",
    projectId: "proj-x",
    start: "2026-05-01T10:00:00Z",
    type: "aiConversation",
    title: `Event ${id}`,
    summary: "",
    sourceRefs: sourceIds,
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.7,
    createdBy: "import",
    userModified: false,
  };
}

function loaded(
  id: string,
  payload: Partial<MoriMockSession> & {
    isActive?: boolean;
    title?: string;
    status?: ProjectMemoryLoadedSession["loadStatus"];
  } = {},
): ProjectMemoryLoadedSession {
  return {
    sessionId: id,
    title: payload.title ?? `Session ${id}`,
    projectId: "proj-x",
    projectName: "Project X",
    startedAt: "2026-05-01T09:00:00Z",
    endedAt: "2026-05-01T12:00:00Z",
    savedAt: "2026-05-01T12:00:00Z",
    source: payload.isActive ? "active" : "browserLocalStorage",
    loadStatus: payload.status ?? "loaded",
    isActive: payload.isActive ?? false,
    events: payload.events ?? [],
    sources: payload.sources ?? [],
    issues: payload.issues ?? [],
    decisions: payload.decisions ?? [],
    nextActions: payload.nextActions ?? [],
    imports: [],
    analysis: null,
  };
}

describe("aggregateKeyDecisions", () => {
  it("ranks high-importance decisions first, then by active-session, then by recency", () => {
    const active = loaded("active", {
      isActive: true,
      title: "Active",
      decisions: [decision("d-active-low", "low", "2026-05-10T10:00:00Z")],
    });
    const saved = loaded("saved", {
      decisions: [
        decision("d-saved-high", "high", "2026-04-01T10:00:00Z"),
        decision("d-saved-med", "medium", "2026-04-02T10:00:00Z"),
      ],
    });
    const rows = aggregateKeyDecisions([active, saved]);
    expect(rows[0].decisionId).toBe("d-saved-high");
    expect(rows[0].sessionTitle).toBe("Session saved"); // saved session label
    expect(rows.map((r) => r.decisionId)).toEqual([
      "d-saved-high",
      "d-saved-med",
      "d-active-low",
    ]);
  });

  it("ignores metadata-only / failed sessions", () => {
    const active = loaded("active", { isActive: true, decisions: [decision("d-a", "high", "2026-05-10T10:00:00Z")] });
    const metadata = loaded("meta", { status: "metadataOnly", decisions: [decision("d-x", "high", "2026-05-09T10:00:00Z")] });
    const failed = loaded("fail", { status: "failed", decisions: [decision("d-y", "high", "2026-05-08T10:00:00Z")] });
    const rows = aggregateKeyDecisions([active, metadata, failed]);
    expect(rows.map((r) => r.decisionId)).toEqual(["d-a"]);
  });
});

describe("aggregateRecurringIssues", () => {
  it("marks an issue as crossSession when it appears in multiple sessions with the same title", () => {
    const sessionA = loaded("a", { isActive: true, issues: [issue("ia", "Login bug fails on Safari")] });
    const sessionB = loaded("b", { issues: [issue("ib", "Login bug fails on Safari")] });
    const rows = aggregateRecurringIssues([sessionA, sessionB]);
    expect(rows.length).toBe(1);
    expect(rows[0].crossSession).toBe(true);
    expect(rows[0].affectedSessionCount).toBe(2);
    expect(rows[0].affectedSessions.map((s) => s.sessionId).sort()).toEqual(["a", "b"]);
  });

  it("keeps single-session high-priority issues but marks them non-recurring", () => {
    const session = loaded("a", { isActive: true, issues: [issue("i1", "Critical regression", "high")] });
    const rows = aggregateRecurringIssues([session]);
    expect(rows.length).toBe(1);
    expect(rows[0].crossSession).toBe(false);
    expect(rows[0].affectedSessionCount).toBe(1);
  });

  it("does not aggregate metadata-only sessions", () => {
    const active = loaded("active", { isActive: true, issues: [issue("i1", "Login bug")] });
    const metaOnly = loaded("meta", { status: "metadataOnly", issues: [issue("i2", "Login bug")] });
    const rows = aggregateRecurringIssues([active, metaOnly]);
    expect(rows[0].crossSession).toBe(false);
    expect(rows[0].affectedSessionCount).toBe(1);
  });
});

describe("aggregateKeyEvidence", () => {
  it("ranks evidence by linked event count and de-duplicates by source id across sessions", () => {
    const sourceA = source("src-a");
    const sourceB = source("src-b");
    const sessionActive = loaded("a", {
      isActive: true,
      sources: [sourceA],
      events: [event("e1", ["src-a"]), event("e2", ["src-a"])],
    });
    const sessionSaved = loaded("b", {
      sources: [sourceB, source("src-a") /* duplicate id should be ignored */],
      events: [event("e3", ["src-b"])],
    });
    const rows = aggregateKeyEvidence([sessionActive, sessionSaved]);
    expect(rows.map((r) => r.source.id)).toEqual(["src-a", "src-b"]);
    expect(rows[0].relatedEventCount).toBe(2);
    expect(rows[0].sessionIsActive).toBe(true);
  });
});

describe("aggregateUnresolvedRisks", () => {
  it("only surfaces high-priority opens or low-confidence inferred opens", () => {
    const sessions = [
      loaded("a", {
        isActive: true,
        issues: [
          issue("i-h", "High priority issue", "high"),
          issue("i-low", "Resolved low risk", "low", { status: "resolved" }),
          issue("i-inf", "Inferred shaky", "medium", { trustLevel: "inferred", confidence: 0.4 }),
        ],
      }),
    ];
    const risks = aggregateUnresolvedRisks(sessions);
    expect(risks.map((r) => r.issueId).sort()).toEqual(["i-h", "i-inf"]);
  });
});

describe("aggregateCounters", () => {
  it("de-duplicates timeline events and sources by id across sessions", () => {
    const ev = event("shared", []);
    const src = source("shared");
    const a = loaded("a", { isActive: true, events: [ev], sources: [src] });
    const b = loaded("b", { events: [ev], sources: [src], decisions: [decision("d", "high", "2026-05-01T10:00:00Z")] });
    const counts = aggregateCounters([a, b]);
    expect(counts.timelineEventCount).toBe(1);
    expect(counts.evidenceSourceCount).toBe(1);
    expect(counts.decisionCount).toBe(1);
  });
});

describe("pickRecommendedNextSession", () => {
  it("prefers cross-session recurring issues over single-session risks", () => {
    const recurring = aggregateRecurringIssues([
      loaded("a", { isActive: true, issues: [issue("i1", "Same bug")] }),
      loaded("b", { issues: [issue("i2", "Same bug")] }),
    ]);
    const risks = aggregateUnresolvedRisks([
      loaded("a", { isActive: true, issues: [issue("h1", "Different urgent", "high")] }),
    ]);
    const topic = pickRecommendedNextSession({
      recurring,
      risks,
      loaded: [loaded("a", { isActive: true })],
    });
    expect(topic).toMatch(/반복 이슈 해소/);
  });

  it("falls back to active in-progress / next action when no risks or recurring issues exist", () => {
    const active = loaded("a", {
      isActive: true,
      issues: [issue("ip", "In progress thing", "medium", { status: "inProgress" })],
    });
    const topic = pickRecommendedNextSession({ recurring: [], risks: [], loaded: [active] });
    expect(topic).toMatch(/진행 중 이슈/);
  });
});

describe("loadedSessionHasBody", () => {
  it("returns false for metadata-only and failed sessions", () => {
    expect(loadedSessionHasBody(loaded("a", { status: "metadataOnly" }))).toBe(false);
    expect(loadedSessionHasBody(loaded("a", { status: "failed" }))).toBe(false);
  });
  it("returns true when any payload is non-empty on a loaded session", () => {
    const real = loaded("a", { decisions: [decision("d", "high", "2026-05-01T10:00:00Z")] });
    expect(loadedSessionHasBody(real)).toBe(true);
  });
  it("returns false for a loaded session with no payload", () => {
    const empty = loaded("a", {});
    expect(loadedSessionHasBody(empty)).toBe(false);
  });
  it("works with the mock session as a sanity check", () => {
    // Convert moriMockSession to a loaded shape to confirm the helper
    // tolerates real data without surprise.
    const real = loaded("mock", {
      isActive: true,
      decisions: moriMockSession.decisions,
      issues: moriMockSession.issues,
      sources: moriMockSession.sources,
      events: moriMockSession.events,
    });
    expect(loadedSessionHasBody(real)).toBe(true);
  });
});
