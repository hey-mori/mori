import type { MoriMockSession } from "../../domain/types";
import { isNextActionCompleted } from "../session/nextActionCompletion";

export function buildResumePrompt(data: MoriMockSession): string {
  const lastDecisions = data.decisions
    .slice(0, 5)
    .map((decision) => `- ${decision.title}: ${decision.decision}`)
    .join("\n");
  const openIssues = data.issues
    .filter((issue) => issue.status !== "resolved")
    .slice(0, 5)
    .map((issue, index) => `${index + 1}. ${issue.title}: ${issue.suggestedNextAction}`)
    .join("\n");
  const files = data.artifacts
    .filter((artifact) => artifact.path)
    .map((artifact) => `- ${artifact.path}`)
    .join("\n");
  // Completed actions are not future work — keep them out of the resume.
  const nextActions = data.nextActions
    .filter((action) => !isNextActionCompleted(action))
    .map((action) => `- ${action.title}`)
    .join("\n");

  return `You are continuing a product design and engineering session for Mori.

Mori remembers how the work happened. It is a local-first AI work memory app that records selected AI work sessions and reconstructs them into a timeline, flow focus, issues, decisions, resume prompts, reports, and .mori packages.

Last decisions:
${lastDecisions}

Open issues:
${openIssues}

Files touched:
${files}

Next actions:
${nextActions}

Continue from this context and help turn the next production slice into working, validated code.`;
}
