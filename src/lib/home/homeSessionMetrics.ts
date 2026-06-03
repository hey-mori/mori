/**
 * Gather the cheap per-session carry-forward counts (issues / decisions / next
 * actions) from each stored memory body, for the home overview's derivations.
 *
 * Never re-parses raw imports: a session with no analysis simply contributes an
 * empty snapshot (honest by absence). Demo sessions read their reviewed work
 * from the bundled fixtures, since that content lives in the demo content module
 * rather than localStorage — so a fresh demo-only install still reflects its
 * "분석 완료" sessions instead of looking empty.
 */
import type { createBrowserDraftRepository } from "../storage/localStorageAdapter";
import { isDemoSessionId } from "../demo/demoSessionFixtures";
import { buildDemoSessionContent } from "../demo/demoSessionContent";
import { isNextActionCompleted } from "../session/nextActionCompletion";
import type { StoredSessionSummary } from "../storage/storageTypes";
import type { HomeSessionMetricSnapshot } from "./homeOverview";

type DraftRepository = ReturnType<typeof createBrowserDraftRepository>;

export function gatherSessionMetrics(
  storedSessions: StoredSessionSummary[],
  repository: DraftRepository,
): HomeSessionMetricSnapshot[] {
  return storedSessions.map((session) => {
    if (isDemoSessionId(session.sessionId)) {
      const demo = buildDemoSessionContent(session.sessionId);
      if (demo) {
        return {
          sessionId: session.sessionId,
          hasReconstructedWork: true,
          issues: demo.issues.length,
          openIssues: demo.issues.filter((issue) => issue.status === "open")
            .length,
          decisions: demo.decisions.length,
          unconfirmedDecisions: demo.decisions.filter((d) => !d.confirmed).length,
          pendingNextActions: demo.nextActions.filter(
            (a) => !isNextActionCompleted(a),
          ).length,
        };
      }
    }

    let body;
    try {
      body = repository.loadSessionMemoryBody(session.sessionId);
    } catch {
      body = null;
    }
    if (!body) return { sessionId: session.sessionId };

    const openIssues = body.issues.filter((issue) => issue.status === "open")
      .length;
    const unconfirmedDecisions = body.decisions.filter((d) => !d.confirmed)
      .length;
    const pendingNextActions = body.nextActions.filter(
      (a) => !isNextActionCompleted(a),
    ).length;
    const hasReconstructedWork =
      body.issues.length > 0 ||
      body.decisions.length > 0 ||
      body.nextActions.length > 0 ||
      Boolean(body.summarySnapshot);

    return {
      sessionId: session.sessionId,
      hasReconstructedWork,
      issues: body.issues.length,
      openIssues,
      decisions: body.decisions.length,
      unconfirmedDecisions,
      pendingNextActions,
    };
  });
}
