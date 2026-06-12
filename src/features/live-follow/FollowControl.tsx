/**
 * Live Follow indicator — automatically follows the active session.
 *
 * Desktop-only: following re-reads the connector inbox, which the browser
 * prototype has no access to, so this renders nothing there. Following starts
 * on its own when a session opens (once per session); a quiet / ended session
 * auto-stops itself via `useLiveFollow`. There is no manual start button — the
 * component only surfaces the live status (and a pending-count badge) while a
 * session is actively being followed.
 */
import { useEffect, useRef } from "react";
import { selectSessionView, useSessionStore } from "../../app/sessionStore";
import { isConnectorInboxAvailable } from "../../lib/desktop/connectorInbox";
import { useLiveFollow } from "./useLiveFollow";

export function FollowControl() {
  useLiveFollow();
  const follow = useSessionStore((state) => state.follow);
  const view = useSessionStore(selectSessionView);
  const startFollow = useSessionStore((state) => state.startFollow);
  const autoStartedFor = useRef<string | null>(null);

  const isThisSession = follow.sessionId === view.session.id;
  const status = isThisSession ? follow.status : "idle";
  const pending = isThisSession ? follow.pendingEventIds.length : 0;

  // Auto-start following when this session opens — desktop only, once per
  // session. An ended / quiet session auto-stops on its own, so we never
  // re-arm here (that would loop start → auto-stop → start).
  useEffect(() => {
    if (!isConnectorInboxAvailable()) return;
    if (autoStartedFor.current === view.session.id) return;
    if (status !== "idle") return;
    autoStartedFor.current = view.session.id;
    const knownIds = view.events
      .map((event) => event.connectorEventId)
      .filter((id): id is string => Boolean(id));
    startFollow(view.session.id, knownIds);
  }, [view.session.id, status, view.events, startFollow]);

  // Desktop-only, and only while actually following — no idle/stopped chrome.
  if (!isConnectorInboxAvailable()) return null;
  if (status !== "following" && status !== "paused") return null;

  return (
    <div className={`follow-control is-${status}`}>
      <span className="follow-control-status">
        <span className="follow-control-dot" aria-hidden="true" />
        {status === "paused" ? "일시중지됨" : "따라가는 중"}
        {pending > 0 ? (
          <span className="follow-control-badge">새 이벤트 {pending}</span>
        ) : null}
      </span>
    </div>
  );
}
