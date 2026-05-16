import { useMemo } from "react";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import {
  buildCompanionSignals,
  type CompanionSignal,
} from "../../lib/companion/companionSignals";

/**
 * Shared Companion Layer hook.
 *
 * Reads the active session from the store and derives the prioritised
 * companion signal set once, so every surface that shows "Mori 노트"
 * (Reports, Project Memory, …) builds signals the same way instead of
 * each component re-wiring `buildCompanionSignals`.
 */
export function useCompanionSignals(): {
  signals: CompanionSignal[];
  isDemo: boolean;
} {
  const view = useMoriSessionStore(selectSessionView);
  const mode = useMoriSessionStore(selectSessionMode);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const imports = useMoriSessionStore((state) => state.imports);

  const signals = useMemo(
    () =>
      buildCompanionSignals({
        sessionMode: mode,
        events: view.events,
        issues: view.issues,
        decisions: view.decisions,
        nextActions: view.nextActions,
        hasAnalysis,
        importCount: imports.length,
      }),
    [mode, view, hasAnalysis, imports.length],
  );

  return { signals, isDemo: mode === "demo" };
}
