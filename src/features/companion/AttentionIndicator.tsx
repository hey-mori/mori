import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Bell, CheckCheck, X } from "lucide-react";
import { useAppStore } from "../../app/store";
import { useSessionStore } from "../../app/sessionStore";
import { useNotificationReadStore } from "../../app/notificationReadStore";
import type { ViewKey } from "../../domain/types";
import type {
  CompanionNotification,
  CompanionNotificationActionTarget,
} from "../../lib/notifications/notification";
import { notificationIcon } from "../../lib/notifications/notificationPresentation";
import {
  loadNotificationPreferences,
  NOTIFICATION_PREFERENCES_CHANGED_EVENT,
  type NotificationToastPosition,
} from "../../lib/settings/notificationPreferences";
import type { ReviewSelection } from "../../lib/review-workspace/reviewWorkspace";
import { useBackgroundWatch } from "../background-watch/useBackgroundWatch";
import { useAutoImportSessions } from "../background-watch/useAutoImportSessions";
import { useNotifications } from "./useNotifications";
import { useOsNotifications } from "./useOsNotifications";
import { NotificationFeedList } from "./NotificationFeedList";
import { isDerivedFromHistory, toastArrival } from "../../lib/notifications/toastArrival";

/**
 * 알림 — the notification bell + a right-side notification drawer.
 *
 * Clicking the bell slides a full-height drawer in from the right edge (a
 * non-blocking "notification center"), showing the producer-neutral
 * `CompanionNotification[]` feed newest first, grouped by time. A drawer — not a
 * small popover or a centered modal — because the feed is a cross-session
 * stream that grows: it needs room and a scroll, but must never block the
 * canvas. The badge is an *unread* count, capped at 9+; a fresh arrival flashes
 * a toast once.
 *
 * Read-state lives in `useNotificationReadStore` (the feed is recomputed every
 * render). Clicking a row marks it read and navigates; "모두 읽음" clears the
 * badge. The drawer is portaled to <body> so no transformed/overflow ancestor
 * can clip it.
 */

/** Above this, the badge shows "9+" so a busy bell never overflows its pill. */
const BADGE_CAP = 9;

const TOAST_POSITION_CLASS: Record<NotificationToastPosition, string> = {
  topRight: "toast-top-right",
  topLeft: "toast-top-left",
  bottomRight: "toast-bottom-right",
  bottomLeft: "toast-bottom-left",
};

