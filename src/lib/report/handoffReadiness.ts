import type { MoriPackageExportPlan } from "./moriPackageExportPlan";

export type HandoffReadinessStatus = "ready" | "attention" | "waiting";

export type HandoffReadinessActionId =
  | "copyResume"
  | "runQuickPass"
  | "addEvidence"
  | "reviewMemory"
  | "reviewMemoryHealth"
  | "openReportBuilder"
  | "openPackageExport";

export type HandoffReadinessAction = {
  id: HandoffReadinessActionId;
  label: string;
  enabled: boolean;
};

export type HandoffReadinessItemId = "resume" | "report" | "package";

export type HandoffReadinessItem = {
  id: HandoffReadinessItemId;
  title: string;
  status: HandoffReadinessStatus;
  statusLabel: string;
  detail: string;
  basis: string[];
  action: HandoffReadinessAction;
};

export type HandoffReadinessViewModel = {
  headline: string;
  detail: string;
  items: HandoffReadinessItem[];
};

export type HandoffReadinessInput = {
  sourceCount: number;
  eventCount: number;
  issueCount: number;
  decisionCount: number;
  nextActionCount: number;
  hasAnalysis: boolean;
  analysisRunning: boolean;
  canRunQuickPass: boolean;
  acceptedMemoryCount: number;
  staleMemoryCount: number;
  contradictedMemoryCount: number;
  resumePromptReady: boolean;
  exportPlan: MoriPackageExportPlan;
};

export function buildHandoffReadiness(
  input: HandoffReadinessInput,
): HandoffReadinessViewModel {
  const hasEvidence = input.sourceCount > 0 || input.eventCount > 0;
  const hasReview =
    input.hasAnalysis ||
    input.issueCount > 0 ||
    input.decisionCount > 0 ||
    input.nextActionCount > 0;
  const packageHasContent =
    hasEvidence ||
    input.acceptedMemoryCount > 0 ||
    input.exportPlan.full.auditRows > 0;

  const items: HandoffReadinessItem[] = [
    buildResumeItem(input, { hasEvidence, hasReview }),
    buildReportItem(input, { hasEvidence, hasReview }),
    buildPackageItem(input, { packageHasContent }),
  ];
  const readyCount = items.filter((item) => item.status === "ready").length;
  const attentionCount = items.filter((item) => item.status === "attention").length;
  const attentionMemoryCount = countAttentionMemory(input);

  return {
    headline:
      readyCount === items.length
        ? "Continue-later handoff is ready"
        : `${readyCount} of ${items.length} handoff outputs are ready`,
    detail:
      attentionMemoryCount > 0
        ? "Review accepted-memory health before relying on this handoff later."
        : attentionCount > 0
        ? "Review the attention items before sharing outside this session."
        : "Choose the output that matches the next person or tool.",
    items,
  };
}

function buildResumeItem(
  input: HandoffReadinessInput,
  derived: { hasEvidence: boolean; hasReview: boolean },
): HandoffReadinessItem {
  if (input.resumePromptReady) {
    if (countAttentionMemory(input) > 0) {
      return {
        id: "resume",
        title: "Resume Prompt",
        status: "attention",
        statusLabel: "Memory review",
        detail: "A continuation prompt is available, but accepted memory needs lifecycle review first.",
        basis: [
          derived.hasReview ? "Uses reviewed session output when available." : "Uses captured session summary data.",
          describeAttentionMemory(input),
        ],
        action: { id: "reviewMemoryHealth", label: "Review memory", enabled: true },
      };
    }
    return {
      id: "resume",
      title: "Resume Prompt",
      status: "ready",
      statusLabel: "Ready",
      detail: "A continuation prompt is available for Claude, Codex, ChatGPT, or your next session.",
      basis: [
        derived.hasReview ? "Uses reviewed session output when available." : "Uses captured session summary data.",
        input.acceptedMemoryCount > 0
          ? `${input.acceptedMemoryCount} accepted memory record${plural(input.acceptedMemoryCount)} can inform continuation.`
          : "No accepted memory has been saved yet.",
      ],
      action: { id: "copyResume", label: "Copy prompt", enabled: true },
    };
  }

  if (input.analysisRunning) {
    return {
      id: "resume",
      title: "Resume Prompt",
      status: "waiting",
      statusLabel: "Running",
      detail: "Quick Pass is still deriving review material.",
      basis: ["The prompt will become stronger when analysis finishes."],
      action: { id: "runQuickPass", label: "Quick Pass running", enabled: false },
    };
  }

  if (derived.hasEvidence) {
    return {
      id: "resume",
      title: "Resume Prompt",
      status: "attention",
      statusLabel: "Needs review",
      detail: "Run Quick Pass to create a stronger evidence-based continuation prompt.",
      basis: [`${input.sourceCount} source${plural(input.sourceCount)} and ${input.eventCount} event${plural(input.eventCount)} are captured.`],
      action: { id: "runQuickPass", label: "Run Quick Pass", enabled: input.canRunQuickPass },
    };
  }

  return {
    id: "resume",
    title: "Resume Prompt",
    status: "waiting",
    statusLabel: "Waiting",
    detail: "Add explicit evidence before Mori can produce useful continuation context.",
    basis: ["Mori does not infer work from hidden monitoring."],
    action: { id: "addEvidence", label: "Add evidence", enabled: true },
  };
}

