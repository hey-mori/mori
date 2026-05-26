import { useEffect, useMemo, useState } from "react";
import {
  composeNotifications,
  companionSignalToNotification,
  type MoriNotification,
  type MoriNotificationActionTarget,
} from "../../lib/notifications/notification";
import { buildImportFinishedNotifications } from "../../lib/notifications/importFinishedNotifications";
import { buildMemoryHealthNotifications } from "../../lib/notifications/memoryHealthNotifications";
import { buildPackageExportNotifications } from "../../lib/notifications/packageExportNotifications";
import {
  getCompanionSignalActionTarget,
  type CompanionSignal,
} from "../../lib/companion/companionSignals";
import { useMoriSessionStore } from "../../app/sessionStore";
import { createBrowserDraftRepository } from "../../lib/storage/localStorageAdapter";
import type { StoredMoriPackageDraft } from "../../lib/storage/storageTypes";
import { useCompanionSignals } from "./useCompanionSignals";

/**
 * Producer-neutral notifications hook.
 *
 * The Mori 노트 panel today renders Companion signals directly. As more
 * producers come online (an import-finished pulse, a memory-stale detector,
 * a package-export-ready ping), each one will emit `MoriNotification[]`,
 * and this hook composes them into the single feed the renderer consumes.
 *
 * Adding a producer is a one-line `composeNotifications` entry here — the
 * renderer never has to know about it. This keeps the seam from
 * `lib/notifications/notification.ts` live in production code, not just in
 * tests, so future producers slot in without a surface rewrite.
 *
 * Companion signals are translated into notifications with their original
 * navigation target preserved (`view` / `review` selection), so a click on
 * a "결정 6건 확인 필요" notification still opens the insights tab on the
 * right item.
 */
export function useMoriNotifications(): {
  notifications: MoriNotification[];
  isDemo: boolean;
} {
  const { feed, isDemo, acceptedMemories } = useCompanionSignals();
  const imports = useMoriSessionStore((state) => state.imports);
  const activeSessionId = useMoriSessionStore(
    (state) => state.draft?.session.id ?? null,
  );
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

  const companionNotifications = useMemo<MoriNotification[]>(
    () =>
      feed.map((signal) =>
        companionSignalToNotification(signal, resolveTarget(signal)),
      ),
    [feed],
  );

  // Second producer: "가져오기 완료" pulse for sources added within the last
  // 24 hours. The compose dedupes by id so a single batch is never doubled.
  const importFinishedNotifications = useMemo<MoriNotification[]>(
    () => buildImportFinishedNotifications({ imports }),
    [imports],
  );

  // Third producer: memory-health (stale / contradiction). One summary row
  // per category, deep-links into the 통합 surface where per-memory actions
  // already live.
  const memoryHealthNotifications = useMemo<MoriNotification[]>(
    () => buildMemoryHealthNotifications({ acceptedMemories }),
    [acceptedMemories],
  );

  // Fourth producer: "방금 내보냄" pulse for .mori packages saved within
  // the last 24h. Same recency / dedupe shape as import-finished.
  const packageExportNotifications = useMemo<MoriNotification[]>(
    () => buildPackageExportNotifications({ drafts: packageDrafts }),
    [packageDrafts],
  );

  // Order = priority for the compose-time dedupe — memory-health and fresh
  // imports/exports lead the Companion suggestions because they describe
  // state the user probably wants to clear first. Future producers slot in
  // here.
  const notifications = useMemo(
    () =>
      composeNotifications([
        memoryHealthNotifications,
        importFinishedNotifications,
        packageExportNotifications,
        companionNotifications,
      ]),
    [
      companionNotifications,
      importFinishedNotifications,
      memoryHealthNotifications,
      packageExportNotifications,
    ],
  );

  return { notifications, isDemo };
}

/**
 * Translate a Companion signal's action into the producer-neutral target
 * shape MoriNotification carries. Centralised so any producer can reuse the
 * same translation without re-implementing the Companion's quirks.
 */
function resolveTarget(signal: CompanionSignal): MoriNotificationActionTarget {
  const target = getCompanionSignalActionTarget(signal);
  if (!target) return null;
  if (target.kind === "review") {
    return { kind: "review", selection: target.selection };
  }
  return { kind: "view", view: target.view };
}

function safeListDrafts(): StoredMoriPackageDraft[] {
  if (typeof window === "undefined") return [];
  try {
    return createBrowserDraftRepository().listMoriPackageDrafts();
  } catch {
    return [];
  }
}
