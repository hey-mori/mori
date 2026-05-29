import type {
  Decision,
  Issue,
  IssueStatus,
  NextAction,
  Priority,
  Project,
  Relationship,
  Session,
  SourceRef,
  Summary,
  TimelineEvent,
  TrustLevel,
} from "../../domain/types";

export type AnalysisProviderName = "deterministic-heuristic-v1" | "ollama-quick-pass-v1";

export type AnalysisRunStatus = "idle" | "running" | "succeeded" | "failed";

export type AnalysisInput = {
  project: Project;
  session: Session;
  sources: SourceRef[];
  events: TimelineEvent[];
  existingIssues?: Issue[];
  existingDecisions?: Decision[];
  existingRelationships?: Relationship[];
  now?: string;
};

export type AnalysisIssueCandidate = Omit<Issue, "id" | "projectId" | "sessionId" | "createdAt" | "updatedAt"> & {
  rationale: string;
};

export type AnalysisDecisionCandidate = Omit<Decision, "id" | "projectId" | "sessionId" | "createdAt"> & {
  rationale: string;
};

export type AnalysisRelationshipCandidate = Omit<Relationship, "id">;

export type AnalysisNextActionCandidate = Omit<NextAction, "id" | "sessionId">;

export type AnalysisSummary = {
  sessionSummary: string;
  resumePrompt: string;
  highlights: string[];
};

export type AnalysisResult = {
  runId: string;
  providerName: AnalysisProviderName;
  providerLabel: string;
  sessionId: string;
  projectId: string;
  generatedAt: string;
  durationMs: number;
  inputEventCount: number;
  inputSourceCount: number;
  summary: AnalysisSummary;
  issues: Issue[];
  decisions: Decision[];
  relationships: Relationship[];
  nextActions: NextAction[];
  rendered: {
    summary: Summary;
  };
  confidence: number;
  notes: string[];
};

export type AnalysisProvider = {
  readonly name: AnalysisProviderName;
  readonly label: string;
  readonly requiresNetwork: boolean;
  analyze: (input: AnalysisInput) => Promise<AnalysisResult>;
};

export type AnalysisExtraction = {
  issues: AnalysisIssueCandidate[];
  decisions: AnalysisDecisionCandidate[];
  relationships: AnalysisRelationshipCandidate[];
  nextActions: AnalysisNextActionCandidate[];
  summary: AnalysisSummary;
  confidence: number;
  notes: string[];
};

export type AnalysisCandidateContext = {
  trustLevel: TrustLevel;
  priority: Priority;
  status: IssueStatus;
  confidence: number;
};
