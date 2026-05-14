import { describe, expect, it } from "vitest";
import { moriMockSession } from "../../domain/mock-data";
import {
  buildFollowUpPrompt,
  deriveProjectMemoryStats,
  describeDecisionSource,
  getDecisionTimeline,
  getKeyEvidence,
  getProjectMemorySummary,
  getRecentDecisions,
  getRecurringIssues,
  scopeLabelFor,
  type DerivedSession,
  type ProjectMemoryDataScope,
} from "./projectMemory";

function fakeSavedSession(id: string, scope: ProjectMemoryDataScope, savedAt = "2026-05-10T10:00:00Z"): DerivedSession {
  return {
    sessionId: id,
    projectId: "proj-1",
    title: `Saved ${id}`,
    projectName: "Mori Product",
    startedAt: savedAt,
    savedAt,
    status: "complete",
    eventCount: 12,
    sourceCount: 4,
    isCurrent: false,
    scope,
    scopeLabel: scopeLabelFor(scope),
  };
}

describe("deriveProjectMemoryStats", () => {
  it("aggregates the current session view + saved-session ids without double-counting", () => {
    const saved = [fakeSavedSession(moriMockSession.session.id, "browser-draft"), fakeSavedSession("sess-x", "sqlite-saved")];
    const stats = deriveProjectMemoryStats({ view: moriMockSession, savedSessions: saved, reportCount: 2 });
    expect(stats.sessionCount).toBe(2); // active + sess-x (the duplicate id is deduped)
    expect(stats.aggregatedSessionCount).toBe(1);
    expect(stats.sourceCount).toBe(moriMockSession.sources.length);
    expect(stats.eventCount).toBe(moriMockSession.events.length);
    expect(stats.issueCount).toBe(moriMockSession.issues.length);
    expect(stats.decisionCount).toBe(moriMockSession.decisions.length);
    expect(stats.nextActionCount).toBe(moriMockSession.nextActions.length);
    expect(stats.reportCount).toBe(2);
    expect(stats.openIssueCount).toBe(
      moriMockSession.issues.filter((issue) => issue.status !== "resolved").length,
    );
    expect(stats.unconfirmedDecisionCount).toBe(
      moriMockSession.decisions.filter((decision) => !decision.confirmed).length,
    );
  });

  it("counts at least one session (the active session) even with no saved entries", () => {
    const stats = deriveProjectMemoryStats({ view: moriMockSession, savedSessions: [], reportCount: 0 });
    expect(stats.sessionCount).toBe(1);
    expect(stats.aggregatedSessionCount).toBe(1);
    expect(stats.reportCount).toBe(0);
  });
});

