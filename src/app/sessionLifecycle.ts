/**
 * Session lifecycle — the unified snapshot of "what session are we showing,
 * where is it stored, how long has it been running, what's its data basis?"
 *
 * This module sits ABOVE the two existing helpers
 *   - `src/lib/session/sessionTiming.ts`  (start / duration / live tick)
 *   - `src/lib/session/sessionStatus.ts`  (mode / source / data basis)
 * and bundles their outputs into one snapshot so UI components only have to
 * subscribe to one helper. Both legacy helpers remain importable and are
 * tested independently — this module composes them, it doesn't replace them.
 *
 * The snapshot intentionally does **not** import the React `useMoriSessionStore`
 * hook. Components hand in the relevant state slices so the helper can be
 * tested without React.
 */
import type { MoriMockSession, Session } from "../domain/types";
import { deriveSessionTiming, type SessionTimingSnapshot } from "../lib/session/sessionTiming";
import { deriveSessionStatus, type SessionStatusLabels } from "../lib/session/sessionStatus";
import { moriMockSession } from "../domain/mock-data";
import type { MoriSessionState } from "./sessionStore";

export type SessionStorageScope =
  | "demo"
  | "browser-draft"
  | "desktop-sqlite"
  | "ended";

export type SessionLifecycleSnapshot = {
  timing: SessionTimingSnapshot;
  status: SessionStatusLabels;
  /** Storage scope label suitable for the sidebar session card and Settings. */
  storageScope: SessionStorageScope;
  storageScopeLabel: string;
  storageScopeDetail: string;
  /** True when the session is the demo (no draft). */
  isDemo: boolean;
  /** True when the session is a real draft (any storage scope). */
  isDraft: boolean;
  /** True when the timing snapshot says we should re-render every second. */
  isLive: boolean;
  /** Sentence describing what data the current view is based on. */
  dataBasisLabel: string;
};

const STORAGE_SCOPE_DETAIL: Record<SessionStorageScope, string> = {
  demo: "Reference data only",
  "browser-draft": "Saved in browser localStorage",
  "desktop-sqlite": "Saved to local SQLite",
  ended: "Session has ended",
};

const STORAGE_SCOPE_LABEL: Record<SessionStorageScope, string> = {
  demo: "Demo",
  "browser-draft": "Browser Draft",
  "desktop-sqlite": "Desktop SQLite",
  ended: "Ended",
};

/**
 * Compose the lifecycle snapshot from a session-store state. Accepts a
 * `demoSession` override so tests can use a deterministic baseline.
 */
export function deriveSessionLifecycle(
  state: MoriSessionState,
  options: {
    view?: MoriMockSession;
    demoSession?: Session;
    now?: number;
    viewCounts?: Parameters<typeof deriveSessionStatus>[1];
  } = {},
): SessionLifecycleSnapshot {
  const demoSession = options.demoSession ?? moriMockSession.session;
  const timing = deriveSessionTiming({
    draft: state.draft,
    demoSession,
    analysisStatus: state.analysisStatus,
    now: options.now,
  });
  const status = deriveSessionStatus(state, options.viewCounts);

  const isDemo = !state.draft;
  const isDraft = Boolean(state.draft);

  const storageScope: SessionStorageScope = isDemo
    ? "demo"
    : timing.state === "ended"
      ? "ended"
      : state.source === "desktop-sqlite"
        ? "desktop-sqlite"
        : "browser-draft";

  return {
    timing,
    status,
    storageScope,
    storageScopeLabel: STORAGE_SCOPE_LABEL[storageScope],
    storageScopeDetail: STORAGE_SCOPE_DETAIL[storageScope],
    isDemo,
    isDraft,
    isLive: timing.isLive,
    dataBasisLabel: status.dataBasisLabel,
  };
}

/**
 * Tiny convenience helpers that don't need the full snapshot — useful when a
 * caller just wants the duration or storage scope without re-deriving.
 */
export function getSessionDurationMs(snapshot: SessionLifecycleSnapshot): number {
  return snapshot.timing.durationSeconds * 1000;
}

export function formatSessionDuration(snapshot: SessionLifecycleSnapshot): string {
  return snapshot.timing.durationLabel;
}

export function getSessionLifecycleStatus(snapshot: SessionLifecycleSnapshot) {
  return snapshot.timing.state;
}

export function getSessionStorageScope(snapshot: SessionLifecycleSnapshot): SessionStorageScope {
  return snapshot.storageScope;
}

export function getSessionDataBasisLabel(snapshot: SessionLifecycleSnapshot): string {
  return snapshot.dataBasisLabel;
}
