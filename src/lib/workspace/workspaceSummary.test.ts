import { describe, expect, it } from "vitest";
import type { SessionMode, SessionViewModel } from "../../app/sessionStore";
import { moriMockSession } from "../../domain/mock-data";
import type { StoredSessionSummary } from "../storage/storageTypes";
import {
  buildWorkspaceSummary,
  buildWorkspaceSurfaceLinks,
  describeWorkspaceSessionStatus,
} from "./workspaceSummary";

function view(over: Partial<SessionViewModel> = {}): SessionViewModel {
  return { ...moriMockSession, isDemo: true, ...over };
}

function stored(over: Partial<StoredSessionSummary>): StoredSessionSummary {
  return {
    sessionId: "stored-1",
    projectId: moriMockSession.project.id,
    title: "Stored session",
    projectName: moriMockSession.project.name,
    savedAt: "2026-05-10T09:00:00+09:00",
    status: "complete",
    ...over,
  };
}

describe("buildWorkspaceSummary", () => {
  it("carries the active project and session counts", () => {
    const summary = buildWorkspaceSummary({
      view: view(),
      mode: "demo",
      storedSessions: [],
    });

    expect(summary.projectId).toBe(moriMockSession.project.id);
    expect(summary.projectName).toBe(moriMockSession.project.name);
    expect(summary.isDemoProject).toBe(true);
    expect(summary.counts.events).toBe(moriMockSession.events.length);
    expect(summary.counts.issues).toBe(moriMockSession.issues.length);
    expect(summary.counts.decisions).toBe(moriMockSession.decisions.length);
    expect(summary.counts.nextActions).toBe(moriMockSession.nextActions.length);
  });

  it("counts completed next actions as the work-progress signal", () => {
    const base = moriMockSession.nextActions[0]!;
    const summary = buildWorkspaceSummary({
      view: view({
        nextActions: [
          { ...base, id: "na-done", done: true, completedAt: "2026-05-18T09:00:00Z" },
          { ...base, id: "na-pending" },
        ],
      }),
      mode: "demo",
      storedSessions: [],
    });

    expect(summary.counts.nextActions).toBe(2);
    expect(summary.counts.completedNextActions).toBe(1);
  });

  it("counts resolved issues as the project progress signal", () => {
    const summary = buildWorkspaceSummary({
      view: view({
        issues: [
          { ...moriMockSession.issues[0]!, status: "resolved" },
          { ...moriMockSession.issues[0]!, id: "iss-open", status: "open" },
        ],
      }),
      mode: "demo",
      storedSessions: [],
    });

    expect(summary.counts.issues).toBe(2);
    expect(summary.counts.resolvedIssues).toBe(1);
  });

  it("includes the active session even when it has no saved draft", () => {
    const summary = buildWorkspaceSummary({
      view: view(),
      mode: "draft",
      storedSessions: [],
    });

    expect(summary.sessionCount).toBe(1);
    expect(summary.sessions[0].sessionId).toBe(moriMockSession.session.id);
    expect(summary.sessions[0].isActive).toBe(true);
    expect(summary.sessions[0].savedAt).toBeNull();
    expect(summary.isDemoProject).toBe(false);
  });

  it("does not duplicate the active session when it is already stored", () => {
    const summary = buildWorkspaceSummary({
      view: view(),
      mode: "draft",
      storedSessions: [
        stored({ sessionId: moriMockSession.session.id, title: "Saved active" }),
      ],
    });

    expect(summary.sessionCount).toBe(1);
    expect(summary.sessions[0].isActive).toBe(true);
    expect(summary.sessions[0].savedAt).toBe("2026-05-10T09:00:00+09:00");
  });

  it("scopes sessions to the active project", () => {
    const summary = buildWorkspaceSummary({
      view: view(),
      mode: "draft",
      storedSessions: [
        stored({ sessionId: "other", projectId: "different-project" }),
      ],
    });

    expect(summary.sessions.some((entry) => entry.sessionId === "other")).toBe(
      false,
    );
    expect(summary.sessions.some((entry) => entry.isActive)).toBe(true);
  });

  it("orders the active session first, then newest saved drafts", () => {
    const summary = buildWorkspaceSummary({
      view: view(),
      mode: "draft",
      storedSessions: [
        stored({ sessionId: "old", savedAt: "2026-05-01T09:00:00+09:00" }),
        stored({ sessionId: "new", savedAt: "2026-05-09T09:00:00+09:00" }),
      ],
    });

    expect(summary.sessions.map((entry) => entry.sessionId)).toEqual([
      moriMockSession.session.id,
      "new",
      "old",
    ]);
  });
});

describe("buildWorkspaceSurfaceLinks", () => {
  it("links every core work surface", () => {
    const links = buildWorkspaceSurfaceLinks(view());
    expect(links.map((link) => link.view)).toEqual([
      "timeline",
      "evidence",
      "review",
      "reports",
      "memory",
    ]);
  });

  it("annotates surfaces with factual counts from the active session", () => {
    const links = buildWorkspaceSurfaceLinks(view());
    const byView = Object.fromEntries(links.map((link) => [link.view, link.detail]));

    expect(byView.timeline).toContain(String(moriMockSession.events.length));
    expect(byView.evidence).toContain(String(moriMockSession.sources.length));
    expect(byView.review).toContain(String(moriMockSession.decisions.length));
    expect(byView.review).toContain(String(moriMockSession.issues.length));
  });

  it("reflects an emptied session without inventing content", () => {
    const links = buildWorkspaceSurfaceLinks(
      view({ events: [], sources: [], issues: [], decisions: [] }),
    );
    const timeline = links.find((link) => link.view === "timeline");
    expect(timeline?.detail).toBe("이벤트 0개");
  });
});

describe("describeWorkspaceSessionStatus", () => {
  it("maps every session status to a Korean label and tone", () => {
    expect(describeWorkspaceSessionStatus("recording")).toEqual({
      label: "기록 중",
      tone: "accent",
    });
    expect(describeWorkspaceSessionStatus("analyzing")).toEqual({
      label: "분석 중",
      tone: "info",
    });
    expect(describeWorkspaceSessionStatus("complete")).toEqual({
      label: "완료",
      tone: "success",
    });
  });
});
