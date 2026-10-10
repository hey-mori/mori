import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Radio, TriangleAlert } from "lucide-react";
import { useSessionStore } from "../../app/sessionStore";
import { useAppStore } from "../../app/store";
import { isAutoImportedSessionId } from "../../lib/session/autoImportSessions";
import { EmptyState } from "../../components/layout/EmptyState";
import { LiveSessionView } from "../live-session/LiveSessionView";
import { SessionDetailView } from "./SessionDetailView";
import { SessionIndex } from "./SessionIndex";
import { useSessionResolver } from "./useSessionResolver";

/**
 * 세션 · the unified session workspace.
 *
 * Two panes, one experience. The left `SessionIndex` lists every session by
 * state (진행 중 / 과거); the right pane is whatever the selection asks for:
 *  - live mode → the live-follow feed (mission control for active sessions),
 *  - review mode → the picked past session's tabbed review, loaded inline.
 *
 * The mode is local to this surface, so switching between a live tail and a
 * past review never leaves the workspace or changes `currentView` — the index
 * stays put on the left the whole time. This is the "AI work · review"
 * experience in the two-experience model (기록 owns "notes · edit").
 */
export function SessionsWorkspace() {
  const resolveSession = useSessionResolver();
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? null,
  );

  const [mode, setMode] = useState<"live" | "review">("live");
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"ready" | "loading" | "error">("ready");
  // The lost row the user is still waiting on. Choosing anything else, or
  // leaving this screen, clears it, so a slow lookup never moves them to 기록
  // after they have gone elsewhere.
  const pendingLost = useRef<string | null>(null);
  useEffect(() => () => void (pendingLost.current = null), []);

  const handleSelectPast = useCallback(
    (sessionId: string) => {
      pendingLost.current = null;
      setSelectedPastId(sessionId);
      setMode("review");
      // An auto-registered session reads its transcript on demand: show a
      // loading state while it runs. A transcript that cannot be read opens as
      // the session with a truthful error and a retry, never as an empty one.
      setLoadState(isAutoImportedSessionId(sessionId) && sessionId !== activeSessionId ? "loading" : "ready");
      void resolveSession(sessionId).then((outcome) => {
        if (outcome === "superseded") return;
        setLoadState(outcome === "opened" ? "ready" : "error");
      });
    },
    [activeSessionId, resolveSession],
  );

  // A session whose original the last discovery did not find: tried once
  // through the resolver (a kept copy or a file that is there after all still
  // opens, with the loading state meanwhile); if nothing opens, its record in
  // 기록 is the fallback.
  const openRecordInLedger = useAppStore((state) => state.openRecordInLedger);
  const handleSelectLost = useCallback(
    (sessionId: string) => {
      pendingLost.current = sessionId;
      setSelectedPastId(sessionId);
      setMode("review");
      setLoadState(sessionId !== activeSessionId ? "loading" : "ready");
      void resolveSession(sessionId).then((outcome) => {
        if (outcome === "superseded" || pendingLost.current !== sessionId) return;
        pendingLost.current = null;
        if (outcome === "unavailable") {
          setLoadState("ready");
          setSelectedPastId(null);
          openRecordInLedger(sessionId);
          return;
        }
        setLoadState("ready");
      });
    },
    [activeSessionId, resolveSession, openRecordInLedger],
  );

  const handleSelectLive = useCallback(() => {
    pendingLost.current = null;
    setMode("live");
    setSelectedPastId(null);
    setLoadState("ready");
  }, []);

  return (
    <div className="sessions-workspace">
      <SessionIndex
        liveActive={mode === "live"}
        selectedPastId={selectedPastId}
        onSelectLive={handleSelectLive}
        onSelectPast={handleSelectPast}
        onSelectLost={handleSelectLost}
      />
      <div className="sessions-main">
        {mode === "live" ? (
          <LiveSessionView />
        ) : !selectedPastId ? (
          <EmptyState
            icon={Radio}
            title="세션을 선택하세요"
            description="왼쪽에서 진행 중이거나 지난 세션을 고르면 여기에 열립니다."
          />
        ) : loadState === "loading" ? (
          <div className="sessions-loading">
            <Loader2 className="sessions-loading-spin" size={22} aria-hidden="true" />
            <p>세션을 불러오는 중…</p>
          </div>
        ) : loadState === "error" ? (
          <EmptyState
            icon={TriangleAlert}
            title="세션을 불러올 수 없습니다"
            description="원본 대화를 찾지 못했어요. 파일이 이동했거나 접근할 수 없을 수 있습니다. 목록에서 다시 선택해 주세요."
          />
        ) : (
          <SessionDetailView />
        )}
      </div>
    </div>
  );
}
