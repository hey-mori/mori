import type { ViewKey } from "../../domain/types";
import type {
  CompanionSignal,
  CompanionSignalBasis,
  CompanionSignalSeverity,
} from "../companion/companionSignals";
import type { ReviewSelection } from "../review-workspace/reviewWorkspace";

/**
 * Mori notifications seam.
 *
 * Today the bottom-left "Mori 노트" indicator surfaces companion signals
 * derived from already-imported session data. Tomorrow we'll want to surface
 * other classes of notice — an import that finished, a piece of accepted
 * memory that has gone stale, an OS-native ping when a long-running connector
 * inbox refresh completes — without bolting each one onto the companion
 * pipeline directly.
 *
 * This module defines a **producer-neutral notification record** plus an
 * adapter from the existing `CompanionSignal`. Any future surface that needs
 * to raise a notice should emit `CompanionNotification` — the rendering layer
 * (AttentionIndicator / Companion Inbox) only needs to understand this shape.
 *
 * Hard rules carried over from the Companion layer:
 *  - Notifications are derived from already-present, user-reviewed data — no
 *    background watcher, no raw source text inside a notification.
 *  - Each notification carries an honest `basis` so the user can judge it.
 *  - `evidenceRefs` traces the notification back to the originating
 *    timeline-event ids when available; an empty list means the notification
 *    is grounded in product state (e.g. "demo mode"), not new evidence.
 *
 * Keep this module pure and synchronous so a future producer can plug in
 * deterministically and without an extra async layer.
 */

/**
 * Open-ended notification kind. Each kind names what the notification is
 * *about*, not who produced it — so a Companion-derived notice and an
 * import-pipeline notice can both raise the same `import_ready` kind if the
 * meaning matches. Adding a new kind is a documentation step (extend this
 * union) and the renderer's icon / tone map.
 */
export type CompanionNotificationKind =
  // Currently emitted via the Companion adapter.
  | "demo_mode_notice"
  | "real_session_gap"
  | "import_ready"
  | "weak_evidence"
  | "needs_review"
  | "unresolved_issue"
  | "important_decision"
  | "stale_memory"
  | "suggested_next_action"
  | "ready_to_report"
  | "ready_to_resume"
  // Reserved for future producers — listed up front so the renderer can map
  // them to icons without a follow-up edit when the producer lands.
  | "memory_stale_detected"
  | "memory_contradiction_detected"
  | "import_finished"
  | "package_export_ready";

export type CompanionNotificationSeverity = CompanionSignalSeverity;
export type CompanionNotificationBasis = CompanionSignalBasis;

/**
 * Producer-neutral action target. A notification can deep-link the renderer
 * into one of three things:
 *  - a `view` (the standing top-bar destinations + the off-nav surfaces),
 *  - a `review` selection (a specific issue / decision / next action), or
 *  - `null` for an informational notice with no destination.
 */
export type CompanionNotificationActionTarget =
  | { kind: "view"; view: ViewKey }
  | { kind: "review"; selection: ReviewSelection }
  // Open a specific session in the unified workspace (feed items about a
  // particular session deep-link straight to it rather than the browser).
  | { kind: "session"; sessionId: string }
  | null;

export type CompanionNotification = {
  id: string;
  kind: CompanionNotificationKind;
  severity: CompanionNotificationSeverity;
  title: string;
  message: string;
  basis: CompanionNotificationBasis;
  /** Linked structured records (issue / decision / next-action / memory ids). */
  linkedItemIds: string[];
  /** Originating timeline event ids — empty for state-grounded notices. */
  evidenceRefs: string[];
  /** Calm verb framing the action ("검토", "이어가기"). */
  actionLabel: string;
  /** Destination when the action is taken; `null` for informational notes. */
  actionTarget: CompanionNotificationActionTarget;
  /**
   * Optional creation timestamp. Companion-derived notifications omit this
   * because they are recomputed on every render; pushed notifications (e.g. an
   * import-finished notice) set it so the renderer can age them out.
   */
  createdAt?: string;
  /**
   * Where the notification came from — surfaced as the feed's "프로젝트 · 세션"
   * meta line so a cross-session feed reads as "what happened where". Optional:
   * current-session triage notices may omit it.
   */
  source?: {
    /** Short project name (trailing path segment), e.g. "ng-gw". */
    projectLabel?: string;
    /** The session the event is about. */
    sessionTitle?: string;
    /** Session id, for deep-linking. */
    sessionId?: string;
  };
};

/**
 * Adapt a Companion signal into a producer-neutral notification.
 *
 * Mapping is intentionally lossless: every field on the signal that is
 * meaningful for rendering is preserved, and the renderer never has to know
 * the signal originated from the Companion layer.
 */
export function companionSignalToNotification(
  signal: CompanionSignal,
  actionTarget: CompanionNotificationActionTarget,
): CompanionNotification {
  return {
    id: signal.id,
    // The companion signal type is a strict subset of CompanionNotificationKind.
    kind: signal.type,
    severity: signal.severity,
    title: signal.title,
    message: signal.message,
    basis: signal.basis,
    linkedItemIds: signal.linkedItemIds,
    evidenceRefs: signal.evidenceRefs,
    actionLabel: signal.actionLabel,
    actionTarget,
  };
}

/**
 * Compose ordered notification feeds from multiple producers, preserving each
 * producer's internal order. Producers earlier in the list rank higher when
 * the renderer caps the visible feed; ids are deduplicated so a notification
 * raised by two producers in the same tick appears once.
 *
 * Renderer surfaces (AttentionIndicator, Companion Inbox) should always
 * consume the composed feed, never a single producer's output directly — so
 * adding a new producer is a one-line registration step here, not a fan-out
 * across every consumer.
 */
export function composeNotifications(
  feeds: ReadonlyArray<ReadonlyArray<CompanionNotification>>,
): CompanionNotification[] {
  const seen = new Set<string>();
  const out: CompanionNotification[] = [];
  for (const feed of feeds) {
    for (const notification of feed) {
      if (seen.has(notification.id)) continue;
      seen.add(notification.id);
      out.push(notification);
    }
  }
  return out;
}
