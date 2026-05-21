import { describe, expect, it } from "vitest";
import type { Decision, Issue, MoriMockSession, SourceRef, TimelineEvent } from "../../domain/types";
import {
  getDecisionEvidenceSources,
  getEventEvidenceSources,
  getIssueEvidenceSources,
  getReportEvidenceSummary,
  getSourceDisplayStatus,
  getSourceRawDataLabel,
  getSourceTrustLabel,
} from "./traceability";

describe("traceability", () => {
  describe("getSourceDisplayStatus", () => {
    it("returns display status for manual note source", () => {
      const source: SourceRef = {
        id: "src-1",
        sessionId: "session-1",
        kind: "manualNote",
        title: "Test Note",
        detail: "Test detail",
        trustLevel: "verified",
        redactionStatus: "notNeeded",
        rawRetention: "retained",
        capturedAt: "2024-01-01T00:00:00Z",
        relatedEventIds: [],
      };

      const status = getSourceDisplayStatus(source);

      expect(status.integration).toBe("manualNote");
      expect(status.integrationLabel).toBe("Manual Note");
      expect(status.status).toBe("implemented");
      expect(status.statusLabel).toBe("사용 가능");
      expect(status.captureMethod).toBe("수동 입력");
      expect(status.trustLabel).toBe("Verified");
      expect(status.trustTone).toBe("green");
      expect(status.rawDataLabel).toBe("원본 전체 보관");
      expect(status.privacyNote).toBeTruthy();
    });

    it("returns display status for AI conversation source", () => {
      const source: SourceRef = {
        id: "src-2",
        sessionId: "session-1",
        kind: "aiConversation",
        title: "AI Chat",
        detail: "Conversation",
        trustLevel: "verified",
        redactionStatus: "pending",
        rawRetention: "summaryOnly",
        capturedAt: "2024-01-01T00:00:00Z",
        relatedEventIds: [],
      };

      const status = getSourceDisplayStatus(source);

      expect(status.integration).toBe("aiConversation");
      expect(status.integrationLabel).toBe("AI Conversation (Other)");
      expect(status.rawDataLabel).toBe("요약만 보관");
    });

    it("returns display status for git diff source", () => {
      const source: SourceRef = {
        id: "src-3",
        sessionId: "session-1",
        kind: "gitDiff",
        title: "Git Diff",
        detail: "Changes",
        trustLevel: "verified",
        redactionStatus: "notNeeded",
        rawRetention: "retained",
        capturedAt: "2024-01-01T00:00:00Z",
        relatedEventIds: [],
      };

      const status = getSourceDisplayStatus(source);

      expect(status.integration).toBe("gitDiff");
      expect(status.status).toBe("implemented");
      expect(status.captureMethod).toBe("수동 입력");
    });
  });

  describe("getSourceTrustLabel", () => {
    it("returns correct label and tone for verified", () => {
      const result = getSourceTrustLabel("verified");
      expect(result.label).toBe("Verified");
      expect(result.tone).toBe("green");
    });

    it("returns correct label and tone for observed", () => {
      const result = getSourceTrustLabel("observed");
      expect(result.label).toBe("Observed");
      expect(result.tone).toBe("blue");
    });

    it("returns correct label and tone for inferred", () => {
      const result = getSourceTrustLabel("inferred");
      expect(result.label).toBe("Inferred");
      expect(result.tone).toBe("purple");
    });

    it("returns unknown trust level with purple tone", () => {
      const result = getSourceTrustLabel("unknown");
      expect(result.label).toBe("unknown");
      expect(result.tone).toBe("purple");
    });
  });

  describe("getSourceRawDataLabel", () => {
    it("returns correct label for retained", () => {
      expect(getSourceRawDataLabel("retained")).toBe("원본 전체 보관");
    });

    it("returns correct label for summaryOnly", () => {
      expect(getSourceRawDataLabel("summaryOnly")).toBe("요약만 보관");
    });

    it("returns correct label for redacted", () => {
      expect(getSourceRawDataLabel("redacted")).toBe("민감정보 제거됨");
    });

    it("returns correct label for notCaptured", () => {
      expect(getSourceRawDataLabel("notCaptured")).toBe("원본 미보관");
    });

    it("returns unknown policy as-is", () => {
      expect(getSourceRawDataLabel("unknown")).toBe("unknown");
    });
  });

  describe("getEventEvidenceSources", () => {
    it("returns evidence sources for an event", () => {
      const event: TimelineEvent = {
        id: "evt-1",
        sessionId: "session-1",
        projectId: "project-1",
        start: "2024-01-01T00:00:00Z",
        type: "fileCode",
        title: "Code change",
        summary: "Updated file",
        sourceRefs: ["src-1", "src-2"],
        linkedIssueIds: [],
        linkedDecisionIds: [],
        relationshipIds: [],
        trustLevel: "verified",
        confidence: 0.95,
        createdBy: "import",
        userModified: false,
      };

      const sources: SourceRef[] = [
        {
          id: "src-1",
          sessionId: "session-1",
          kind: "gitDiff",
          title: "Git Diff",
          detail: "Changes",
          trustLevel: "verified",
          redactionStatus: "notNeeded",
          rawRetention: "retained",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: ["evt-1"],
        },
        {
          id: "src-2",
          sessionId: "session-1",
          kind: "manualNote",
          title: "Note",
          detail: "Context",
          trustLevel: "verified",
          redactionStatus: "notNeeded",
          rawRetention: "retained",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: ["evt-1"],
        },
        {
          id: "src-3",
          sessionId: "session-1",
          kind: "browser",
          title: "URL",
          detail: "Research",
          trustLevel: "verified",
          redactionStatus: "notNeeded",
          rawRetention: "retained",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: [],
        },
      ];

      const evidence = getEventEvidenceSources(event, sources);

      expect(evidence.sourceCount).toBe(2);
      expect(evidence.sources.length).toBe(2);
      expect(evidence.sources.map((s) => s.id)).toEqual(["src-1", "src-2"]);
      expect(evidence.trustLevels.verified).toBe(2);
      expect(evidence.trustLevels.observed).toBe(0);
      expect(evidence.trustLevels.inferred).toBe(0);
      expect(evidence.integrations).toEqual(["gitDiff", "manualNote"]);
    });

    it("returns empty evidence for event with no sources", () => {
      const event: TimelineEvent = {
        id: "evt-1",
        sessionId: "session-1",
        projectId: "project-1",
        start: "2024-01-01T00:00:00Z",
        type: "other",
        title: "Event",
        summary: "Summary",
        sourceRefs: [],
        linkedIssueIds: [],
        linkedDecisionIds: [],
        relationshipIds: [],
        trustLevel: "inferred",
        confidence: 0.5,
        createdBy: "ai",
        userModified: false,
      };

      const evidence = getEventEvidenceSources(event, []);

      expect(evidence.sourceCount).toBe(0);
      expect(evidence.sources).toEqual([]);
      expect(evidence.trustLevels.verified).toBe(0);
    });
  });

  describe("getIssueEvidenceSources", () => {
    it("returns evidence sources for an issue through its events", () => {
      const issue: Issue = {
        id: "issue-1",
        projectId: "project-1",
        sessionId: "session-1",
        title: "Issue",
        description: "Description",
        status: "open",
        priority: "high",
        sourceEventIds: ["evt-1"],
        relatedDecisionIds: [],
        relatedFileIds: [],
        suggestedNextAction: "Fix it",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        confidence: 0.8,
        trustLevel: "inferred",
      };

      const events: TimelineEvent[] = [
        {
          id: "evt-1",
          sessionId: "session-1",
          projectId: "project-1",
          start: "2024-01-01T00:00:00Z",
          type: "issue",
          title: "Issue event",
          summary: "Summary",
          sourceRefs: ["src-1", "src-2"],
          linkedIssueIds: ["issue-1"],
          linkedDecisionIds: [],
          relationshipIds: [],
          trustLevel: "verified",
          confidence: 0.9,
          createdBy: "import",
          userModified: false,
        },
      ];

      const sources: SourceRef[] = [
        {
          id: "src-1",
          sessionId: "session-1",
          kind: "aiConversation",
          title: "Chat",
          detail: "Context",
          trustLevel: "verified",
          redactionStatus: "pending",
          rawRetention: "summaryOnly",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: ["evt-1"],
        },
        {
          id: "src-2",
          sessionId: "session-1",
          kind: "manualNote",
          title: "Note",
          detail: "Context",
          trustLevel: "verified",
          redactionStatus: "notNeeded",
          rawRetention: "retained",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: ["evt-1"],
        },
      ];

      const evidence = getIssueEvidenceSources(issue, events, sources);

      expect(evidence.eventCount).toBe(1);
      expect(evidence.sourceCount).toBe(2);
      expect(evidence.trustLevels.verified).toBe(2);
    });
  });

  describe("getDecisionEvidenceSources", () => {
    it("returns evidence sources for a decision including direct sources", () => {
      const decision: Decision = {
        id: "decision-1",
        projectId: "project-1",
        sessionId: "session-1",
        title: "Decision",
        decision: "We decided",
        rationale: "Because",
        rejectedOptions: [],
        impact: [],
        sourceEventIds: ["evt-1"],
        relatedIssueIds: [],
        relatedSourceIds: ["src-3"],
        createdAt: "2024-01-01T00:00:00Z",
        importance: "high",
        trustLevel: "inferred",
        confirmed: false,
      };

      const events: TimelineEvent[] = [
        {
          id: "evt-1",
          sessionId: "session-1",
          projectId: "project-1",
          start: "2024-01-01T00:00:00Z",
          type: "decision",
          title: "Decision event",
          summary: "Summary",
          sourceRefs: ["src-1", "src-2"],
          linkedIssueIds: [],
          linkedDecisionIds: ["decision-1"],
          relationshipIds: [],
          trustLevel: "verified",
          confidence: 0.9,
          createdBy: "import",
          userModified: false,
        },
      ];

      const sources: SourceRef[] = [
        {
          id: "src-1",
          sessionId: "session-1",
          kind: "gitDiff",
          title: "Diff",
          detail: "Changes",
          trustLevel: "verified",
          redactionStatus: "notNeeded",
          rawRetention: "retained",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: ["evt-1"],
        },
        {
          id: "src-2",
          sessionId: "session-1",
          kind: "manualNote",
          title: "Note",
          detail: "Context",
          trustLevel: "verified",
          redactionStatus: "notNeeded",
          rawRetention: "retained",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: ["evt-1"],
        },
        {
          id: "src-3",
          sessionId: "session-1",
          kind: "aiConversation",
          title: "Chat",
          detail: "Discussion",
          trustLevel: "verified",
          redactionStatus: "pending",
          rawRetention: "summaryOnly",
          capturedAt: "2024-01-01T00:00:00Z",
          relatedEventIds: [],
        },
      ];

      const evidence = getDecisionEvidenceSources(decision, events, sources);

      expect(evidence.eventCount).toBe(1);
      expect(evidence.sourceCount).toBe(3); // src-1, src-2 from event + src-3 direct
      expect(evidence.directSourceCount).toBe(1); // src-3
      expect(evidence.trustLevels.verified).toBe(3);
    });
  });

  describe("getReportEvidenceSummary", () => {
    it("returns evidence summary for session with analysis", () => {
      const sessionView: MoriMockSession = {
        project: { id: "p1", name: "Project", description: "", createdAt: "", updatedAt: "" },
        session: {
          id: "s1",
          projectId: "p1",
          title: "Session",
          startedAt: "2024-01-01T00:00:00Z",
          endedAt: "2024-01-01T01:00:00Z",
          recordingMode: "summary",
          llmProvider: "ollama",
          llmModel: "llama2",
          storageLocation: "",
          selectedSourceIds: [],
          status: "complete",
        },
        sources: [
          {
            id: "src-1",
            sessionId: "s1",
            kind: "manualNote",
            title: "Note",
            detail: "Detail",
            trustLevel: "verified",
            redactionStatus: "notNeeded",
            rawRetention: "retained",
            capturedAt: "2024-01-01T00:00:00Z",
            relatedEventIds: [],
          },
          {
            id: "src-2",
            sessionId: "s1",
            kind: "gitDiff",
            title: "Diff",
            detail: "Changes",
            trustLevel: "verified",
            redactionStatus: "notNeeded",
            rawRetention: "retained",
            capturedAt: "2024-01-01T00:00:00Z",
            relatedEventIds: [],
          },
        ],
        events: [],
        issues: [{ id: "i1" } as Issue],
        decisions: [{ id: "d1" } as Decision],
        relationships: [],
        artifacts: [],
        nextActions: [],
        summary: {
          id: "sum-1",
          sessionId: "s1",
          sessionSummary: "Summary",
          resumePrompt: "Prompt",
          reportMarkdown: "",
          nextActionIds: [],
          generatedAt: "2024-01-01T00:00:00Z",
        },
      };

      const summary = getReportEvidenceSummary(sessionView);

      expect(summary.sourceCount).toBe(2);
      expect(summary.eventCount).toBe(0);
      expect(summary.issueCount).toBe(1);
      expect(summary.decisionCount).toBe(1);
      expect(summary.hasAnalysis).toBe(true);
      expect(summary.dataBasis).toBe("가져온 소스 + Quick Pass 분석");
      expect(summary.integrationBreakdown["Manual Note"]).toBe(1);
      expect(summary.integrationBreakdown["Git Diff (Paste)"]).toBe(1);
      expect(summary.trustBreakdown.verified).toBe(2);
    });

    it("returns evidence summary for session without analysis", () => {
      const sessionView: MoriMockSession = {
        project: { id: "p1", name: "Project", description: "", createdAt: "", updatedAt: "" },
        session: {
          id: "s1",
          projectId: "p1",
          title: "Session",
          startedAt: "2024-01-01T00:00:00Z",
          endedAt: "2024-01-01T01:00:00Z",
          recordingMode: "summary",
          llmProvider: "ollama",
          llmModel: "llama2",
          storageLocation: "",
          selectedSourceIds: [],
          status: "complete",
        },
        sources: [
          {
            id: "src-1",
            sessionId: "s1",
            kind: "manualNote",
            title: "Note",
            detail: "Detail",
            trustLevel: "verified",
            redactionStatus: "notNeeded",
            rawRetention: "retained",
            capturedAt: "2024-01-01T00:00:00Z",
            relatedEventIds: [],
          },
        ],
        events: [],
        issues: [],
        decisions: [],
        relationships: [],
        artifacts: [],
        nextActions: [],
        summary: {
          id: "sum-1",
          sessionId: "s1",
          sessionSummary: "Summary",
          resumePrompt: "Prompt",
          reportMarkdown: "",
          nextActionIds: [],
          generatedAt: "2024-01-01T00:00:00Z",
        },
      };

      const summary = getReportEvidenceSummary(sessionView);

      expect(summary.sourceCount).toBe(1);
      expect(summary.hasAnalysis).toBe(false);
      expect(summary.dataBasis).toBe("가져온 소스만 (분석 전)");
    });

    it("returns evidence summary for empty session", () => {
      const sessionView: MoriMockSession = {
        project: { id: "p1", name: "Project", description: "", createdAt: "", updatedAt: "" },
        session: {
          id: "s1",
          projectId: "p1",
          title: "Session",
          startedAt: "2024-01-01T00:00:00Z",
          endedAt: "2024-01-01T01:00:00Z",
          recordingMode: "summary",
          llmProvider: "ollama",
          llmModel: "llama2",
          storageLocation: "",
          selectedSourceIds: [],
          status: "complete",
        },
        sources: [],
        events: [],
        issues: [],
        decisions: [],
        relationships: [],
        artifacts: [],
        nextActions: [],
        summary: {
          id: "sum-1",
          sessionId: "s1",
          sessionSummary: "Summary",
          resumePrompt: "Prompt",
          reportMarkdown: "",
          nextActionIds: [],
          generatedAt: "2024-01-01T00:00:00Z",
        },
      };

      const summary = getReportEvidenceSummary(sessionView);

      expect(summary.sourceCount).toBe(0);
      expect(summary.eventCount).toBe(0);
      expect(summary.hasAnalysis).toBe(false);
      expect(summary.dataBasis).toBe("데이터 없음");
    });
  });
});
