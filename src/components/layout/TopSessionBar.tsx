import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../ui/Badge";
import { useMoriAppStore } from "../../app/store";
import { selectSessionView, useMoriSessionStore } from "../../app/sessionStore";
import { moriMockSession } from "../../domain/mock-data";
import { deriveSessionTiming } from "../../lib/session/sessionTiming";
import { formatDate, formatDateTime, formatTime } from "../../lib/formatting/time";

/**
 * Sticky top bar above the Timeline.
 *
 * Honesty contract:
 *   - State badge derives from `deriveSessionTiming` (Live / Saved / Ended /
 *     Demo / Analyzing). It never claims "Live" for a demo session.
 *   - The date line shows the real start → end window. Live sessions tick
 *     once per second.
 *   - Search is real (`searchQuery` in the app store filters the canvas).
 *     We do not show a fake `⌘K` shortcut hint anymore — until the global
 *     hotkey ships we keep the input visible without inventing keyboard
 *     bindings.
 */
export function TopSessionBar() {
  const view = useMoriSessionStore(selectSessionView);
  const draft = useMoriSessionStore((state) => state.draft);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const searchQuery = useMoriAppStore((state) => state.searchQuery);
  const setSearchQuery = useMoriAppStore((state) => state.setSearchQuery);

  // Re-render once per second only when the session is genuinely live so the
  // duration label updates. Saved / ended sessions never re-render here.
  const initialTiming = deriveSessionTiming({
    draft,
    demoSession: moriMockSession.session,
    analysisStatus,
  });
  const [timing, setTiming] = useState(initialTiming);
  useEffect(() => {
    const snapshot = deriveSessionTiming({
      draft,
      demoSession: moriMockSession.session,
      analysisStatus,
    });
    setTiming(snapshot);
    if (!snapshot.isLive) return;
    const interval = window.setInterval(() => {
      setTiming(
        deriveSessionTiming({
          draft,
          demoSession: moriMockSession.session,
          analysisStatus,
        }),
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, [draft, analysisStatus]);

  const dateLine = formatDateLine(timing.startIso, timing.endIso);

  return (
    <header className="topbar">
      <div className="topbar-title">
        <div className="title-row">
          <h1>{view.session.title}</h1>
          <Badge tone={timing.stateTone}>{timing.stateLabel}</Badge>
          {timing.isLive ? (
            <span className="topbar-live-dot" aria-hidden="true" />
          ) : null}
        </div>
        <p>{dateLine}</p>
      </div>
      <div className="topbar-search" aria-label="Search timeline events">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder="이벤트 검색..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search events"
        />
      </div>
    </header>
  );
}

function formatDateLine(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "—";
  if (!endIso) return `${formatDate(startIso)} ${formatTime(startIso)}`;
  // Same-day comparison in the app's Asia/Seoul convention: comparing the
  // rendered date strings keeps it consistent with what the user sees.
  const sameDay = formatDate(startIso) === formatDate(endIso);
  return sameDay
    ? `${formatDate(startIso)} ${formatTime(startIso)} – ${formatTime(endIso)}`
    : `${formatDateTime(startIso)} → ${formatDateTime(endIso)}`;
}
