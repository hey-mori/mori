import { useEffect, useMemo, useState } from "react";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import {
  buildCompanionSignalFeed,
  MAX_COMPANION_SIGNALS,
  type CompanionSignal,
} from "../../lib/companion/companionSignals";
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";
import { buildMoriPackageExportPlan } from "../../lib/report/moriPackageExportPlan";
import { buildHandoffReadiness } from "../../lib/report/handoffReadiness";
import type {
  StoredAcceptedProjectMemory,
  StoredMemoryReviewAction,
} from "../../lib/storage/storageTypes";

/**
 * Shared Companion Layer hook.
 *
 * Reads the active session from the store and derives the prioritised
 * companion signal set once, so every surface that shows "Mori 노트"
 * (Reports, Project Memory, Timeline) builds signals the same way instead
 * of each component re-wiring `buildCompanionSignals`.
 *
 * It also loads accepted project memory and the review-action audit trail
 * through the runtime-aware repository so the signal set can:
 *  - flag memory that has gone stale or contradicted (read-only, no writes),
 *  - and route ready_to_report / ready_to_resume severity through the
 *    finish-work readiness model — so when memory needs review or evidence
 *    is missing, the continuation signals escalate to "review" with the
 *    matching readiness item's detail as message, rather than calmly
 *    suggesting a handoff that is not actually ready.
 *
 * Returns both the full `feed` (every signal, for the Companion inbox)
 * and the capped `signals` set (top few, for the calm card / strip).
 */
export function useCompanionSignals(): {
  feed: CompanionSignal[];
  signals: CompanionSignal[];
  isDemo: boolean;
  acceptedMemories: StoredAcceptedProjectMemory[];
} {
  const view = useSessionStore(selectSessionView);
  const mode = useSessionStore(selectSessionMode);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const imports = useSessionStore((state) => state.imports);

  const projectId = view.project.id || "default";
  const [acceptedMemories, setAcceptedMemories] = useState<StoredAcceptedProjectMemory[]>([]);
  const [reviewActions, setReviewActions] = useState<StoredMemoryReviewAction[]>([]);

  useEffect(() => {
    let cancelled = false;
    const repository = getAcceptedMemoryRepository();
    void repository
      .listAcceptedProjectMemories(projectId)
      .then((result) => {
        if (cancelled) return;
        setAcceptedMemories(result.data);
      })
      .catch(() => {
        // The repository falls back internally; a failed read just leaves
        // the memory-health signal off rather than blocking the others.
        if (!cancelled) setAcceptedMemories([]);
      });
    void repository
      .listMemoryReviewActions(projectId)
      .then((result) => {
        if (cancelled) return;
        setReviewActions(result.data);
      })
      .catch(() => {
        if (!cancelled) setReviewActions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const { staleMemoryIds, contradictedMemoryIds } = useMemo(() => {
    const stale: string[] = [];
    const contradicted: string[] = [];
    for (const memory of acceptedMemories) {
      if (memory.status === "stale") stale.push(memory.id);
      else if (memory.status === "contradicted") contradicted.push(memory.id);
    }
    return { staleMemoryIds: stale, contradictedMemoryIds: contradicted };
  }, [acceptedMemories]);

  const handoffReadiness = useMemo(() => {
    // Skip the readiness model in demo mode — the demo session is synthetic
    // and the continuation signals fall back to the legacy state gates,
    // which already render an honest demo notice.
    if (mode === "demo") return undefined;
    const exportPlan = buildMoriPackageExportPlan({
      view,
      consolidatedMemories: acceptedMemories,
      auditTrail: reviewActions,
    });
    return buildHandoffReadiness({
      sourceCount: view.sources.length,
      eventCount: view.events.length,
      issueCount: view.issues.length,
      decisionCount: view.decisions.length,
      nextActionCount: view.nextActions.length,
      hasAnalysis,
      analysisRunning: false,
      canRunQuickPass: imports.length > 0,
      acceptedMemoryCount: acceptedMemories.length,
      staleMemoryCount: staleMemoryIds.length,
      contradictedMemoryCount: contradictedMemoryIds.length,
      resumePromptReady: view.events.length > 0,
      exportPlan,
    });
  }, [
    mode,
    view,
    hasAnalysis,
    imports.length,
    acceptedMemories,
    reviewActions,
    staleMemoryIds.length,
    contradictedMemoryIds.length,
  ]);

  const feed = useMemo(
    () =>
      buildCompanionSignalFeed({
        sessionMode: mode,
        events: view.events,
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
        hasAnalysis,
        importCount: imports.length,
        staleMemoryIds,
        contradictedMemoryIds,
        handoffReadiness,
      }),
    [mode, view, hasAnalysis, imports.length, staleMemoryIds, contradictedMemoryIds, handoffReadiness],
  );

  const signals = useMemo(
    () => feed.slice(0, MAX_COMPANION_SIGNALS),
    [feed],
  );

  return { feed, signals, isDemo: mode === "demo", acceptedMemories };
}
