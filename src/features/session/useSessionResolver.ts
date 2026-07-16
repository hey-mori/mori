import { useCallback } from "react";
import { selectSessionSource, useSessionStore } from "../../app/sessionStore";
import { isAutoImportedSessionId } from "../../lib/agents/autoImportSessions";

/**
 * Resolve a stored or discovered session into the active draft, materializing an
 * auto-imported placeholder's real transcript on demand. Returns whether the
 * session is now loaded.
 *
 * This is the single open path shared by 세션 · 프로젝트 · 워크스페이스. Before
 * it, only `SessionsWorkspace` special-cased `isAutoImportedSessionId →
 * openDiscoveredSession`, so a discovered session opened full from 세션 but
 * EMPTY ("가져온 소스 없음") from the 프로젝트 tab the sidebar leads with. Every
 * surface now resolves identically.
 */
export function useSessionResolver(): (sessionId: string) => Promise<boolean> {
  const source = useSessionStore(selectSessionSource);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const loadDesktopSession = useSessionStore((state) => state.loadDesktopSession);
  const openDiscoveredSession = useSessionStore((state) => state.openDiscoveredSession);
  const activeSessionId = useSessionStore((state) => state.draft?.session.id ?? null);
  const isDesktop = source === "desktop-sqlite";

  return useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (sessionId === activeSessionId) return true;
      // An auto-registered session is a metadata-only placeholder until its real
      // transcript is materialized onto the same id; fall back to the placeholder
      // if discovery is unavailable so the open is never a hard dead end.
      if (isAutoImportedSessionId(sessionId)) {
        const ok = await openDiscoveredSession(sessionId);
        if (!ok) return loadBrowserSession(sessionId);
        return true;
      }
      if (isDesktop) {
        const ok = await loadDesktopSession(sessionId);
        return ok || loadBrowserSession(sessionId);
      }
      return loadBrowserSession(sessionId);
    },
    [activeSessionId, isDesktop, loadBrowserSession, loadDesktopSession, openDiscoveredSession],
  );
}
