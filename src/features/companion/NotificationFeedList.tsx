import { ArrowRight } from "lucide-react";
import type {
  CompanionNotification,
  CompanionNotificationActionTarget,
} from "../../lib/notifications/notification";
import {
  formatNotificationTime,
  notificationIcon,
  notificationProjectLabel,
} from "../../lib/notifications/notificationPresentation";

/**
 * The notification feed, grouped by time (오늘 / 이번 주 / 이전).
 *
 * Shared by both notification surfaces — the right-side drawer and the
 * standalone page — so the row anatomy and time grouping can never drift apart.
 * It is presentational: read-state and navigation are passed in.
 */

type TimeBucket = "today" | "week" | "earlier";

const BUCKET_ORDER: TimeBucket[] = ["today", "week", "earlier"];

const BUCKET_LABEL: Record<TimeBucket, string> = {
  today: "오늘",
  week: "이번 주",
  earlier: "이전",
};

export function NotificationFeedList({
  notifications,
  readIds,
  onDispatch,
  now = Date.now(),
}: {
  notifications: CompanionNotification[];
  readIds: Set<string>;
  onDispatch: (target: CompanionNotificationActionTarget, id: string) => void;
  now?: number;
}) {
  const groups = groupByTime(notifications, now);
  return (
    <div className="noti-groups">
      {groups.map((group) => (
        <section
          key={group.bucket}
          className="noti-group"
          aria-label={BUCKET_LABEL[group.bucket]}
        >
          <h2 className="noti-group-head">{BUCKET_LABEL[group.bucket]}</h2>
          <ul className="noti-feed">
            {group.notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                read={readIds.has(notification.id)}
                onDispatch={onDispatch}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationRow({
  notification,
  read,
  onDispatch,
}: {
  notification: CompanionNotification;
  read: boolean;
  onDispatch: (target: CompanionNotificationActionTarget, id: string) => void;
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
  notifications: CompanionNotification[];
};

function groupByTime(
  notifications: CompanionNotification[],
  now: number,
): NotificationTimeGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 86_400_000;

  const buckets: Record<TimeBucket, CompanionNotification[]> = {
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
  // Notices without a timestamp describe the session right now → 오늘.
  if (!createdAt) return "today";
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return "today";
  if (time >= startOfTodayMs) return "today";
  if (time >= weekAgoMs) return "week";
  return "earlier";
}
