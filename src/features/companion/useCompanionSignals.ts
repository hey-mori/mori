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
import type { StoredAcceptedProjectMemory } from "../../lib/storage/storageTypes";

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
 * contradicted — read-only, no writes. The full list is exposed so
 * surfaces like the Companion Inbox can resolve a signal's
 * `linkedItemIds` into titles without re-loading the memories.
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
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const imports = useMoriSessionStore((state) => state.imports);

  const projectId = view.project.id || "default";
  const [acceptedMemories, setAcceptedMemories] = useState<StoredAcceptedProjectMemory[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getAcceptedMemoryRepository()
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

  return { feed, signals, isDemo: mode === "demo", acceptedMemories };
}
