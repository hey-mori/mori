/**
 * 라이브 세션 foreground driver.
 *
 * Polls every currently-active Claude Code session at once (not one picked
 * session) and accumulates each into its own `AgentStoreFollowState`, so the
 * view can merge them into one newest-first feed. "Active" = modified within a
 * recent window; the set is re-discovered periodically so a session you just
 * started appears on its own. Foreground only: pauses while the tab is hidden,
 * backs off on error, and tears down on unmount. It never writes memory or
 * drives an agent; it reads the session logs the user already connected.
 *
 * Reuses the tested pure pieces (`getClaudeCodeSessionDelta`, `appendDelta`,
 * `decideFollowCadence`); the timer and per-session offset map live here.
 */
import { useEffect, useState } from "react";
import {
  discoverClaudeCodeSessions,
  getClaudeCodeSessionDelta,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import type { ClaudeCodeSessionMeta } from "../../lib/claude/types";
import { appendDelta, decideFollowCadence, initialAgentStoreFollowState } from "../../lib/live-follow";
import type { FollowedSession } from "./liveFeed";

/** Sessions modified within this window count as active right now. */
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
/** Most sessions to follow at once, most-recently-active first. */
const MAX_SESSIONS = 8;
/** Re-discover the active set every N polls (to catch newly-started sessions). */
const REDISCOVER_EVERY = 3;
/** Cap the poll delay so a new session is picked up within a reasonable time. */
const MAX_POLL_MS = 9_000;
const HIDDEN_RECHECK_MS = 2_000;
const ERROR_BACKOFF_MS = 15_000;

export type LiveSessionsStatus = "idle" | "watching" | "unavailable";

export type LiveSessionsSnapshot = {
  status: LiveSessionsStatus;
  sessions: FollowedSession[];
  activeCount: number;
  lastPolledAt: string | null;
  lastError: string | null;
  nextDelayMs: number | null;
  aggregate: { rawLines: number; parsed: number; skipped: number; unparseable: number };
};

function empty(status: LiveSessionsStatus): LiveSessionsSnapshot {
  return {
    status,
    sessions: [],
    activeCount: 0,
    lastPolledAt: null,
    lastError: null,
    nextDelayMs: null,
    aggregate: { rawLines: 0, parsed: 0, skipped: 0, unparseable: 0 },
  };
}

export function useLiveSessions(enabled: boolean): LiveSessionsSnapshot {
  const [snapshot, setSnapshot] = useState<LiveSessionsSnapshot>(() => empty("idle"));

  useEffect(() => {
    if (!enabled) {
      setSnapshot(empty("idle"));
      return;
    }
    if (!isClaudeBridgeAvailable()) {
      setSnapshot(empty("unavailable"));
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const entries = new Map<string, FollowedSession>();
    let lastActivity = Date.now();
    let tick = 0;

    setSnapshot(empty("watching"));

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(poll, ms);
    };

    async function refreshActiveSet() {
      const all = await discoverClaudeCodeSessions();
      const now = Date.now();
      const scored = all.map((meta) => ({
        meta,
        mtime: Date.parse(meta.modifiedAt ?? meta.startedAt) || 0,
      }));
      const recent = scored.filter((s) => now - s.mtime <= ACTIVE_WINDOW_MS);
      const chosen = (recent.length > 0 ? recent : scored)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, MAX_SESSIONS);
      const keep = new Set(chosen.map((s) => s.meta.filePath));
      for (const { meta } of chosen) {
        const existing = entries.get(meta.filePath);
        if (existing) existing.meta = meta;
        else entries.set(meta.filePath, { meta, follow: initialAgentStoreFollowState() });
      }
      for (const key of [...entries.keys()]) {
        if (!keep.has(key)) entries.delete(key);
      }
    }

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule(HIDDEN_RECHECK_MS);
        return;
      }
      try {
        if (tick % REDISCOVER_EVERY === 0) {
          await refreshActiveSet();
          if (cancelled) return;
        }
        tick += 1;

        let newTotal = 0;
        for (const entry of entries.values()) {
          const delta = await getClaudeCodeSessionDelta(entry.meta.filePath, entry.follow.offset);
          if (cancelled) return;
          const { state, newEventIds } = appendDelta(entry.follow, delta);
          entry.follow = state;
          newTotal += newEventIds.length;
        }
        if (newTotal > 0) lastActivity = Date.now();

        const sessions = [...entries.values()].map((e) => ({ meta: e.meta, follow: e.follow }));
        const cadence = decideFollowCadence(
          { status: "following", msSinceLastActivity: Date.now() - lastActivity },
          // Poll briskly while work is flowing so new steps appear quickly and
          // the live view actually feels live, not frozen between polls.
          { activeIntervalMs: 2000 },
        );
        const nextDelayMs = Math.min(cadence.nextDelayMs, MAX_POLL_MS);
        setSnapshot({
          status: "watching",
          sessions,
          activeCount: sessions.length,
          lastPolledAt: new Date().toISOString(),
          lastError: null,
          nextDelayMs,
          aggregate: aggregate(sessions),
        });
        // A dashboard is meant to sit open, so it never auto-stops; it just
        // relaxes to the idle cadence when nothing is happening.
        schedule(nextDelayMs);
      } catch (error) {
        if (cancelled) return;
        setSnapshot((prev) => ({
          ...prev,
          lastError: error instanceof Error ? error.message : "라이브 세션 폴링 실패",
          nextDelayMs: ERROR_BACKOFF_MS,
        }));
        schedule(ERROR_BACKOFF_MS);
      }
    }

    schedule(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return snapshot;
}

function aggregate(sessions: readonly FollowedSession[]) {
  return sessions.reduce(
    (acc, { follow }) => ({
      rawLines: acc.rawLines + follow.stats.rawLines,
      parsed: acc.parsed + follow.stats.parsed,
      skipped: acc.skipped + follow.stats.skipped,
      unparseable: acc.unparseable + follow.stats.unparseable,
    }),
    { rawLines: 0, parsed: 0, skipped: 0, unparseable: 0 },
  );
}