function buildReportItem(
  input: HandoffReadinessInput,
  derived: { hasEvidence: boolean; hasReview: boolean },
): HandoffReadinessItem {
  if (!derived.hasEvidence) {
    return {
      id: "report",
      title: "Report",
      status: "waiting",
      statusLabel: "Waiting",
      detail: "Reports can be generated, but an empty report is not a useful handoff.",
      basis: ["Capture a source first so report sections cite real evidence."],
      action: { id: "addEvidence", label: "Add evidence", enabled: true },
    };
  }

  if (!derived.hasReview) {
    return {
      id: "report",
      title: "Report",
      status: "attention",
      statusLabel: "Draft",
      detail: "Markdown and HTML export are available, but the report has no reviewed issues or decisions yet.",
      basis: [
        `${input.sourceCount} source${plural(input.sourceCount)} and ${input.eventCount} event${plural(input.eventCount)} are included.`,
        "Run Quick Pass before sharing a decision-oriented report.",
      ],
      action: { id: "openReportBuilder", label: "Open builder", enabled: true },
    };
  }

  if (countAttentionMemory(input) > 0) {
    return {
      id: "report",
      title: "Report",
      status: "attention",
      statusLabel: "Memory review",
      detail: "Report export is available, but memory-backed context needs lifecycle review before sharing.",
      basis: [
        `${input.issueCount} issue${plural(input.issueCount)}, ${input.decisionCount} decision${plural(input.decisionCount)}, ${input.nextActionCount} next action${plural(input.nextActionCount)}.`,
        describeAttentionMemory(input),
      ],
      action: { id: "reviewMemoryHealth", label: "Review memory", enabled: true },
    };
  }

  return {
    id: "report",
    title: "Report",
    status: "ready",
    statusLabel: "Ready",
    detail: "Report Builder can export a selected Markdown or HTML report from reviewed session state.",
    basis: [
      `${input.issueCount} issue${plural(input.issueCount)}, ${input.decisionCount} decision${plural(input.decisionCount)}, ${input.nextActionCount} next action${plural(input.nextActionCount)}.`,
      input.acceptedMemoryCount > 0
        ? "Accepted Memory can be included by report audience."
        : "Project memory is not yet accepted; live-session sections still export.",
    ],
    action: { id: "openReportBuilder", label: "Review report", enabled: true },
  };
}

function buildPackageItem(
  input: HandoffReadinessInput,
  derived: { packageHasContent: boolean },
): HandoffReadinessItem {
  if (!derived.packageHasContent) {
    return {
      id: "package",
      title: ".mori Package",
      status: "waiting",
      statusLabel: "Waiting",
      detail: "A package can be created, but it would not carry useful evidence yet.",
      basis: ["Add evidence before exporting a handoff package."],
      action: { id: "addEvidence", label: "Add evidence", enabled: true },
    };
  }

  const full = input.exportPlan.full;
  const safe = input.exportPlan.clientSafe;
  const excludesMemory = safe.droppedMemories > 0 || safe.droppedAuditRows > 0;
  const attentionMemoryCount = countAttentionMemory(input);
  const needsMemoryReview = attentionMemoryCount > 0;
  const status: HandoffReadinessStatus = excludesMemory || needsMemoryReview ? "attention" : "ready";

  return {
    id: "package",
    title: ".mori Package",
    status,
    statusLabel: needsMemoryReview ? "Memory review" : excludesMemory ? "Review safety" : "Ready",
    detail: needsMemoryReview
      ? "A package can be exported, but accepted memory health should be reviewed before handoff."
      : excludesMemory
      ? "Full export and client-safe export are available; client-safe will intentionally omit some memory history."
      : "Full export and client-safe export are available from the package panel.",
    basis: [
      `Full: ${full.sources} source${plural(full.sources)}, ${full.events} event${plural(full.events)}, ${full.memories} memory record${plural(full.memories)}, ${full.auditRows} audit row${plural(full.auditRows)}.`,
      `Client-safe: keeps ${safe.memories} memory record${plural(safe.memories)} and omits ${safe.droppedMemories} memory record${plural(safe.droppedMemories)} / ${safe.droppedAuditRows} audit row${plural(safe.droppedAuditRows)}.`,
      ...(needsMemoryReview ? [describeAttentionMemory(input)] : []),
    ],
    action: {
      id: needsMemoryReview ? "reviewMemoryHealth" : "openPackageExport",
      label: needsMemoryReview ? "Review memory" : "Review exports",
      enabled: true,
    },
  };
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function countAttentionMemory(
  input: Pick<HandoffReadinessInput, "staleMemoryCount" | "contradictedMemoryCount">,
): number {
  return input.staleMemoryCount + input.contradictedMemoryCount;
}

function describeAttentionMemory(
  input: Pick<HandoffReadinessInput, "staleMemoryCount" | "contradictedMemoryCount">,
): string {
  const parts: string[] = [];
  if (input.staleMemoryCount > 0) parts.push(`${input.staleMemoryCount} stale`);
  if (input.contradictedMemoryCount > 0) {
    parts.push(`${input.contradictedMemoryCount} contradicted`);
  }
  const count = countAttentionMemory(input);
  return `${count} accepted memor${count === 1 ? "y needs" : "ies need"} lifecycle review${parts.length > 0 ? ` (${parts.join(", ")})` : ""}.`;
}
