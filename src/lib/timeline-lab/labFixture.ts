import type {
  Decision,
  Issue,
  MockSession,
  NextAction,
  Relationship,
  TimelineEvent,
} from "../../domain/types";

/**
 * Hand-built session fixture for the timeline-lab reconstruction tests.
 *
 * Kept deliberately tiny and explicit (a research → decision → build → issue →
 * note arc with reviewed relationships) so the narrative / phase / causal
 * models can be asserted exactly, without depending on the larger demo content.
 */

export function labEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "evt-1",
    sessionId: "s1",
    projectId: "p1",
    start: "2026-05-22T09:00:00Z",
    type: "aiConversation",
    title: "사용자 질문",
    summary: "요약",
    sourceRefs: [],
    linkedIssueIds: [],
    linkedDecisionIds: [],
    relationshipIds: [],
    trustLevel: "observed",
    confidence: 0.9,
    createdBy: "import",
    userModified: false,
    ...overrides,
  };
}

export function labDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "dec-1",
    projectId: "p1",
    sessionId: "s1",
    title: "결정",
    decision: "결정 내용",
    rationale: "근거",
    rejectedOptions: [],
    impact: [],
    sourceEventIds: [],
    relatedIssueIds: [],
    relatedSourceIds: [],
    createdAt: "2026-05-22T09:10:00Z",
    importance: "high",
    trustLevel: "observed",
    confirmed: false,
    ...overrides,
  };
}

export function labIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "iss-1",
    projectId: "p1",
    sessionId: "s1",
    title: "이슈",
    description: "설명",
    status: "open",
    priority: "high",
    sourceEventIds: [],
    relatedDecisionIds: [],
    relatedFileIds: [],
    suggestedNextAction: "",
    createdAt: "2026-05-22T09:20:00Z",
    updatedAt: "2026-05-22T09:20:00Z",
    confidence: 0.8,
    trustLevel: "observed",
    ...overrides,
  };
}

export function labRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: "rel-1",
    fromId: "evt-1",
    fromType: "event",
    toId: "evt-2",
    toType: "event",
    type: "ledTo",
    confidence: 0.9,
    reason: "이어진 이유",
    ...overrides,
  };
}

export function labNextAction(overrides: Partial<NextAction> = {}): NextAction {
  return {
    id: "na-1",
    sessionId: "s1",
    title: "다음 작업",
    priority: "medium",
    relatedIssueIds: [],
    relatedEventIds: [],
    ...overrides,
  };
}

export function labSession(overrides: Partial<MockSession> = {}): MockSession {
  return {
    project: { id: "p1", name: "Mori", description: "", createdAt: "", updatedAt: "" },
    session: {
      id: "s1",
      projectId: "p1",
      title: "재구성 테스트 세션",
      startedAt: "2026-05-22T09:00:00Z",
      endedAt: "2026-05-22T10:00:00Z",
      recordingMode: "full",
      llmProvider: "cloudApi",
      llmModel: "claude",
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
      id: "sum",
      sessionId: "s1",
      sessionSummary: "",
      resumePrompt: "",
      reportMarkdown: "",
      nextActionIds: [],
      generatedAt: "",
    },
    ...overrides,
  };
}
