import type { Decision, Issue, NextAction } from "../../domain/types";
import { isNextActionCompleted } from "../session/nextActionCompletion";

/**
 * Cross-session project synthesis.
 *
 * The individual project page should answer "what has this project actually
 * been working on" across *all* its sessions — not just list session titles.
 * This pure helper rolls a project's per-session content up into a compact
 * synthesis: the key (confirmed) decisions, the still-open issues, and the
 * pending next actions, each tagged with the session it came from.
 *
 * It is deterministic and content-agnostic: the caller maps each session
 * (demo fixture or stored memory body) into `ProjectSessionContent`, and the
 * sessions are expected in display order (most recent first), which the
 * aggregation preserves.
 */

export type ProjectSessionContent = {
  sessionId: string;
  title: string;
  issues: ReadonlyArray<Issue>;
  decisions: ReadonlyArray<Decision>;
  nextActions: ReadonlyArray<NextAction>;
};

export type SynthItem = {
  text: string;
  sessionId: string;
  sessionTitle: string;
};

export type ProjectSynthesis = {
  /** True when at least one session contributed any content. */
  hasContent: boolean;
  /** How many of the project's sessions had loadable content. */
  sessionsWithContent: number;
  /** Decisions recorded across the project's sessions, capped. */
  decisions: SynthItem[];
  /** Still-open issues across the project, capped. */
  openIssues: SynthItem[];
  /** Pending (incomplete) next actions across the project, capped. */
  pendingNextActions: SynthItem[];
  /** Full counts before the cap, for the summary line. */
  totals: {
    decisions: number;
    openIssues: number;
    pendingNextActions: number;
  };
};

const DEFAULT_CAP = 5;

function clean(text: string | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

export function buildProjectSynthesis(
  sessions: ReadonlyArray<ProjectSessionContent>,
  options?: { cap?: number },
): ProjectSynthesis {
  const cap = options?.cap ?? DEFAULT_CAP;

  const decisions: SynthItem[] = [];
  const openIssues: SynthItem[] = [];
  const pendingNextActions: SynthItem[] = [];
  let decisionTotal = 0;
  let openIssueTotal = 0;
  let pendingActionTotal = 0;
  let sessionsWithContent = 0;

  for (const session of sessions) {
    const contributed =
      session.issues.length > 0 ||
      session.decisions.length > 0 ||
      session.nextActions.length > 0;
    if (contributed) sessionsWithContent += 1;

    for (const decision of session.decisions) {
      const text = clean(decision.title) ?? clean(decision.decision);
      if (!text) continue;
      decisionTotal += 1;
      decisions.push({ text, sessionId: session.sessionId, sessionTitle: session.title });
    }

    for (const issue of session.issues) {
      if (issue.status !== "open") continue;
      const text = clean(issue.title) ?? clean(issue.description);
      if (!text) continue;
      openIssueTotal += 1;
      openIssues.push({ text, sessionId: session.sessionId, sessionTitle: session.title });
    }

    for (const action of session.nextActions) {
      if (isNextActionCompleted(action)) continue;
      const text = clean(action.title);
      if (!text) continue;
      pendingActionTotal += 1;
      pendingNextActions.push({ text, sessionId: session.sessionId, sessionTitle: session.title });
    }
  }

  return {
    hasContent:
      decisions.length > 0 || openIssues.length > 0 || pendingNextActions.length > 0,
    sessionsWithContent,
    decisions: decisions.slice(0, cap),
    openIssues: openIssues.slice(0, cap),
    pendingNextActions: pendingNextActions.slice(0, cap),
    totals: {
      decisions: decisionTotal,
      openIssues: openIssueTotal,
      pendingNextActions: pendingActionTotal,
    },
  };
}
