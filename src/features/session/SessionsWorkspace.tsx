import { useCallback, useState } from "react";
import { Radio } from "lucide-react";
import { selectSessionSource, useSessionStore } from "../../app/sessionStore";
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
  const activeSessionId = useSessionStore(
    (state) => state.draft?.session.id ?? null,
  );

  const [mode, setMode] = useState<"live" | "review">("live");
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null);

  const isDesktop = source === "desktop-sqlite";

  const handleSelectPast = useCallback(
    (sessionId: string) => {
      setSelectedPastId(sessionId);
      setMode("review");
      if (sessionId === activeSessionId) return;
      if (isDesktop) {
        void loadDesktopSession(sessionId).then((ok) => {
          if (!ok) loadBrowserSession(sessionId);
        });
      } else {
        loadBrowserSession(sessionId);
      }
    },
    [activeSessionId, isDesktop, loadBrowserSession, loadDesktopSession],
  );

  const handleSelectLive = useCallback(() => {
    setMode("live");
    setSelectedPastId(null);
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
        ) : selectedPastId ? (
          <SessionDetailView />
        ) : (
          <EmptyState
            icon={Radio}
            title="세션을 선택하세요"
            description="왼쪽에서 진행 중이거나 지난 세션을 고르면 여기에 열립니다."
          />
        )}
      </div>
    </div>
  );
}
