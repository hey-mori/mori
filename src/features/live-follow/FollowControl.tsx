/**
 * Live Follow toggle — a single "자동 동기화" button for the active session.
 *
 * Desktop-only: following re-reads the connector inbox, which the browser
 * prototype has no access to, so this renders nothing there. The button is a
 * sync toggle: press to start following, press again to stop. A session opens
 * already syncing (auto-started once), and an ended / quiet session auto-stops
 * itself via `useLiveFollow`; the user can re-arm or stop at any time with the
 * button. While syncing the icon spins and a pending-event badge counts new
 * events the loop has seen.
 */
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { selectSessionView, useSessionStore } from "../../app/sessionStore";
import { isConnectorInboxAvailable } from "../../lib/desktop/connectorInbox";
import { useLiveFollow } from "./useLiveFollow";

export function FollowControl() {
  useLiveFollow();
  const follow = useSessionStore((state) => state.follow);
  const view = useSessionStore(selectSessionView);
  const startFollow = useSessionStore((state) => state.startFollow);
  const stopFollow = useSessionStore((state) => state.stopFollow);
  const autoStartedFor = useRef<string | null>(null);

  const isThisSession = follow.sessionId === view.session.id;
  const status = isThisSession ? follow.status : "idle";
  const pending = isThisSession ? follow.pendingEventIds.length : 0;
  const active = status === "following" || status === "paused";

  const begin = useCallback(() => {
    const knownIds = view.events
      .map((event) => event.connectorEventId)
      .filter((id): id is string => Boolean(id));
    startFollow(view.session.id, knownIds);
  }, [view.events, view.session.id, startFollow]);

  // Auto-start once when this session opens (desktop only). We never re-arm
  // automatically — an ended session auto-stops, and re-arming would loop.
  useEffect(() => {
    if (!isConnectorInboxAvailable()) return;
    if (autoStartedFor.current === view.session.id) return;
    if (status !== "idle") return;
    autoStartedFor.current = view.session.id;
    begin();
  }, [view.session.id, status, begin]);

  if (!isConnectorInboxAvailable()) return null;

  return (
    <button
      type="button"
      className={`follow-toggle${active ? " is-active" : ""}`}
      onClick={() => (active ? stopFollow() : begin())}
      aria-pressed={active}
      title={active ? "자동 동기화 중 · 눌러서 멈춤" : "자동 동기화 시작"}
    >
      <RefreshCw
        size={14}
        className={`follow-toggle-icon${status === "following" ? " is-spinning" : ""}`}
        aria-hidden="true"
      />
      <span className="sr-only">{active ? "자동 동기화 중" : "자동 동기화"}</span>
      {pending > 0 ? <span className="follow-toggle-badge">{pending}</span> : null}
    </button>
  );
}
