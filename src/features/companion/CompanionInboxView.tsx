import { useMemo } from "react";
import { ArrowRight, Bell, CheckCheck } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { useMoriAppStore } from "../../app/store";
import { useMoriSessionStore } from "../../app/sessionStore";
import { useNotificationReadStore } from "../../app/notificationReadStore";
import type {
  MoriNotification,
  MoriNotificationActionTarget,
} from "../../lib/notifications/notification";
import {
  formatNotificationTime,
  notificationIcon,
  notificationProjectLabel,
} from "../../lib/notifications/notificationPresentation";
import { useMoriNotifications } from "./useMoriNotifications";

/**
 * 알림 — the full-page notification feed.
 *
 * The bell popover is for a quick glance at what just landed; this page is the
 * same chronological cross-session feed with room to breathe, grouped by when
 * things happened (오늘 / 이번 주 / 이전). It is a *stream*, not a triage board:
 * no action-category buckets, no severity dashboard, no left colour bars — just
 * "what happened, where, when", newest first. Clicking a row opens the thing it
 * is about and marks it read.
 */

type TimeBucket = "today" | "week" | "earlier";

const BUCKET_ORDER: TimeBucket[] = ["today", "week", "earlier"];

const BUCKET_LABEL: Record<TimeBucket, string> = {
  today: "오늘",
  week: "이번 주",
  earlier: "이전",
};

export function CompanionInboxView() {
  const { notifications, isDemo } = useMoriNotifications();
  const navigate = useMoriAppStore((state) => state.navigate);
  const openReviewItem = useMoriAppStore((state) => state.openReviewItem);
  const openSession = useMoriAppStore((state) => state.openSession);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);

  const readIds = useNotificationReadStore((state) => state.readIds);
  const markRead = useNotificationReadStore((state) => state.markRead);
  const markAllRead = useNotificationReadStore((state) => state.markAllRead);

  const unreadCount = useMemo(
    () => notifications.reduce((n, item) => (readIds.has(item.id) ? n : n + 1), 0),
    [notifications, readIds],
  );

  const groups = useMemo(() => groupByTime(notifications), [notifications]);

  function dispatch(target: MoriNotificationActionTarget, id: string): void {
    markRead(id);
    if (!target) return;
    if (target.kind === "view") navigate(target.view);
    else if (target.kind === "review") openReviewItem(target.selection);
    else if (target.kind === "session") {
      loadBrowserSession(target.sessionId);
      openSession("flow");
    }
  }

  return (
    <PageShell className="noti-page" header={<PageHeader compact title="알림" />}>
      <div className="noti-toolbar">
        <p className="noti-toolbar-status">
          {unreadCount > 0 ? (
            <>
              안 읽음 <strong>{unreadCount}</strong>건 · 전체 {notifications.length}건
            </>
          ) : (
            <>전체 {notifications.length}건 · 모두 확인함</>
          )}
        </p>
        {unreadCount > 0 ? (
          <button
            type="button"
            className="noti-markall"
            onClick={() => markAllRead(notifications.map((n) => n.id))}
          >
            <CheckCheck size={14} aria-hidden="true" />
            모두 읽음
          </button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="아직 알림이 없습니다"
          description="세션을 가져오거나 분석을 실행하면, 어떤 프로젝트의 어떤 세션에서 무슨 일이 있었는지 여기에 시간순으로 쌓입니다."
          actions={
            <Button variant="primary" onClick={() => navigate("connections")}>
              세션 가져오기
            </Button>
          }
        />
      ) : (
        <div className="noti-groups">
          {groups.map((group) => (
            <section key={group.bucket} className="noti-group" aria-label={BUCKET_LABEL[group.bucket]}>
              <h2 className="noti-group-head">{BUCKET_LABEL[group.bucket]}</h2>
              <ul className="noti-feed">
                {group.notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    read={readIds.has(notification.id)}
                    onDispatch={dispatch}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="noti-privacy">
        {isDemo
          ? "데모 데이터 기준입니다. 실제 세션에서는 가져온 소스와 검토 상태에서만 알림이 만들어집니다."
          : "알림은 가져온 소스와 검토 상태에서만 만들어집니다. Mori가 배경에서 무언가를 감시하지 않습니다."}
      </p>
    </PageShell>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

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
  const actionable = notification.actionTarget !== null;

  return (
    <li>
      <button
        type="button"
        className={`noti-row${read ? " is-read" : ""}`}
        onClick={() => onDispatch(notification.actionTarget, notification.id)}
        disabled={!actionable}
      >
        <span className="noti-row-unread" aria-hidden="true" />
        <span className="noti-row-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="noti-row-body">
          <span className="noti-row-titleline">
            <strong className="noti-row-title">{notification.title}</strong>
            <span className="noti-row-time">{time}</span>
          </span>
          <span className="noti-row-message">{notification.message}</span>
          {project ? (
            <span className="noti-row-source">
              <FolderTag />
              {project}
            </span>
          ) : null}
        </span>
        {actionable ? (
          <ArrowRight size={14} aria-hidden="true" className="noti-row-arrow" />
        ) : null}
      </button>
    </li>
  );
}

function FolderTag() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Time grouping ──────────────────────────────────────────────────────────

type NotificationTimeGroup = {
  bucket: TimeBucket;
  notifications: MoriNotification[];
};

function groupByTime(
  notifications: MoriNotification[],
  now: number = Date.now(),
): NotificationTimeGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 86_400_000;

  const buckets: Record<TimeBucket, MoriNotification[]> = {
    today: [],
    week: [],
    earlier: [],
  };

  for (const notification of notifications) {
    buckets[bucketOf(notification.createdAt, startOfToday.getTime(), weekAgo)].push(
      notification,
    );
  }

  return BUCKET_ORDER.filter((bucket) => buckets[bucket].length > 0).map((bucket) => ({
    bucket,
    notifications: buckets[bucket],
  }));
}

function bucketOf(
  createdAt: string | undefined,
  startOfTodayMs: number,
  weekAgoMs: number,
): TimeBucket {
  // Live triage notices (no timestamp) describe the session right now → 오늘.
  if (!createdAt) return "today";
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return "today";
  if (time >= startOfTodayMs) return "today";
  if (time >= weekAgoMs) return "week";
  return "earlier";
}
