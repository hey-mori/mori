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
import { holdReplacedSessions } from "../../lib/session/heldReplacedSessions";
import { keptArchiveIdentityLookup } from "../../lib/session/sessionArchiveRead";
import { useEffect, useRef, useState } from "react";
import { loadStoredSessionSummaries, useSessionStore } from "../../app/sessionStore";
import { useStorageHealthStore } from "../../app/storageHealthStore";
import { isClaudeBridgeAvailable } from "../../lib/claude/claudeTauri";
import { listAllAgentWorkSessions } from "../../lib/trace/sources/ai/workSessions";
import {
  agentSessionFingerprint,
  agentSessionToStoredDraft,
  autoImportedSessionId,
  carryForwardRepository,
  diffDiscoveredSessions,
  isAutoImportedSessionId,
  seenFingerprintsFromMetas,
} from "../../lib/session/autoImportSessions";
import { upsertAgentSessionRecords } from "../../lib/record-kernel/agentSessionRecordAdapter";
import { getKernelRepository } from "../../lib/record-kernel/kernelRepository";
import { createSchemaRegistry } from "../../lib/record-kernel/schemaRegistry";
import { sessionsWithKeptEvidence } from "../../lib/session/retentionInventory";
import { sessionIdsWithStoredImports } from "../../lib/storage/localStorageAdapter";
import { getAppStorage } from "../../lib/storage/appStorage";
import { prepareDurableReads } from "../../app/durableReads";
import {
  loadAutoImportMetas,
  replaceEmptySources,
  setProtectedDescriptorIds,
  upsertAutoImportMetas,
} from "../../lib/session/autoImportMetaStore";
import {
  AUTO_IMPORT_SETTINGS_CHANGED_EVENT,
  loadAutoImportSettings,
} from "../../lib/session/autoImportSettings";
import { buildSessionSyncNotification } from "../../lib/notifications/sessionSyncNotifications";

/** Auto-register only the most-recent N discovered sessions, so the localStorage
 *  draft set + the seen-fingerprint set stay bounded on a long-lived multi-agent
 *  install (older sessions can still be opened via the record browser). Must be
 *  ≤ the reopen-meta cap so the seed never misses a registered session.
 *  Sessions kept for an archive or passage add to the metas beyond it. */
const REGISTER_CAP = 400;
/** Calm cadence: discovery parses files, so we poll gently, not tightly. */
const VISIBLE_INTERVAL_MS = 90_000;
/** First pass shortly after launch so 과거 populates quickly. */
const FIRST_PASS_MS = 4_000;
/** While the tab is hidden we do not discover; re-check cheaply. */
const HIDDEN_RECHECK_MS = 5_000;
/** After a read error, back off before retrying. */
const ERROR_BACKOFF_MS = 120_000;
/** How long the set of sessions Mori keeps something of is trusted before
 *  the kernel is read again for it. Errs toward keeping. */
const KEPT_REFRESH_MS = 30 * 60_000;

