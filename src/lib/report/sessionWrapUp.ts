export type SessionWrapUpStepId = "capture" | "review" | "memory" | "handoff";

export type SessionWrapUpStepStatus = "done" | "ready" | "attention" | "waiting";

export type SessionWrapUpActionId =
  | "addEvidence"
  | "runQuickPass"
  | "reviewMemory"
  | "reviewMemoryHealth"
  | "reviewHandoff"
  | "waitForAnalysis";

export type SessionWrapUpInput = {
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  importCount: number;
  hasAnalysis: boolean;
  analysisRunning: boolean;
  canRunQuickPass: boolean;
  acceptedMemoryCount: number;
  auditActionCount: number;
  staleMemoryCount: number;
  contradictedMemoryCount: number;
  resumePromptReady: boolean;
};

export type SessionWrapUpStep = {
  id: SessionWrapUpStepId;
  label: string;
  status: SessionWrapUpStepStatus;
  statusLabel: string;
  detail: string;
};

export type SessionWrapUpAction = {
  id: SessionWrapUpActionId;
  label: string;
  detail: string;
  enabled: boolean;
};

export type SessionWrapUpViewModel = {
  steps: SessionWrapUpStep[];
  primaryAction: SessionWrapUpAction;
};

export function buildSessionWrapUp(input: SessionWrapUpInput): SessionWrapUpViewModel {
  const hasEvidence = input.sourceCount > 0 || input.eventCount > 0 || input.importCount > 0;
  const hasReviewedWork =
    input.hasAnalysis ||
    input.issueCount > 0 ||
    input.decisionCount > 0 ||
    input.nextActionCount > 0;
  const attentionMemoryCount = input.staleMemoryCount + input.contradictedMemoryCount;

  const steps: SessionWrapUpStep[] = [
    {
      id: "capture",
      label: "Evidence captured",
      status: hasEvidence ? "done" : "attention",
      statusLabel: hasEvidence ? "Ready" : "Needs source",
      detail: hasEvidence
        ? `${input.sourceCount} source${plural(input.sourceCount)} and ${input.eventCount} timeline event${plural(input.eventCount)} are in this session.`
        : "Add an explicit source before Mori can build a durable handoff.",
    },
    {
      id: "review",
      label: "Session reviewed",
      status: input.analysisRunning ? "waiting" : hasReviewedWork ? "done" : hasEvidence ? "ready" : "attention",
      statusLabel: input.analysisRunning ? "Running" : hasReviewedWork ? "Reviewed" : hasEvidence ? "Ready" : "Waiting",
      detail: input.analysisRunning
        ? "Quick Pass is running; review output will appear when it finishes."
        : hasReviewedWork
          ? `${input.issueCount} issue${plural(input.issueCount)}, ${input.decisionCount} decision${plural(input.decisionCount)}, and ${input.nextActionCount} next action${plural(input.nextActionCount)} are available.`
          : hasEvidence
            ? "Run Quick Pass to turn captured evidence into issues, decisions, and next actions."
            : "Review starts after evidence has been imported.",
    },
    {
      id: "memory",
      label: "Project memory saved",
      status:
        input.acceptedMemoryCount > 0
          ? attentionMemoryCount > 0
            ? "attention"
            : "done"
          : hasReviewedWork
            ? "ready"
            : "attention",
      statusLabel:
        input.acceptedMemoryCount > 0
          ? attentionMemoryCount > 0
            ? "Needs review"
            : "Saved"
          : hasReviewedWork
            ? "Review"
            : "Not yet",
      detail:
        input.acceptedMemoryCount > 0
          ? attentionMemoryCount > 0
            ? `${input.acceptedMemoryCount} accepted memor${input.acceptedMemoryCount === 1 ? "y" : "ies"} saved; ${describeAttentionMemory(input)} before handoff.`
            : `${input.acceptedMemoryCount} accepted memor${input.acceptedMemoryCount === 1 ? "y" : "ies"} with ${input.auditActionCount} audit action${plural(input.auditActionCount)}.`
          : hasReviewedWork
            ? "Open Project Memory when you want reviewed facts to become durable accepted memory."
            : "Accepted memory appears after the session has reviewed material.",
    },
    {
      id: "handoff",
      label: "Continue-later handoff",
      status: input.resumePromptReady ? "ready" : hasEvidence ? "attention" : "waiting",
      statusLabel: input.resumePromptReady ? "Ready" : hasEvidence ? "Needs review" : "Waiting",
      detail: input.resumePromptReady
        ? "Resume Prompt and .mori export are ready below."
        : "A useful handoff needs evidence plus Quick Pass or demo summary data.",
    },
  ];

  return {
    steps,
    primaryAction: choosePrimaryAction(input, { hasEvidence, hasReviewedWork }),
  };
}

function choosePrimaryAction(
  input: SessionWrapUpInput,
  derived: { hasEvidence: boolean; hasReviewedWork: boolean },
): SessionWrapUpAction {
  if (!derived.hasEvidence) {
    return {
      id: "addEvidence",
      label: "Add evidence",
      detail: "Start with an explicit import so the handoff has a source trail.",
      enabled: true,
    };
  }
  if (input.analysisRunning) {
    return {
      id: "waitForAnalysis",
      label: "Quick Pass running",
      detail: "Mori is still deriving review material from the captured evidence.",
      enabled: false,
    };
  }
  if (!derived.hasReviewedWork) {
    return {
      id: "runQuickPass",
      label: "Run Quick Pass",
      detail: "Create issues, decisions, next actions, and a stronger Resume Prompt.",
      enabled: input.canRunQuickPass,
    };
  }
  if (input.acceptedMemoryCount === 0) {
    return {
      id: "reviewMemory",
      label: "Review Project Memory",
      detail: "Decide what should become durable accepted memory before the next session.",
      enabled: true,
    };
  }
  if (input.staleMemoryCount + input.contradictedMemoryCount > 0) {
    return {
      id: "reviewMemoryHealth",
      label: "Review memory health",
      detail: `${describeAttentionMemory(input)} before using memory in reports or resume prompts.`,
      enabled: true,
    };
  }
  return {
    id: "reviewHandoff",
    label: "Review handoff",
    detail: "Copy the Resume Prompt or export a .mori package for the next work session.",
    enabled: true,
  };
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function describeAttentionMemory(input: Pick<SessionWrapUpInput, "staleMemoryCount" | "contradictedMemoryCount">): string {
  const parts: string[] = [];
  if (input.staleMemoryCount > 0) {
    parts.push(`${input.staleMemoryCount} stale`);
  }
  if (input.contradictedMemoryCount > 0) {
    parts.push(`${input.contradictedMemoryCount} contradicted`);
  }
  const count = input.staleMemoryCount + input.contradictedMemoryCount;
  return `${count} accepted memor${count === 1 ? "y needs" : "ies need"} lifecycle review${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
}
