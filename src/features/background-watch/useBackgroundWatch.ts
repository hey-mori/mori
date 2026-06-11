/**
 * Background watch hook — the opt-in inbox watcher.
 *
 * While the opt-in is on and the desktop runtime is present, this re-reads the
 * connector inbox listing on an adaptive cadence (`decideFollowCadence`, brisk
 * right after a change and backing off when the inbox is quiet) and surfaces
 * newly-arrived or grown connector files into the review tray via the store.
 * Unlike Live Follow (one followed session), this watches the whole inbox for
 * NEW agent work, so a session that ran while you were elsewhere is waiting to
 * be reviewed. It does NOT pause while the tab is hidden — detecting work that
 * arrived while you were away is the point — and it never imports or analyses on
 * its own; a detection is a review pointer, nothing more. Desktop-only: the
 * browser has no inbox, so it stays idle.
 */
import { useEffect, useRef } from "react";
import { useBackgroundWatchStore } from "../../app/backgroundWatchStore";
import {
  isConnectorInboxAvailable,
  listConnectorJsonlInbox,
  readConnectorJsonlFile,
} from "../../lib/desktop/connectorInbox";
import { decideFollowCadence } from "../../lib/live-follow";
import {
  runBackgroundAnalysis,
} from "../../lib/background-watch/backgroundAnalysis";
import {
  detectInboxChanges,
  fingerprintInbox,
  type InboxFileFingerprint,
} from "../../lib/background-watch/inboxWatch";
import {
  buildProviderConfigFromSettings,
  resolveQuickPassProvider,
} from "../../lib/analysis/quickPassProvider";
import { useSessionStore } from "../../app/sessionStore";
import type { InboxChange } from "../../lib/background-watch/inboxWatch";

/** Back-off after a read error so a broken inbox does not spin. */
const ERROR_BACKOFF_MS = 60_000;

export function useBackgroundWatch(): void {
  const enabled = useBackgroundWatchStore((state) => state.settings.enabled);
  const autoAnalyze = useBackgroundWatchStore((state) => state.settings.autoAnalyze);
  const addDetections = useBackgroundWatchStore((state) => state.addDetections);
  const addAnalysisResult = useBackgroundWatchStore((state) => state.addAnalysisResult);
  const analysisSettings = useSessionStore((state) => state.analysisSettings);
  const baselineRef = useRef<InboxFileFingerprint[] | null>(null);
  const lastChangeRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled || !isConnectorInboxAvailable()) return;
    // Re-baseline on enable so turning it on never dumps the whole inbox.
    baselineRef.current = null;
    lastChangeRef.current = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(tick, ms);
    };

    async function analyzeChanges(changes: readonly InboxChange[]): Promise<void> {
      // Only new files are analysed — an updated file whose analysis already ran
      // is not re-analysed automatically, to avoid burning quota on partial writes.
      const toAnalyze = changes.filter((c) => c.kind === "new");
      if (toAnalyze.length === 0) return;
      const provider = resolveQuickPassProvider(buildProviderConfigFromSettings(analysisSettings));
      for (const change of toAnalyze) {
        if (cancelled) break;
        try {
          const file = await readConnectorJsonlFile(change.path);
          const outcome = await runBackgroundAnalysis({
            path: change.path,
            text: file.text,
            provider,
          });
          if (outcome.ok) addAnalysisResult(outcome.result);
          // Failures are silent — detection already surfaced the file; the
          // user can always import and analyse manually from the 소스 view.
        } catch {
          // Transient error (file gone, inbox unavailable) — skip silently.
        }
      }
    }

    async function tick() {
      if (cancelled) return;
      let nextMs = ERROR_BACKOFF_MS;
      try {
        const listing = await listConnectorJsonlInbox();
        const current = listing.rootExists ? fingerprintInbox(listing.files) : [];
        const changes = detectInboxChanges(baselineRef.current, current);
        baselineRef.current = current;
        if (changes.length > 0) {
          lastChangeRef.current = Date.now();
          addDetections(changes, new Date().toISOString());
          if (autoAnalyze) void analyzeChanges(changes);
        }
        nextMs = decideFollowCadence({
          status: "following",
          msSinceLastActivity: Date.now() - lastChangeRef.current,
        }).nextDelayMs;
      } catch {
        // Inbox unavailable / transient — keep the baseline and back off.
      }
      schedule(nextMs);
    }

    schedule(decideFollowCadence({ status: "following", msSinceLastActivity: 0 }).nextDelayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, autoAnalyze, addDetections, addAnalysisResult, analysisSettings]);
}