export function AttentionIndicator({
  onNavigate,
  compact = false,
}: {
  onNavigate: (view: ViewKey) => void;
  /** Icon-only quick-action button (sidebar head) when true; labelled pill otherwise. */
  compact?: boolean;
}) {
  // Opt-in background watch: while enabled (and on desktop), watch the connector
  // inbox and feed detections into the notification feed below. No-op otherwise.
  useBackgroundWatch();
  // Continuously register discovered agent sessions into 과거 (desktop, opt-out).
  useAutoImportSessions();
  const { notifications } = useNotifications();
  useOsNotifications(notifications);
  const openReviewItem = useAppStore((state) => state.openReviewItem);
  const openSession = useAppStore((state) => state.openSession);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);

  const readIds = useNotificationReadStore((state) => state.readIds);
  const markRead = useNotificationReadStore((state) => state.markRead);
  const markAllRead = useNotificationReadStore((state) => state.markAllRead);

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // The drawer docks to the sidebar's right edge so it opens *next to* the bell
  // (the trigger is on the left), not on the opposite side of the screen.
  const [anchorLeft, setAnchorLeft] = useState(0);
  const [toast, setToast] = useState<CompanionNotification | null>(null);
  const [toastPosition, setToastPosition] = useState<NotificationToastPosition>(
    () => loadNotificationPreferences().toastPosition,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const knownNotificationIdsRef = useRef<Set<string> | null>(null);
  const runStartedAtRef = useRef(Date.now());
  const historyIdsRef = useRef<Set<string>>(new Set());
  const toastReadyRef = useRef(false);

  const unreadCount = useMemo(
    () => notifications.reduce((n, item) => (readIds.has(item.id) ? n : n + 1), 0),
    [notifications, readIds],
  );
  const badgeLabel = unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : String(unreadCount);

  /** Start the close animation; the exit finishes via animationend or the timer. */
  function closeDrawer(): void {
    if (!open || closing) return;
    setClosing(true);
  }

  /** Tear the drawer down once the exit animation is done. Idempotent. */
  function finishClose(): void {
    setOpen(false);
    setClosing(false);
    buttonRef.current?.focus();
  }

  /** animationend is the precise trigger; the effect below is the fallback. */
  function handleDrawerAnimationEnd(e: React.AnimationEvent): void {
    if (e.animationName === "noti-drawer-out") finishClose();
  }

  // Guarantee teardown even if animationend never arrives (e.g. the tab is
  // backgrounded so CSS animations are frozen, or the animation is interrupted):
  // unmount after the exit animation's duration so the drawer can never stick.
  useEffect(() => {
    if (!closing) return;
    const timeout = window.setTimeout(finishClose, 220);
    return () => window.clearTimeout(timeout);
  }, [closing]);

  // Close on Escape; focus the drawer for keyboard users when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    drawerRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      toastReadyRef.current = true;
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function syncToastPosition() {
      setToastPosition(loadNotificationPreferences().toastPosition);
    }

    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, syncToastPosition);
    window.addEventListener("storage", syncToastPosition);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, syncToastPosition);
      window.removeEventListener("storage", syncToastPosition);
    };
  }, []);

  // Toasts fire for *newly arriving* notifications only — initial hydration
  // stays quiet so a backlog never flashes on load.
  useEffect(() => {
    const nextIds = new Set(notifications.map((notification) => notification.id));
    const previousIds = knownNotificationIdsRef.current;
    knownNotificationIdsRef.current = nextIds;
    // Items derived from stored history are remembered for the whole run, so
    // switching back to a session never makes them arrive again. Others keep
    // the previous-feed rule: a re-detected file may announce itself again.
    const historyIds = historyIdsRef.current;
    const known = new Set([...(previousIds ?? []), ...historyIds]);
    for (const notification of notifications) {
      if (isDerivedFromHistory(notification)) historyIds.add(notification.id);
    }
    // The first feed and anything arriving while the shell settles (hydration
    // filling the feed) are the backlog: absorbed above, never toasted.
    if (!previousIds || !toastReadyRef.current) return;

    const fresh = toastArrival(notifications, known, runStartedAtRef.current);
    if (fresh) setToast(fresh);
  }, [notifications]);

  // The toast hides on its own clock. Tied to the feed effect, every feed
  // recompute (a session switch, an auto-import pass) cancelled the timer and
  // left the toast on screen indefinitely.
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Measure the sidebar's right edge on open so the drawer docks flush against
  // it — correct whether the sidebar is expanded or collapsed.
  function toggleOpen(): void {
    if (open) {
      closeDrawer();
      return;
    }
    const sidebar = buttonRef.current?.closest(".sidebar");
    const rect = (sidebar ?? buttonRef.current)?.getBoundingClientRect();
    if (rect) setAnchorLeft(Math.round(rect.right));
    setOpen(true);
  }

  function dispatchTarget(
    target: CompanionNotificationActionTarget,
    notificationId?: string,
  ): void {
    closeDrawer();
    setToast(null);
    if (notificationId) markRead(notificationId);
    if (!target) return;
    if (target.kind === "view") onNavigate(target.view);
    else if (target.kind === "review") openReviewItem(target.selection);
    else if (target.kind === "session") {
      loadBrowserSession(target.sessionId);
      openSession("flow");
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`attention-indicator${unreadCount > 0 ? " has-signals" : ""}${compact ? " is-compact" : ""}`}
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount > 0 ? `알림 — 안 읽음 ${unreadCount}건` : "알림"}
      >
        <span className="attention-indicator-icon" aria-hidden="true">
          <Bell size={compact ? 15 : 16} />
        </span>
        {compact ? null : <span className="attention-indicator-label">알림</span>}
        {unreadCount > 0 ? (
          <span
            className="attention-indicator-badge"
            aria-hidden={compact ? "true" : undefined}
            aria-label={compact ? undefined : `안 읽음 ${unreadCount}개`}
          >
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {typeof document !== "undefined"
        ? createPortal(
            <>
              {toast ? (
                <div
                  className={`attention-toast ${TOAST_POSITION_CLASS[toastPosition]}`}
                  role="status"
                  aria-live="polite"
                >
                  <button
                    type="button"
                    className="attention-toast-main"
                    onClick={() => dispatchTarget(toast.actionTarget, toast.id)}
                    disabled={!toast.actionTarget}
                    title={toast.actionTarget ? `${toast.actionLabel}로 이동` : toast.title}
                  >
                    <span className="attention-toast-icon" aria-hidden="true">
                      <ToastIcon notification={toast} />
                    </span>
                    <span className="attention-toast-copy">
                      <span className="attention-toast-kicker">새 알림</span>
                      <strong>{toast.title}</strong>
                    </span>
                    {toast.actionTarget ? <ArrowRight size={13} aria-hidden="true" /> : null}
                  </button>
                  <button
                    type="button"
                    className="attention-toast-close"
                    onClick={() => setToast(null)}
                    aria-label="알림 토스트 닫기"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              {open ? (
                <>
                  {/* Transparent scrim — closes on click-outside without dimming
                      the canvas, so the drawer stays non-blocking. */}
                  <div
                    className="noti-drawer-scrim"
                    aria-hidden="true"
                    onClick={closeDrawer}
                  />
                  <aside
                    ref={drawerRef}
                    className={`noti-drawer${closing ? " is-closing" : ""}`}
                    onAnimationEnd={handleDrawerAnimationEnd}
                    style={{ left: anchorLeft }}
                    role="dialog"
                    aria-label="알림"
                    aria-modal="false"
                    tabIndex={-1}
                  >
                    <header className="noti-drawer-head">
                      <span className="noti-drawer-icon" aria-hidden="true">
                        <Bell size={15} />
                      </span>
                      <h2>알림</h2>
                      {unreadCount > 0 ? (
                        <button
                          type="button"
                          className="noti-markall"
                          onClick={() => markAllRead(notifications.map((n) => n.id))}
                          title="모든 알림을 읽음으로 표시"
                        >
                          <CheckCheck size={13} aria-hidden="true" />
                          모두 읽음
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="noti-drawer-close"
                        onClick={closeDrawer}
                        aria-label="알림 닫기"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </header>

                    <div className="noti-drawer-body base-scroll">
                      {notifications.length === 0 ? (
                        <p className="noti-drawer-empty">
                          아직 알림이 없습니다. 세션을 가져오거나 분석을 실행하면
                          여기에 시간순으로 쌓입니다.
                        </p>
                      ) : (
                        <NotificationFeedList
                          notifications={notifications}
                          readIds={readIds}
                          onDispatch={dispatchTarget}
                        />
                      )}
                    </div>

                  </aside>
                </>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </>
  );
}

function ToastIcon({ notification }: { notification: CompanionNotification }) {
  const Icon = notificationIcon(notification.kind);
  return <Icon size={14} />;
}

/** Re-exported so callers that imported the type from this module keep working. */
export type { CompanionNotification, ReviewSelection };
