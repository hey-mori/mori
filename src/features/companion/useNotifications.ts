import { useEffect, useMemo, useState } from "react";
import {
  composeNotifications,
  type CompanionNotification,
} from "../../lib/notifications/notification";
import { buildBackgroundAnalysisNotifications } from "../../lib/notifications/backgroundAnalysisNotifications";
import { buildBackgroundDetectionNotifications } from "../../lib/notifications/backgroundDetectionNotifications";
import { buildImportFinishedNotifications } from "../../lib/notifications/importFinishedNotifications";
import { buildPackageExportNotifications } from "../../lib/notifications/packageExportNotifications";
import { buildSessionFeedNotifications } from "../../lib/notifications/notificationFeed";
import {
  loadStoredSessionSummaries,
  useSessionStore,
} from "../../app/sessionStore";
import { mergeDemoSessionSummaries } from "../../lib/demo/demoSessionFixtures";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import type {
  StoredMoriPackageDraft,
  StoredSessionSummary,
} from "../../lib/storage/storageTypes";
import { useBackgroundWatchStore } from "../../app/backgroundWatchStore";
import { useStorageHealthStore } from "../../app/storageHealthStore";
import { buildStorageHealthNotifications } from "../../lib/notifications/storageHealthNotifications";
import { useCompanionSignals } from "./useCompanionSignals";

/**
 * Producer-neutral notifications hook.
 *
 * The Mori 노트 panel today renders Companion signals directly. As more
 * producers come online (an import-finished pulse, a memory-stale detector,
 * a package-export-ready ping), each one will emit `CompanionNotification[]`,
 * and this hook composes them into the single feed the renderer consumes.
 *
 * Adding a producer is a one-line `composeNotifications` entry here — the
 * renderer never has to know about it. This keeps the seam from
 * `lib/notifications/notification.ts` live in production code, not just in
 * tests, so future producers slot in without a surface rewrite.
 *
 * The feed is an *event* stream — things that happened across sessions
 * (captured / analyzed / imported / memory went stale / exported). It is
 * deliberately NOT the Companion's current-session triage ("결정 N건 확인 필요"):
 * that is standing state, not an event, and it already has a home on the
 * dashboard and the session's 검토 tab — surfacing it here too is what made the
 * notification panel read as a triage dashboard instead of a feed.
 */
