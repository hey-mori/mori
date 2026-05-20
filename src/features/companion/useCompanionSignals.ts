import { useEffect, useMemo, useState } from "react";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import {
  buildCompanionSignalFeed,
  MAX_COMPANION_SIGNALS,
  type CompanionSignal,
} from "../../lib/companion/companionSignals";
import { getAcceptedMemoryRepository } from "../../lib/project-memory/acceptedMemoryRepository";

/**
 * Shared Companion Layer hook.
 *
 * Reads the active session from the store and derives the prioritised
 * companion signal set once, so every surface that shows "Mori 노트"
 * (Reports, Project Memory, Timeline) builds signals the same way instead
 * of each component re-wiring `buildCompanionSignals`.
 *
 * It also loads accepted project memory through the runtime-aware
 * repository so the signal set can flag memory that has gone stale or
 * contradicted — read-only, no writes.
 *
 * Returns both the full `feed` (every signal, for the Companion inbox)
 * and the capped `signals` set (top few, for the calm card / strip).
 */
export function useCompanionSignals(): {
  feed: CompanionSignal[];
  signals: CompanionSignal[];
  isDemo: boolean;
} {
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const imports = useMoriSessionStore((state) => state.imports);

  const projectId = view.project.id || "default";
  const [staleMemoryIds, setStaleMemoryIds] = useState<string[]>([]);
  const [contradictedMemoryIds, setContradictedMemoryIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getAcceptedMemoryRepository()
      .listAcceptedProjectMemories(projectId)
      .then((result) => {
        if (cancelled) return;
        const stale: string[] = [];
        const contradicted: string[] = [];
        for (const memory of result.data) {
          if (memory.status === "stale") stale.push(memory.id);
          else if (memory.status === "contradicted") contradicted.push(memory.id);
        }
        setStaleMemoryIds(stale);
        setContradictedMemoryIds(contradicted);
      })
      .catch(() => {
        // The repository falls back internally; a failed read just leaves
        // the memory-health signal off rather than blocking the others.
        if (!cancelled) {
          setStaleMemoryIds([]);
          setContradictedMemoryIds([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
      }),
    [mode, view, hasAnalysis, imports.length, staleMemoryIds, contradictedMemoryIds],
  );

  const signals = useMemo(
    () => feed.slice(0, MAX_COMPANION_SIGNALS),
    [feed],
  );

  return { feed, signals, isDemo: mode === "demo" };
}
