import { useCallback, useState } from "react";
import { Loader2, Radio, TriangleAlert } from "lucide-react";
import { selectSessionSource, useSessionStore } from "../../app/sessionStore";
import { isAutoImportedSessionId } from "../../lib/session/autoImportSessions";
import { EmptyState } from "../../components/layout/EmptyState";
import { LiveSessionView } from "../live-session/LiveSessionView";
import { SessionDetailView } from "./SessionDetailView";
import { SessionIndex } from "./SessionIndex";

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
  const source = useSessionStore(selectSessionSource);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const loadDesktopSession = useSessionStore((state) => state.loadDesktopSession);
  const openDiscoveredSession = useSessionStore((state) => state.openDiscoveredSession);
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? null,
  );

  const [mode, setMode] = useState<"live" | "review">("live");
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"ready" | "loading" | "error">("ready");

  const isDesktop = source === "desktop-sqlite";

  const handleSelectPast = useCallback(
    (sessionId: string) => {
      setSelectedPastId(sessionId);
      setMode("review");
      setLoadState("ready");
      if (sessionId === activeSessionId) return;
      // An auto-registered session is a metadata-only placeholder: load its real
      // transcript on demand. Show a loading state while the fetch runs, and an
      // honest error (not a manual-import prompt) if it cannot be reached.
      if (isAutoImportedSessionId(sessionId)) {
        setLoadState("loading");
        void openDiscoveredSession(sessionId).then((ok) => {
          if (ok) {
            setLoadState("ready");
          } else {
            loadBrowserSession(sessionId);
            setLoadState("error");
          }
        });
        return;
      }
      if (isDesktop) {
        void loadDesktopSession(sessionId).then((ok) => {
          if (!ok) loadBrowserSession(sessionId);
        });
      } else {
        loadBrowserSession(sessionId);
      }
    },
    [activeSessionId, isDesktop, loadBrowserSession, loadDesktopSession, openDiscoveredSession],
  );

  const handleSelectLive = useCallback(() => {
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