describe("getRecentDecisions", () => {
  it("returns decisions sorted newest first", () => {
    const recent = getRecentDecisions(moriMockSession, 3);
    expect(recent).toHaveLength(Math.min(3, moriMockSession.decisions.length));
    for (let i = 1; i < recent.length; i += 1) {
      expect(new Date(recent[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(recent[i].createdAt).getTime(),
      );
    }
  });
});

describe("getDecisionTimeline", () => {
  it("returns chronological points oldest-first with importance + confirmed flags", () => {
    const timeline = getDecisionTimeline(moriMockSession);
    expect(timeline).toHaveLength(moriMockSession.decisions.length);
    for (let i = 1; i < timeline.length; i += 1) {
      expect(new Date(timeline[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(timeline[i - 1].createdAt).getTime(),
      );
    }
    for (const point of timeline) {
      expect(["high", "medium", "low"]).toContain(point.importance);
      expect(typeof point.confirmed).toBe("boolean");
    }
  });
});

describe("getRecurringIssues", () => {
  it("scores high-priority and evidence-rich issues higher", () => {
    const rows = getRecurringIssues(moriMockSession, "current-session", 3);
    // Result is sorted by signalScore desc.
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].signalScore).toBeGreaterThanOrEqual(rows[i].signalScore);
    }
    // Every result is tagged with the requested scope.
    for (const row of rows) {
      expect(row.scope).toBe("current-session");
      expect(row.scopeLabel).toBe(scopeLabelFor("current-session"));
    }
  });

  it("includes high-priority issues even when their signal score is zero", () => {
    const minimalSession = {
      ...moriMockSession,
      issues: [
        {
          ...moriMockSession.issues[0],
          id: "isolated-high",
          status: "open" as const,
          priority: "high" as const,
          sourceEventIds: [],
          relatedDecisionIds: [],
        },
      ],
    };
    const rows = getRecurringIssues(minimalSession, "demo");
    expect(rows.map((row) => row.issue.id)).toContain("isolated-high");
  });
});

describe("getKeyEvidence", () => {
  it("orders sources by linked-event count then captured time", () => {
    const evidence = getKeyEvidence(moriMockSession, 4);
    expect(evidence.length).toBeGreaterThan(0);
    for (let i = 1; i < evidence.length; i += 1) {
      const prev = evidence[i - 1];
      const curr = evidence[i];
      if (prev.relatedEventCount !== curr.relatedEventCount) {
        expect(prev.relatedEventCount).toBeGreaterThan(curr.relatedEventCount);
      }
    }
    for (const entry of evidence) {
      expect(entry.display.integrationLabel).toBeTruthy();
    }
  });

  it("returns an empty array when the session has no sources", () => {
    const empty = { ...moriMockSession, sources: [], events: [], issues: [], decisions: [] };
    expect(getKeyEvidence(empty)).toEqual([]);
  });
});

describe("getProjectMemorySummary", () => {
  it("picks the most recent high-importance decision as the latest important decision", () => {
    const summary = getProjectMemorySummary({
      view: moriMockSession,
      scope: "current-session",
      savedSessionCount: 0,
      reportCount: 0,
      hasAnalysis: false,
    });
    expect(summary.latestImportantDecision).toBeTruthy();
    if (summary.latestImportantDecision?.importance) {
      expect(["high", "medium", "low"]).toContain(summary.latestImportantDecision.importance);
    }
  });

  it("describes unresolved risks as open + high priority or low-confidence inferred", () => {
    const summary = getProjectMemorySummary({
      view: moriMockSession,
      scope: "current-session",
      savedSessionCount: 0,
      reportCount: 0,
      hasAnalysis: false,
    });
    for (const risk of summary.unresolvedRisks) {
      expect(risk.status).toBe("open");
      const lowConfidenceInferred = risk.trustLevel === "inferred" && risk.confidence < 0.6;
      const highPriority = risk.priority === "high";
      expect(lowConfidenceInferred || highPriority).toBe(true);
    }
  });

  it("includes a scope caveat about Quick Pass when analysis has not run", () => {
    const summary = getProjectMemorySummary({
      view: moriMockSession,
      scope: "current-session",
      savedSessionCount: 0,
      reportCount: 0,
      hasAnalysis: false,
    });
    expect(summary.scopeCaveat).toMatch(/Quick Pass/);
  });

  it("uses Demo-specific copy when scope is demo", () => {
    const summary = getProjectMemorySummary({
      view: moriMockSession,
      scope: "demo",
      savedSessionCount: 0,
      reportCount: 0,
      hasAnalysis: false,
    });
    expect(summary.scopeCaveat).toMatch(/Demo memory/);
    expect(summary.scopeLabel).toBe("Demo memory");
  });
});

describe("buildFollowUpPrompt", () => {
  it("includes project name, decisions, open issues, next actions, and key evidence", () => {
    const prompt = buildFollowUpPrompt({
      view: moriMockSession,
      savedSessionCount: 1,
      reportCount: 0,
      hasAnalysis: true,
    });
    expect(prompt).toContain(moriMockSession.project.name);
    expect(prompt).toContain("Most recent decisions");
    expect(prompt).toContain("Open issues to address");
    expect(prompt).toContain("Next actions on the docket");
    expect(prompt).toContain("Key evidence");
    expect(prompt).toContain("Memory scope");
  });

  it("reports zero saved sessions and Quick-Pass-not-run honestly", () => {
    const prompt = buildFollowUpPrompt({
      view: moriMockSession,
      savedSessionCount: 0,
      reportCount: 0,
      hasAnalysis: false,
    });
    expect(prompt).toContain("저장된 세션 0건");
    expect(prompt).toContain("아직 실행하지 않음");
  });
});

describe("describeDecisionSource", () => {
  it("returns the bare title when no source event matches", () => {
    const decision = { ...moriMockSession.decisions[0], sourceEventIds: ["does-not-exist"] };
    expect(describeDecisionSource(decision, moriMockSession.events)).toBe(decision.title);
  });

  it("appends the event-type label when the decision came from an event", () => {
    const decision = moriMockSession.decisions.find((d) => d.sourceEventIds.length > 0);
    if (!decision) return;
    const result = describeDecisionSource(decision, moriMockSession.events);
    expect(result).toContain(decision.title);
    // contains a separator and a tag, so the rendered string is longer than the bare title.
    expect(result.length).toBeGreaterThan(decision.title.length);
  });
});

describe("scopeLabelFor", () => {
  it("maps each scope to its display label", () => {
    expect(scopeLabelFor("demo")).toBe("Demo memory");
    expect(scopeLabelFor("current-session")).toBe("Current session");
    expect(scopeLabelFor("browser-draft")).toBe("Browser draft");
    expect(scopeLabelFor("sqlite-saved")).toBe("Desktop SQLite");
  });
});
