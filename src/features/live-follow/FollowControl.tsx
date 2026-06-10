/**
 * Live Follow control — start / pause / stop following the active session.
 *
 * Desktop-only: following re-reads the connector inbox, which the browser
 * prototype has no access to, so this renders nothing there. Following is
 * explicit and per-session (the user turns it on for one session); the brain
 * lives in the store and the polling loop in `useLiveFollow`, which this
 * component mounts. While following, a pending-count badge shows how many new
 * events the loop has seen since the last feed notice.
 */
import { Pause, Play, Radio, Square } from "lucide-react";
import { selectSessionView, useSessionStore } from "../../app/sessionStore";
import { isConnectorInboxAvailable } from "../../lib/desktop/connectorInbox";
import { useLiveFollow } from "./useLiveFollow";

export function FollowControl() {
  useLiveFollow();
  const follow = useSessionStore((state) => state.follow);
  const view = useSessionStore(selectSessionView);
  const startFollow = useSessionStore((state) => state.startFollow);
  const pauseFollow = useSessionStore((state) => state.pauseFollow);
  const resumeFollow = useSessionStore((state) => state.resumeFollow);
  const stopFollow = useSessionStore((state) => state.stopFollow);

  // Desktop-only: the browser has no connector inbox to follow.
  if (!isConnectorInboxAvailable()) return null;

  const isThisSession = follow.sessionId === view.session.id;
  const status = isThisSession ? follow.status : "idle";
  const pending = isThisSession ? follow.pendingEventIds.length : 0;

  function begin() {
    const knownIds = view.events
      .map((event) => event.connectorEventId)
      .filter((id): id is string => Boolean(id));
    startFollow(view.session.id, knownIds);
  }

  if (status === "idle" || status === "stopped") {
    return (
      <div className="follow-control">
        <button type="button" className="follow-control-start" onClick={begin}>
          <Radio size={14} aria-hidden="true" />
          실시간 따라가기
        </button>
      </div>
    );
  }

  return (
    <div className={`follow-control is-${status}`}>
      <span className="follow-control-status">
        <span className="follow-control-dot" aria-hidden="true" />
        {status === "paused" ? "일시중지됨" : "따라가는 중"}
        {pending > 0 ? <span className="follow-control-badge">새 이벤트 {pending}</span> : null}
      </span>
      {status === "paused" ? (
        <button type="button" className="follow-control-btn" onClick={resumeFollow} aria-label="재개">
          <Play size={13} aria-hidden="true" />
          재개
        </button>
      ) : (
        <button type="button" className="follow-control-btn" onClick={pauseFollow} aria-label="일시중지">
          <Pause size={13} aria-hidden="true" />
          일시중지
        </button>
      )}
      <button type="button" className="follow-control-btn" onClick={stopFollow} aria-label="중지">
        <Square size={12} aria-hidden="true" />
        중지
      </button>
    </div>
  );
}