export function useNotifications(): {
  notifications: CompanionNotification[];
  isDemo: boolean;
} {
  const { isDemo } = useCompanionSignals();
  const imports = useSessionStore((state) => state.imports);
  const followNotifications = useSessionStore((state) => state.followNotifications);
  const liveNotifications = useSessionStore((state) => state.liveNotifications);
  const importSyncNotifications = useSessionStore((state) => state.importSyncNotifications);
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? null,
  );
  const dataResetNonce = useSessionStore((state) => state.dataResetNonce);
  // Bumped by the background auto-import pass, so the per-session feed rows keep
  // pace with the 과거 list (which keys on the same nonce).
  const sessionListNonce = useSessionStore((state) => state.sessionListNonce);
  const backgroundDetections = useBackgroundWatchStore((state) => state.detections);
  const backgroundAnalysisResults = useBackgroundWatchStore((state) => state.analysisResults);

  // Cross-session feed source: every stored session becomes a timestamped
  // event. Re-read when work changes (active session / new import / reset /
  // background auto-import) so the feed stays live without a background watcher.
  const [summaries, setSummaries] = useState<StoredSessionSummary[]>(() =>
    safeListSummaries(),
  );
  useEffect(() => {
    setSummaries(safeListSummaries());
  }, [activeSessionId, imports.length, dataResetNonce, sessionListNonce]);
  // Recent .mori package drafts — re-read whenever the active session
  // changes (a reasonable proxy for "the user did something Reports-y").
  // The dedupe in `composeNotifications` keeps the row to a single entry
  // even if two reads in the same tick both surface the same draft.
  const [packageDrafts, setPackageDrafts] = useState<StoredMoriPackageDraft[]>(
    () => safeListDrafts(),
  );
  useEffect(() => {
    setPackageDrafts(safeListDrafts());
  }, [activeSessionId, imports.length]);

  // First producer: "가져오기 완료" pulse for sources added within the last
  // 24 hours. The compose dedupes by id so a single batch is never doubled.
  const importFinishedNotifications = useMemo<CompanionNotification[]>(
    () => buildImportFinishedNotifications({ imports }),
    [imports],
  );

  // (Retired) The legacy memory-health producer (stale / contradiction) used to
  // deep-link into the pre-kernel 메모리 통합 surface. That surface is retired
  // from the product (durable memory is now the 기록 record ledger), so it no
  // longer pushes notifications. The consolidation route stays in code but is
  // unwired from the bell, the palette, and home.

  // Fourth producer: "방금 내보냄" pulse for .mori packages saved within
  // the last 24h. Same recency / dedupe shape as import-finished.
  const packageExportNotifications = useMemo<CompanionNotification[]>(
    () => buildPackageExportNotifications({ drafts: packageDrafts }),
    [packageDrafts],
  );

  // Fifth producer: the cross-session feed — one timestamped event per stored
  // session. This is what turns the surface from active-session triage into a
  // real activity stream ("이 세션이 정리됐습니다 · 프로젝트 · 2시간 전").
  const sessionFeedNotifications = useMemo<CompanionNotification[]>(
    () => buildSessionFeedNotifications(mergeDemoSessionSummaries(summaries)),
    [summaries],
  );

  // Sixth producer: the background watch's inbox detections — newly-arrived or
  // grown connector files surfaced while the app is open, deep-linking into the
  // 소스 surface where the review-gated import lives.
  const backgroundDetectionNotifications = useMemo<CompanionNotification[]>(
    () => buildBackgroundDetectionNotifications(backgroundDetections),
    [backgroundDetections],
  );

  // Seventh producer: completed background analyses — each result is a
  // reviewable finding, pointing at the 자료 surface. Nothing was applied.
  const backgroundAnalysisNotifications = useMemo<CompanionNotification[]>(
    () => buildBackgroundAnalysisNotifications(backgroundAnalysisResults),
    [backgroundAnalysisResults],
  );

  // Eighth producer: storage health — the most recent quota failure, i.e.
  // "your last save did not complete". Risk-severity, state-grounded,
  // routes to Settings where the storage surface lives.
  const lastQuotaFailure = useStorageHealthStore((state) => state.lastQuotaFailure);
  const storageHealthNotifications = useMemo<CompanionNotification[]>(
    () => buildStorageHealthNotifications(lastQuotaFailure),
    [lastQuotaFailure],
  );

  // Compose order = compose-time dedupe priority (a notification raised by two
  // producers in one tick appears once, taking the earlier producer's copy).
  // The *display* order is recency — set below — so the feed reads as a stream.
  const notifications = useMemo(
    () =>
      sortNotificationsByRecency(
        composeNotifications([
          storageHealthNotifications,
          followNotifications,
          liveNotifications,
          importSyncNotifications,
          importFinishedNotifications,
          packageExportNotifications,
          sessionFeedNotifications,
          backgroundDetectionNotifications,
          backgroundAnalysisNotifications,
        ]),
      ),
    [
      storageHealthNotifications,
      followNotifications,
      liveNotifications,
      importSyncNotifications,
      importFinishedNotifications,
      packageExportNotifications,
      sessionFeedNotifications,
      backgroundDetectionNotifications,
      backgroundAnalysisNotifications,
    ],
  );

  return { notifications, isDemo };
}

/**
 * Display order for the feed: newest first. A notice without `createdAt` (e.g.
 * a freshly detected memory-health issue) sorts to the very top as "방금".
 */
function sortNotificationsByRecency(list: CompanionNotification[]): CompanionNotification[] {
  return [...list].sort((left, right) => recency(right) - recency(left));
}

function recency(notification: CompanionNotification): number {
  if (!notification.createdAt) return Number.POSITIVE_INFINITY;
  const time = new Date(notification.createdAt).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function safeListSummaries(): StoredSessionSummary[] {
  try {
    return loadStoredSessionSummaries();
  } catch {
    return [];
  }
}

function safeListDrafts(): StoredMoriPackageDraft[] {
  if (typeof window === "undefined") return [];
  try {
    return createBrowserDraftRepository().listMoriPackageDrafts();
  } catch {
    return [];
  }
}
