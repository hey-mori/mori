import { useMemo } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/layout/EmptyState";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../app/store";
import { useSessionStore } from "../../app/sessionStore";
import { useNotificationReadStore } from "../../app/notificationReadStore";
import type { CompanionNotificationActionTarget } from "../../lib/notifications/notification";
import { useNotifications } from "./useNotifications";
import { NotificationFeedList } from "./NotificationFeedList";

/**
 * 알림 — the full-page notification feed.
 *
 * The same chronological cross-session feed the bell drawer shows, with room to
 * breathe. A stream, not a triage board: no action-category buckets, no
 * severity dashboard, no colour bars — just "what happened, where, when",
 * newest first, grouped by 오늘 / 이번 주 / 이전. The feed body itself is the
 * shared `NotificationFeedList`, so this page and the drawer never drift.
 */
export function CompanionInboxView() {
  const { notifications, isDemo } = useNotifications();
  const navigate = useAppStore((state) => state.navigate);
  const openReviewItem = useAppStore((state) => state.openReviewItem);
  const openSession = useAppStore((state) => state.openSession);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);

  const readIds = useNotificationReadStore((state) => state.readIds);
  const markRead = useNotificationReadStore((state) => state.markRead);
  const markAllRead = useNotificationReadStore((state) => state.markAllRead);

  const unreadCount = useMemo(
    () => notifications.reduce((n, item) => (readIds.has(item.id) ? n : n + 1), 0),
    [notifications, readIds],
  );

  function dispatch(target: CompanionNotificationActionTarget, id: string): void {
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
        <NotificationFeedList
          notifications={notifications}
          readIds={readIds}
          onDispatch={dispatch}
        />
      )}

      <p className="noti-privacy">
        {isDemo
          ? "데모 데이터 기준입니다. 실제 세션에서는 가져온 소스와 검토 상태에서만 알림이 만들어집니다."
          : "알림은 가져온 소스와 검토 상태에서만 만들어집니다. Mori가 배경에서 무언가를 감시하지 않습니다."}
      </p>
    </PageShell>
  );
}