export function useAutoImportSessions(): void {
  const registerDiscoveredSessions = useSessionStore(
    (state) => state.registerDiscoveredSessions,
  );
  const pruneAutoImportedSessions = useSessionStore(
    (state) => state.pruneAutoImportedSessions,
  );
  const pushImportSyncNotification = useSessionStore(
    (state) => state.pushImportSyncNotification,
  );

  // When app storage (localStorage) is full, every draft write throws a quota
  // error. Registering more sessions would just fail again and re-notify on
  // every poll, so auto-import goes DORMANT until the failure clears (the user
  // frees space). This is the loop-breaker: it never hammers a full store.
  const quotaFailure = useStorageHealthStore((state) => state.lastQuotaFailure);

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
  const keptRef = useRef<{ ids: Set<string>; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Storage is full · stay dormant so we neither fail writes nor re-notify on
    // a loop. The effect re-runs when the failure clears (a later successful
    // write or the user clearing it), and auto-import resumes then.
    if (quotaFailure) return;
    // Seed the "seen" set from the reopen metas we persisted last session, so a
    // fresh launch does not re-flag every already-registered session as new.
    // Seeded in the first pass, after the read source is decided: on a
    // restored profile the descriptors arrive with the SQLite reads, and an
    // empty seed would announce every known session as new.
    let seeded = false;

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
        if (!seeded) {
          await prepareDurableReads();
          if (cancelled) return;
          seenRef.current = seenFingerprintsFromMetas(loadAutoImportMetas());
          seeded = true;
          // Know what Mori keeps from the first pass on, so the descriptor
          // cap protects it before any prune has had to ask.
          const sources = await getKernelRepository().listSources();
          if (cancelled) return;
          if (!sources.fellBack) {
            keptRef.current = { ids: sessionsWithKeptEvidence(sources.data), at: Date.now() };
          }
        }
        setProtectedDescriptorIds(
          new Set([
            ...(keptRef.current?.ids ?? []),
            ...sessionIdsWithStoredImports(getAppStorage() ?? window.localStorage),
          ]),
          // Without the kernel's answer the cap must not drop durable copies.
          { complete: keptRef.current !== null },
        );
        const listed = await listAllAgentWorkSessions();
        const stored = new Map(loadAutoImportMetas().map((meta) => [autoImportedSessionId(meta), meta]));
        // A kept session whose file is now another conversation keeps its own
        // descriptor. The kernel is asked only when such a session is listed.
        const keptIds = keptRef.current?.ids;
        const keptListed = listed.some((meta) => meta.sourceId && keptIds?.has(autoImportedSessionId(meta)));
        const keptLookup = keptListed ? await keptArchiveIdentityLookup() : null;
        const discovered = keptLookup
          ? holdReplacedSessions(listed, stored, (id) => keptLookup(id)?.sourceId ?? null)
          : listed;
        if (!cancelled) {
          // Bound to the most-recent window so the draft + seen sets stay small.
          // A partial rescan does not erase a checkout a fuller read found.
          const recent = [
            ...discovered.map((meta) => carryForwardRepository(meta, stored.get(autoImportedSessionId(meta)))),
          ]
            .sort((a, b) => activityMs(b) - activityMs(a))
            .slice(0, REGISTER_CAP);

          const diff = diffDiscoveredSessions(recent, seenRef.current);
          // Empty sources are never registered, so they stay out of `seen` and
          // reappear here every poll: this is the full current list.
          replaceEmptySources(diff.emptySources);
          if (diff.toUpsert.length > 0) {
            const written = new Set(
              registerDiscoveredSessions(diff.toUpsert.map(agentSessionToStoredDraft)),
            );
            // Only mark + notify for sessions that actually persisted, so a
            // quota-failed write is retried next pass instead of lost.
            const persisted = diff.toUpsert.filter((meta) =>
              written.has(autoImportedSessionId(meta)),
            );
            if (persisted.length > 0) {
              // Descriptors of sessions Mori keeps something of are exempt
              // from the recency cap (the protected set published above).
              upsertAutoImportMetas(persisted);
              let newCount = 0;
              let updatedCount = 0;
              for (const meta of persisted) {
                const id = autoImportedSessionId(meta);
                if (seenRef.current.has(id)) updatedCount += 1;
                else newCount += 1;
                seenRef.current.set(id, agentSessionFingerprint(meta));
              }
              const notice = buildSessionSyncNotification({
                newCount,
                updatedCount,
                at: new Date().toISOString(),
              });
              if (notice) pushImportSyncNotification(notice);

              // Dual-write (S2): mirror each registered session as an
              // agent-session kernel record so it reaches 검색 · 캘린더 · 프로젝트.
              // A known session is merged, never replaced, so the user's edits
              // survive its growth. Best-effort and self-contained: a kernel
              // failure never undoes the legacy registration above.
              void upsertAgentSessionRecords(
                getKernelRepository(),
                createSchemaRegistry(),
                persisted,
              );
            }
          }

          // Prune placeholders that dropped out of the recent window (keeping
          // any the user opened) so 과거 does not accumulate stale stubs.
          const keep = new Set(recent.map((meta) => autoImportedSessionId(meta)));
          // A session Mori keeps an archive or a passage of stays, so what was
          // kept still opens after the agent removes the original. The kernel
          // is read only for a would-be-pruned session the cached kept set has
          // not seen (or when that set is stale), and a fallback read (which
          // on the desktop is not the real kernel) skips pruning this pass.
          const imported = sessionIdsWithStoredImports(getAppStorage() ?? window.localStorage);
          const candidates = loadStoredSessionSummaries()
            .map((summary) => summary.sessionId)
            .filter((id) => isAutoImportedSessionId(id) && !keep.has(id) && !imported.has(id));
          let canPrune = true;
          if (candidates.length > 0) {
            const cached = keptRef.current;
            const stale = !cached || Date.now() - cached.at > KEPT_REFRESH_MS;
            if (stale || candidates.some((id) => !cached.ids.has(id))) {
              const sources = await getKernelRepository().listSources();
              if (cancelled) return;
              if (sources.fellBack) canPrune = false;
              else keptRef.current = { ids: sessionsWithKeptEvidence(sources.data), at: Date.now() };
            }
            for (const id of keptRef.current?.ids ?? []) keep.add(id);
          }
          if (canPrune) {
            for (const removedId of pruneAutoImportedSessions(keep)) {
              seenRef.current.delete(removedId);
            }
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
  }, [
    enabled,
    quotaFailure,
    registerDiscoveredSessions,
    pruneAutoImportedSessions,
    pushImportSyncNotification,
  ]);
}

/** Millisecond activity time for recency sorting; 0 when unparseable. */
function activityMs(meta: { updatedAt: string; startedAt: string }): number {
  const ms = Date.parse(meta.updatedAt || meta.startedAt || "");
  return Number.isNaN(ms) ? 0 : ms;
}
