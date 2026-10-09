import { useCallback } from "react";
import { selectSessionSource, useSessionStore } from "../../app/sessionStore";
import { isAutoImportedSessionId } from "../../lib/session/autoImportSessions";

/**
 * What opening a session came to.
 *
 * - `opened`: the session is the active draft. Its transcript, its recent
 *   window, or a truthful "could not read" state is showing, never an empty
 *   session presented as if it had nothing in it.
 * - `unavailable`: nothing could be opened for the id.
 * - `superseded`: a later open started first; the caller should do nothing,
 *   so a slow read never pulls the user back to a session they left.
 */
export type SessionOpenOutcome = "opened" | "unavailable" | "superseded";

let resolveSequence = 0;

/**
 * Resolve a stored or discovered session into the active draft, materializing an
 * auto-imported placeholder's real transcript on demand.
 *
 * This is the single open path shared by 세션 · 프로젝트 · 워크스페이스 · 기록 ·
 * the command palette, so every surface resolves identically.
 */
export function useSessionResolver(): (sessionId: string) => Promise<SessionOpenOutcome> {
  const source = useSessionStore(selectSessionSource);
  const loadBrowserSession = useSessionStore((state) => state.loadBrowserSession);
  const loadDesktopSession = useSessionStore((state) => state.loadDesktopSession);
  const openDiscoveredSession = useSessionStore((state) => state.openDiscoveredSession);
  const isDesktop = source === "desktop-sqlite";

  return useCallback(
    async (sessionId: string): Promise<SessionOpenOutcome> => {
      const token = ++resolveSequence;
      const settle = (opened: boolean): SessionOpenOutcome =>
        token !== resolveSequence ? "superseded" : opened ? "opened" : "unavailable";
      const store = useSessionStore.getState();
      if (isAutoImportedSessionId(sessionId)) {
        // Already showing it, with its transcript or its window: nothing to
        // read. A placeholder that is still empty (its last read failed, or
        // never ran) reads again, so reopening is also the retry.
        if (store.draft?.session.id === sessionId && !needsTranscript(sessionId)) return "opened";
        const outcome = await openDiscoveredSession(sessionId);
        if (outcome === "superseded") return "superseded";
        if (outcome === "missing") return settle(loadBrowserSession(sessionId));
        return settle(true);
      }
      if (store.draft?.session.id === sessionId) return "opened";
      if (isDesktop) {
        const ok = await loadDesktopSession(sessionId);
        return settle(ok || loadBrowserSession(sessionId));
      }
      return settle(loadBrowserSession(sessionId));
    },
    [isDesktop, loadBrowserSession, loadDesktopSession, openDiscoveredSession],
  );
}

/** An auto-imported session open with neither its import nor a readable
 *  window, or showing its import because the source was gone: reopening it is
 *  the retry, so a source that came back is read again. */
function needsTranscript(sessionId: string): boolean {
  const { imports, sessionWindow } = useSessionStore.getState();
  if (imports.length > 0) {
    return sessionWindow?.sessionId === sessionId && sessionWindow.status === "error" && sessionWindow.error.kind === "missing";
  }
  if (sessionWindow?.sessionId !== sessionId) return true;
  return sessionWindow.status === "error";
}
