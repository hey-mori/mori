/**
 * Continuous auto-import driver.
 *
 * While enabled (default on) and running on the desktop, this polls the unified
 * cross-agent discovery on a calm cadence, diffs it against what was already
 * registered, and upserts a metadata-only draft for every new or grown session
 * so it appears in the 세션 workspace's 과거 list without a manual import. One
 * aggregate notification is pushed per pass that brought something in.
 *
 * Doctrine: this REGISTERS sessions (makes them visible + reopenable), it never
 * applies to durable memory — the review gate still governs analyze→apply. It
 * reads only the connected agents' own logs (scope), notifies on every sync
 * (transparency), and a registration is reversible. It pauses while the tab is
 * hidden and backs off on error; foreground-only, never a daemon.
 */
import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../app/sessionStore";
import { isClaudeBridgeAvailable } from "../../lib/claude/claudeTauri";
import { listAllAgentWorkSessions } from "../../lib/agents/workSessions";
import {
  agentSessionFingerprint,
  agentSessionToStoredDraft,
  autoImportedSessionId,
  diffDiscoveredSessions,
  seenFingerprintsFromMetas,
} from "../../lib/agents/autoImportSessions";
import {
  loadAutoImportMetas,
  upsertAutoImportMetas,
} from "../../lib/agents/autoImportMetaStore";
import {
  AUTO_IMPORT_SETTINGS_CHANGED_EVENT,
  loadAutoImportSettings,
} from "../../lib/agents/autoImportSettings";
import { buildSessionSyncNotification } from "../../lib/notifications/sessionSyncNotifications";

/** Calm cadence: discovery parses files, so we poll gently, not tightly. */
const VISIBLE_INTERVAL_MS = 90_000;
/** First pass shortly after launch so 과거 populates quickly. */
const FIRST_PASS_MS = 4_000;
/** While the tab is hidden we do not discover; re-check cheaply. */
const HIDDEN_RECHECK_MS = 5_000;
/** After a read error, back off before retrying. */
const ERROR_BACKOFF_MS = 120_000;

export function useAutoImportSessions(): void {
  const registerDiscoveredSessions = useSessionStore(
    (state) => state.registerDiscoveredSessions,
  );
  const pushImportSyncNotification = useSessionStore(
    (state) => state.pushImportSyncNotification,
  );

  const [enabled, setEnabled] = useState(
    () => isClaudeBridgeAvailable() && loadAutoImportSettings().enabled,
  );

  // React to the settings toggle (and cross-tab changes) without a reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () =>
      setEnabled(isClaudeBridgeAvailable() && loadAutoImportSettings().enabled);
    window.addEventListener(AUTO_IMPORT_SETTINGS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTO_IMPORT_SETTINGS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const seenRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    // Seed the "seen" set from the reopen metas we persisted last session, so a
    // fresh launch does not re-flag every already-registered session as new.
    seenRef.current = seenFingerprintsFromMetas(loadAutoImportMetas());

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(HIDDEN_RECHECK_MS);
        return;
      }
      let nextMs = VISIBLE_INTERVAL_MS;
      try {
        const discovered = await listAllAgentWorkSessions();
        if (!cancelled) {
          const diff = diffDiscoveredSessions(discovered, seenRef.current);
          if (diff.toUpsert.length > 0) {
            registerDiscoveredSessions(diff.toUpsert.map(agentSessionToStoredDraft));
            upsertAutoImportMetas(diff.toUpsert);
            for (const meta of diff.toUpsert) {
              seenRef.current.set(autoImportedSessionId(meta), agentSessionFingerprint(meta));
            }
            const notice = buildSessionSyncNotification({
              newCount: diff.newCount,
              updatedCount: diff.updatedCount,
              at: new Date().toISOString(),
            });
            if (notice) pushImportSyncNotification(notice);
          }
        }
      } catch {
        nextMs = ERROR_BACKOFF_MS;
      }
      schedule(nextMs);
    }

    schedule(FIRST_PASS_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, registerDiscoveredSessions, pushImportSyncNotification]);
}
