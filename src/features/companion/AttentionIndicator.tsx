import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Bell, CheckCheck, X } from "lucide-react";
import { useMoriAppStore } from "../../app/store";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useNotificationReadStore } from "../../app/notificationReadStore";
import type { ViewKey } from "../../domain/types";
import type {
  MoriNotification,
  MoriNotificationActionTarget,
} from "../../lib/notifications/notification";
import {
  formatNotificationTime,
  notificationIcon,
  notificationProjectLabel,
} from "../../lib/notifications/notificationPresentation";
import type { ReviewSelection } from "../../lib/review-workspace/reviewWorkspace";
import { useMoriNotifications } from "./useMoriNotifications";

/**
 * 알림 — the global notification bell anchored to the sidebar head.
 *
 * This is a real notification *feed*, not a triage dashboard: it renders the
 * producer-neutral `MoriNotification[]` from `useMoriNotifications()` newest
 * first, mixing live current-session notices ("결정 2건 확인 필요") with dated
 * cross-session events ("이 세션이 정리됐어요 · ng-gw · 2시간 전"). The badge is
 * an *unread* count (so it climbs as work piles up, capped at 9+), and a fresh
 * arrival flashes a toast once.
 *
 * Read-state lives in `useNotificationReadStore` (notifications are recomputed
 * every render, so "read" cannot live on the record). Clicking a row marks it
 * read and navigates; "모두 읽음" clears the badge.
 */

/** Newest-N shown in the popover; the rest live on the full 알림 page. */
const PANEL_LIMIT = 8;
/** Above this, the badge shows "9+" so a busy bell never overflows its pill. */
const BADGE_CAP = 9;

export function AttentionIndicator({
  onNavigate,
  compact = false,
}: {
  onNavigate: (view: ViewKey) => void;
  /** Icon-only quick-action button (sidebar head) when true; labelled pill otherwise. */
  compact?: boolean;
}) {
  const { notifications, isDemo } = useMoriNotifications();
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);
  const openSession = useMoriAppStore((state) => state.openSession);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);

  const readIds = useNotificationReadStore((state) => state.readIds);
  const markRead = useNotificationReadStore((state) => state.markRead);
  const markAllRead = useNotificationReadStore((state) => state.markAllRead);

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [toast, setToast] = useState<MoriNotification | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const knownNotificationIdsRef = useRef<Set<string> | null>(null);
  const toastReadyRef = useRef(false);

  const unreadCount = useMemo(
    () => notifications.reduce((n, item) => (readIds.has(item.id) ? n : n + 1), 0),
    [notifications, readIds],
  );
  const visible = notifications.slice(0, PANEL_LIMIT);
  const badgeLabel = unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : String(unreadCount);

  // Close on Escape; focus the panel for keyboard users when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      toastReadyRef.current = true;
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, []);

  // Toasts fire for *newly arriving* notifications only — initial hydration
  // stays quiet so a backlog never flashes on load.
  useEffect(() => {
    const nextIds = new Set(notifications.map((notification) => notification.id));
    const knownIds = knownNotificationIdsRef.current;
    if (!knownIds) {
      knownNotificationIdsRef.current = nextIds;
      return;
    }
    if (!toastReadyRef.current) return;

    const fresh = notifications.find((notification) => !knownIds.has(notification.id));
    knownNotificationIdsRef.current = nextIds;
    if (!fresh) return;

    setToast(fresh);
    const timeout = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [notifications]);

  function dispatchTarget(
    target: MoriNotificationActionTarget,
    notificationId?: string,
  ): void {
    setOpen(false);
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

  function openAllNotifications(): void {
    setOpen(false);
    setToast(null);
    onNavigate("companion");
  }

  // Anchor the panel to the bell's actual position so it stays correct whether
  // the sidebar is expanded or collapsed, then portal it to <body> so no
  // transformed/overflow ancestor can clip or occlude it.
  function toggleOpen(): void {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAnchor({
        left: Math.round(rect.right + 8),
        top: Math.round(Math.max(8, Math.min(rect.top, window.innerHeight - 540))),
      });
    }
    setOpen((v) => !v);
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
        title={unreadCount > 0 ? `알림 — 안 읽음 ${unreadCount}건` : "알림"}
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
        <div className="attention-toast" role="status" aria-live="polite">
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
          {/* Transparent scrim — closes the panel on click-outside. */}
          <div
            className="attention-panel-scrim"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="attention-panel"
            style={{ left: anchor.left, top: anchor.top }}
            role="dialog"
            aria-label="알림"
            aria-modal="false"
            tabIndex={-1}
          >
            <header className="attention-panel-head">
              <h3>알림</h3>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="attention-panel-markall"
                  onClick={() => markAllRead(notifications.map((n) => n.id))}
                  title="모든 알림을 읽음으로 표시"
                >
                  <CheckCheck size={13} aria-hidden="true" />
                  모두 읽음
                </button>
              ) : null}
            </header>

            <div className="attention-panel-body">
              {visible.length === 0 ? (
                <p className="attention-panel-empty">
                  아직 알림이 없습니다. 세션을 가져오거나 분석을 실행하면 여기에
                  쌓입니다.
                </p>
              ) : (
                <ul className="attention-feed">
                  {visible.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      read={readIds.has(notification.id)}
                      onDispatch={dispatchTarget}
                    />
                  ))}
                </ul>
              )}
            </div>

            <footer className="attention-panel-foot">
              <button
                type="button"
                className="attention-panel-viewall"
                onClick={openAllNotifications}
              >
                모든 알림 보기
                <ArrowRight size={11} aria-hidden="true" />
              </button>
              <p className="attention-panel-privacy">
                {isDemo
                  ? "데모 데이터 기준입니다."
                  : "가져온 소스에서만 생성됩니다."}
              </p>
            </footer>
          </div>
        </>
      ) : null}
            </>,
            document.body,
          )
        : null}
    </>
  );
}

// ─── Feed row ───────────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  read,
  onDispatch,
}: {
  notification: MoriNotification;
  read: boolean;
  onDispatch: (target: MoriNotificationActionTarget, id: string) => void;
}) {
  const Icon = notificationIcon(notification.kind);
  const project = notificationProjectLabel(notification);
  const time = formatNotificationTime(notification.createdAt);

  return (
    <li>
      <button
        type="button"
        className={`attention-feed-row${read ? " is-read" : ""}`}
        onClick={() => onDispatch(notification.actionTarget, notification.id)}
        title={notification.message}
      >
        <span className="attention-feed-unread" aria-hidden="true" />
        <span className="attention-feed-icon" aria-hidden="true">
          <Icon size={15} />
        </span>
        <span className="attention-feed-body">
          <span className="attention-feed-title">{notification.title}</span>
          <span className="attention-feed-meta">
            {project ? <span>{project}</span> : null}
            <span>{time}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function ToastIcon({ notification }: { notification: MoriNotification }) {
  const Icon = notificationIcon(notification.kind);
  return <Icon size={14} />;
}

/** Re-exported so callers that imported the type from this module keep working. */
export type { MoriNotification, ReviewSelection };
