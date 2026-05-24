import type { StoredMoriPackageDraft } from "../storage/storageTypes";
import { getPackageIsClientSafe } from "../mori-package";
import type { MoriNotification } from "./notification";

/**
 * Build "방금 내보냄" notifications from recent .mori package drafts.
 *
 * Mirrors the import-finished producer's shape so the renderer never has to
 * special-case export vs. import pulses: stable per-draft id
 * (`package-export:<packageId>`), capped count, 24h recency window. Older
 * drafts are part of the project history, not "fresh" notifications, and
 * the dedupe in `composeNotifications` keeps a redundant raise to a single
 * row even if storage is read twice in the same tick.
 *
 * The notification carries no destination — exports already live on the
 * Reports surface, so the action label is informational ("리포트 열기")
 * and routes back to the reports view via the standard producer-neutral
 * action target.
 */

/** Default recency window — drafts older than 24h aren't "fresh". */
const DEFAULT_RECENCY_MS = 24 * 60 * 60 * 1000;

/** Cap so a long history of drafts never floods the panel. */
const DEFAULT_LIMIT = 3;

export type BuildPackageExportNotificationsInput = {
  drafts: ReadonlyArray<StoredMoriPackageDraft>;
  /** Reference time for the recency check. Defaults to `Date.now()`. */
  now?: number;
  /** Override for the 24h window — tests pin this. */
  recencyMs?: number;
  /** Override for the visible cap — tests pin this. */
  limit?: number;
};

export function buildPackageExportNotifications(
  input: BuildPackageExportNotificationsInput,
): MoriNotification[] {
  const now = input.now ?? Date.now();
  const recencyMs = input.recencyMs ?? DEFAULT_RECENCY_MS;
  const limit = input.limit ?? DEFAULT_LIMIT;

  const recent = [...input.drafts]
    .filter((entry) => {
      const epoch = new Date(entry.savedAt).getTime();
      if (Number.isNaN(epoch)) return false;
      const age = now - epoch;
      return age >= 0 && age <= recencyMs;
    })
    .sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
    .slice(0, limit);

  return recent.map(toNotification);
}

function toNotification(draft: StoredMoriPackageDraft): MoriNotification {
  const clientSafe = getPackageIsClientSafe(draft.package);
  const variant = clientSafe ? "클라이언트 공유용" : ".mori 패키지";
  return {
    id: `package-export:${draft.packageId}`,
    kind: "package_export_ready",
    severity: "info",
    title: `${variant} 내보냄`,
    message: draft.packageId,
    basis: "verified",
    linkedItemIds: [draft.packageId],
    evidenceRefs: [],
    actionLabel: "리포트 열기",
    actionTarget: { kind: "view", view: "reports" },
    createdAt: draft.savedAt,
  };
}
