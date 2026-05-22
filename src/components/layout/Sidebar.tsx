import { ChevronDown, ChevronLeft, FolderGit2, History } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { MoriLogo } from "../brand/MoriLogo";
import { moriViewIcon } from "../brand/moriIcons";
import type { ViewKey } from "../../domain/types";
import { moriMockSession } from "../../domain/mock-data";
import {
  loadStoredSessionSummaries,
  selectSessionSource,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import type { StoredSessionSummary } from "../../lib/storage/storageTypes";
import { useMoriProfileStore } from "../../app/profileStore";
import { useMoriAppStore } from "../../app/store";
import { getProfileInitials } from "../../lib/profile/localProfile";
import {
  describeSessionCardAction,
  deriveSessionTiming,
} from "../../lib/session/sessionTiming";
import { buildWorkContext } from "../../lib/session/workContext";
import { getFeatureControlProps } from "../../app/featureStatus";
import {
  discoverClaudeCodeSessions,
  isClaudeBridgeAvailable,
} from "../../lib/claude/claudeTauri";
import { NAV_GROUPS, type NavKey } from "../../lib/navigation/navGroups";

/**
 * Nav structure is defined as pure data in `lib/navigation/navGroups` so the
 * entry model (Connections leads; "새 세션" is a demoted secondary path) is
 * unit-tested and can't silently regress here.
 *
 * Live badge counts are computed inside the component so session state gives
 * users at-a-glance context (e.g. how many events, issues, etc.) without
 * navigating to each surface first.
 */

export function Sidebar({ currentView, onNavigate }: { currentView: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const view = useMoriSessionStore(selectSessionView);
  const imports = useMoriSessionStore((state) => state.imports);
  const connectionsCount = useConnectionsBadgeCount();

  const isActive = (key: ViewKey) =>
    key === currentView ||
    (currentView === "flow" && key === "timeline") ||
    (currentView === "consolidation" && key === "memory");

  // Live badge counts — shown only when non-zero so the nav stays quiet
  // until the user has actually captured or analysed work.
  const liveBadges = useMemo<Partial<Record<NavKey, string>>>(() => {
    const badges: Partial<Record<NavKey, string>> = {};
    if (view.events.length > 0) {
      badges.timeline = String(view.events.length);
    }
    if (imports.length > 0) {
      badges.evidence = String(imports.length);
    }
    const openIssues = view.issues.filter((issue) => issue.status !== "resolved").length;
    if (openIssues > 0) {
      badges.review = String(openIssues);
    }
    if (connectionsCount !== null && connectionsCount > 0) {
      badges.connections = String(connectionsCount);
    }
    return badges;
  }, [view.events.length, view.issues, imports.length, connectionsCount]);

  return (
    <aside className="sidebar">
      <button
        className="brand"
        onClick={() => onNavigate("timeline")}
        type="button"
        aria-label="Mori — Timeline으로 이동"
      >
        <MoriLogo size={32} />
      </button>
      <nav className="nav">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div className="nav-group" key={group.label ?? `group-${groupIndex}`}>
            {group.label ? <p className="nav-group-label">{group.label}</p> : null}
            {group.items.map((item) => {
              const Icon = moriViewIcon[item.key];
              const badge = item.badge ?? liveBadges[item.key];
              return (
                <button
                  className={`nav-item ${isActive(item.key) ? "active" : ""}`}
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  type="button"
                  title={item.label}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {badge ? <b>{badge}</b> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <SidebarSessionCard />
      <SidebarSessionSwitcher onNavigate={onNavigate} />
      <SidebarProfile currentView={currentView} onNavigate={onNavigate} />
      <SidebarCollapseButton />
    </aside>
  );
}

/**
 * The lower-left work-context widget. This is deliberately NOT an "ongoing
 * recording" card: Mori reconstructs work from imported evidence, so the
 * widget shows *what the user is currently working with* (project + session +
 * origin) with an honest time span — never a running stopwatch unless a
 * genuine live capture stream exists (none does yet). See `buildWorkContext`.
 */
function SidebarSessionCard() {
  const draft = useMoriSessionStore((state) => state.draft);
  const analysisStatus = useMoriSessionStore((state) => state.analysisStatus);
  const endSession = useMoriSessionStore((state) => state.endSession);
  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

  const deriveInput = {
    draft,
    demoSession: moriMockSession.session,
    analysisStatus,
  };
  const [context, setContext] = useState(() => buildWorkContext(deriveInput));
  useEffect(() => {
    const snapshot = buildWorkContext(deriveInput);
    setContext(snapshot);
    // Only a genuine live capture ticks. Imported / manual / demo contexts
    // are static, so we never spin a per-second interval for them.
    if (!snapshot.isLive) return;
    const interval = window.setInterval(() => {
      setContext(buildWorkContext(deriveInput));
    }, 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, analysisStatus]);

  const timing = deriveSessionTiming(deriveInput);
  const endSessionFeature = getFeatureControlProps("appShell.endSession");
  const action = describeSessionCardAction(timing.state);

  return (
    <div className="session-card" role="region" aria-label="현재 작업 컨텍스트">
      <span className="session-card-kicker">
        <span className={`session-card-dot is-${context.tone}`} aria-hidden="true" />
        작업 컨텍스트
      </span>
      {context.projectLabel ? (
        <span className="session-card-project" title={context.projectLabel}>
          {context.projectLabel}
        </span>
      ) : null}
      <strong title={context.sessionTitle}>{context.sessionTitle}</strong>
      <span className="session-card-meta">
        <span className={`session-card-origin is-${context.tone}`}>
          {context.originLabel}
        </span>
        {context.timeDescriptor ? (
          <time
            className={context.isLive ? "is-live" : ""}
            aria-live={context.isLive ? "polite" : "off"}
          >
            {context.timeDescriptor}
            {context.timeCaption ? (
              <small className="session-card-time-caption"> {context.timeCaption}</small>
            ) : null}
          </time>
        ) : null}
      </span>
      {action.kind === "endSession" && context.origin === "manual" ? (
        <Button
          variant="secondary"
          disabled={!endSessionFeature.enabled}
          onClick={endSessionFeature.enabled ? endSession : undefined}
          title={
            endSessionFeature.enabled
              ? "이 작업 세션을 정리하고 완료로 표시합니다."
              : endSessionFeature.title
          }
        >
          세션 정리
        </Button>
      ) : (
        <Button
          variant="secondary"
          onClick={() => setCurrentView("reports")}
          title="이 세션의 리포트를 엽니다."
        >
          리포트 보기
        </Button>
      )}
    </div>
  );
}

const SWITCHER_VISIBLE_LIMIT = 6;
const OTHER_SESSIONS_LABEL = "기타 세션";

type SessionGroup = { label: string; sessions: StoredSessionSummary[] };

/**
 * Session switcher under the active-session card. Under the "1 Claude
 * conversation = 1 Mori session" model the user accumulates many small
 * sessions, so the sidebar offers one-click switching between them, grouped
 * by their Claude project (`sourceLabel`). Collapsed by default to keep the
 * shell quiet; shows the most recent few with a "전체 보기" escape hatch into
 * the Workspace.
 */
function SidebarSessionSwitcher({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const activeSessionId = useMoriSessionStore((state) => state.draft?.session.id ?? null);
  const source = useMoriSessionStore(selectSessionSource);
  const loadBrowserSession = useMoriSessionStore((state) => state.loadBrowserSession);
  const loadDesktopSession = useMoriSessionStore((state) => state.loadDesktopSession);

  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<StoredSessionSummary[]>([]);

  const refresh = useCallback(() => {
    try {
      setSessions(loadStoredSessionSummaries());
    } catch {
      // A switcher must never break the shell — fail closed to an empty list.
      setSessions([]);
    }
  }, []);

  // Reload the list whenever the panel opens or the active session changes
  // (a switch / new import should be reflected without a manual refresh).
  useEffect(() => {
    if (open) refresh();
  }, [open, activeSessionId, refresh]);

  const isDesktop = source === "desktop-sqlite";

  const handleSwitch = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      if (isDesktop) {
        void loadDesktopSession(sessionId).then((ok) => {
          // Fall back to the browser draft mirror when SQLite has no row.
          if (!ok) loadBrowserSession(sessionId);
        });
      } else {
        loadBrowserSession(sessionId);
      }
    },
    [activeSessionId, isDesktop, loadBrowserSession, loadDesktopSession],
  );

  const visible = sessions.slice(0, SWITCHER_VISIBLE_LIMIT);
  const groups = groupSessionsBySource(visible);
  const hasMore = sessions.length > visible.length;

  // Nothing to switch to (only the active session, or none): keep the
  // sidebar clean and render nothing.
  if (sessions.length <= 1) return null;

  return (
    <div className="session-switcher" data-open={open}>
      <button
        type="button"
        className="session-switcher-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <History size={14} aria-hidden="true" />
        <span>세션 전환</span>
        <b>{sessions.length}</b>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`session-switcher-chevron${open ? " is-open" : ""}`}
        />
      </button>
      {open ? (
        <div className="session-switcher-body mori-scroll">
          {groups.map((group) => (
            <div key={group.label} className="session-switcher-group">
              <p className="session-switcher-group-label" title={group.label}>
                <FolderGit2 size={12} aria-hidden="true" />
                <span>{group.label}</span>
              </p>
              <ul>
                {group.sessions.map((session) => {
                  const active = session.sessionId === activeSessionId;
                  return (
                    <li key={session.sessionId}>
                      <button
                        type="button"
                        className={`session-switcher-item${active ? " is-active" : ""}`}
                        onClick={() => handleSwitch(session.sessionId)}
                        aria-current={active ? "true" : undefined}
                        title={session.title}
                      >
                        <span className="session-switcher-item-title">{session.title}</span>
                        <span className="session-switcher-item-time">
                          {formatRelativeKo(session.startedAt || session.savedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {hasMore ? (
            <button
              type="button"
              className="session-switcher-all"
              onClick={() => onNavigate("workspace")}
            >
              전체 세션 보기 ({sessions.length})
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Group session summaries by their Claude project label, preserving the
 * most-recent-first order within each group. Sessions without a label fall
 * into a single trailing "기타 세션" bucket so manual / pre-import sessions
 * still appear.
 */
function groupSessionsBySource(sessions: StoredSessionSummary[]): SessionGroup[] {
  const order: string[] = [];
  const map = new Map<string, StoredSessionSummary[]>();
  for (const session of sessions) {
    const label = session.sourceLabel?.trim() || OTHER_SESSIONS_LABEL;
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(session);
  }
  // Keep the labelled groups first, the catch-all bucket last.
  order.sort((a, b) => {
    if (a === OTHER_SESSIONS_LABEL) return 1;
    if (b === OTHER_SESSIONS_LABEL) return -1;
    return 0;
  });
  return order.map((label) => ({ label, sessions: map.get(label)! }));
}

/** Compact Korean relative-time label for the switcher rows. */
function formatRelativeKo(iso: string, now: number = Date.now()): string {
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) return "";
  const diff = now - epoch;
  if (diff < 0) return new Date(epoch).toLocaleDateString();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(epoch).toLocaleDateString();
}

function SidebarProfile({
  currentView,
  onNavigate,
}: {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
}) {
  const profile = useMoriProfileStore((state) => state.profile);
  return (
    <button
      type="button"
      className={`profile ${currentView === "profile" ? "active" : ""}`}
      onClick={() => onNavigate("profile")}
      aria-label="계정 및 프로필 열기"
    >
      <div className="avatar">{getProfileInitials(profile.displayName)}</div>
      <div>
        <strong>{profile.displayName}</strong>
        <small>로컬 모드</small>
      </div>
      <span className="status-dot" />
    </button>
  );
}

function SidebarCollapseButton() {
  const collapseFeature = getFeatureControlProps("appShell.sidebarCollapse");
  return (
    <button
      className="collapse"
      type="button"
      aria-label="사이드바 접기"
      title={collapseFeature.title}
      disabled={!collapseFeature.enabled}
    >
      <ChevronLeft size={18} />
    </button>
  );
}

/**
 * One-shot session count for the Connections nav badge. The Connections
 * page already calls discovery on mount; we replicate a single read here
 * so the sidebar can hint how many Claude sessions are importable without
 * forcing the user to open the page first. Failures are swallowed — a
 * sidebar badge must never break the shell.
 */
function useConnectionsBadgeCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!isClaudeBridgeAvailable()) {
      setCount(null);
      return;
    }
    let cancelled = false;
    discoverClaudeCodeSessions()
      .then((sessions) => {
        if (cancelled) return;
        setCount(sessions.length);
      })
      .catch(() => {
        if (cancelled) return;
        setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}
