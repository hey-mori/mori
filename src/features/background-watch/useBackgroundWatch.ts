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
} from "../../lib/desktop/connectorInbox";
import { decideFollowCadence } from "../../lib/live-follow";
import {
  detectInboxChanges,
  fingerprintInbox,
  type InboxFileFingerprint,
} from "../../lib/background-watch/inboxWatch";

/** Back-off after a read error so a broken inbox does not spin. */
const ERROR_BACKOFF_MS = 60_000;

export function useBackgroundWatch(): void {
  const enabled = useBackgroundWatchStore((state) => state.settings.enabled);
  const addDetections = useBackgroundWatchStore((state) => state.addDetections);
  const baselineRef = useRef<InboxFileFingerprint[] | null>(null);
  const lastChangeRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled || !isConnectorInboxAvailable()) return;
    // Re-baseline on enable: the first reading establishes the baseline and
    // surfaces nothing, so flipping the opt-in never dumps the whole inbox.
    baselineRef.current = null;
    lastChangeRef.current = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(tick, ms);
    };

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
  }, [enabled, addDetections]);
}
