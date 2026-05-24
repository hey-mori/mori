import { lazy, Suspense, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ErrorBoundary } from "../components/layout/ErrorBoundary";
import { useMoriAppStore } from "./store";
import { useMoriSessionStore } from "./sessionStore";
import { useMoriRepositoryStore } from "./repositoryStore";
import { useMoriProfileStore } from "./profileStore";
import { useMoriThemeStore } from "./themeStore";
// HomeView is the landing surface — stay eager so first paint never waits
// on a chunk fetch. Every other surface is loaded on demand; Vite emits a
// separate chunk per dynamic import, shrinking the entry bundle.
import { HomeView } from "../features/home/HomeView";

const StartSessionView = lazy(() =>
  import("../features/start-session/StartSessionView").then((m) => ({
    default: m.StartSessionView,
  })),
);
const SessionDetailView = lazy(() =>
  import("../features/session/SessionDetailView").then((m) => ({
    default: m.SessionDetailView,
  })),
);
const MemoryView = lazy(() =>
  import("../features/memory/MemoryView").then((m) => ({ default: m.MemoryView })),
);
const CompanionInboxView = lazy(() =>
  import("../features/companion/CompanionInboxView").then((m) => ({
    default: m.CompanionInboxView,
  })),
);
const ConnectionsView = lazy(() =>
  import("../features/connections/ConnectionsView").then((m) => ({
    default: m.ConnectionsView,
  })),
);
const WorkspaceView = lazy(() =>
  import("../features/workspace/WorkspaceView").then((m) => ({
    default: m.WorkspaceView,
  })),
);

export default function App() {
  const currentView = useMoriAppStore((state) => state.currentView);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const hydrateRepositories = useMoriRepositoryStore((state) => state.hydrate);
  const repositoriesInitialized = useMoriRepositoryStore((state) => state.initialized);
  const hydrateProfile = useMoriProfileStore((state) => state.hydrate);
  const profileInitialized = useMoriProfileStore((state) => state.initialized);
  const hydrateTheme = useMoriThemeStore((state) => state.hydrate);
  const themeInitialized = useMoriThemeStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  useEffect(() => {
    if (!repositoriesInitialized) hydrateRepositories();
  }, [repositoriesInitialized, hydrateRepositories]);

  useEffect(() => {
    if (!profileInitialized) hydrateProfile();
  }, [profileInitialized, hydrateProfile]);

  useEffect(() => {
    if (!themeInitialized) hydrateTheme();
  }, [themeInitialized, hydrateTheme]);

  // Settings + profile no longer have a standing route — they live behind the
  // top-bar user button as a sheet (`SettingsSheet`, rendered inside AppShell).
  // Any legacy `navigate("settings")` is rerouted by the store to open the
  // sheet instead of changing `currentView`, so the workspace stays on the
  // user's last real surface.
  return (
    <AppShell>
      <ErrorBoundary resetKey={currentView}>
        <Suspense fallback={<RouteFallback />}>
          {currentView === "home" ? <HomeView /> : null}
          {currentView === "start" ? <StartSessionView /> : null}
          {/* The unified session workspace. The legacy timeline / flow / evidence /
              review keys map here too so no deep link dead-ends — they all open
              the one tabbed Session Detail rather than a standalone page. A
              report is per-session, so `reports` opens the session workspace on
              its 리포트 tab. */}
          {currentView === "session" ||
          currentView === "timeline" ||
          currentView === "flow" ||
          currentView === "evidence" ||
          currentView === "review" ||
          currentView === "reports" ? (
            <SessionDetailView />
          ) : null}
          {/* Memory is cross-session; consolidation is its 통합 segment. */}
          {currentView === "memory" || currentView === "consolidation" ? <MemoryView /> : null}
          {currentView === "companion" ? <CompanionInboxView /> : null}
          {currentView === "connections" ? <ConnectionsView /> : null}
          {currentView === "workspace" ? <WorkspaceView /> : null}
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

/**
 * Lazy-route fallback — a calm, full-bleed placeholder that prevents the
 * shell from collapsing while a chunk is in flight. The fetch is usually a
 * few hundred ms; a spinner would feel noisier than this single line.
 */
function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span>불러오는 중…</span>
    </div>
  );
}
