import { lazy, Suspense, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ErrorBoundary } from "../components/layout/ErrorBoundary";
import { useAppStore } from "./store";
import { useSessionStore } from "./sessionStore";
import { useRepositoryStore } from "./repositoryStore";
import { useProfileStore } from "./profileStore";
import { useThemeStore } from "./themeStore";
import { BaseTooltipProvider } from "../components/ui/BaseTooltip";
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
const SourcesView = lazy(() =>
  import("../features/sources/SourcesView").then((m) => ({
    default: m.SourcesView,
  })),
);
const DashboardView = lazy(() =>
  import("../features/dashboard/DashboardView").then((m) => ({
    default: m.DashboardView,
  })),
);
const WorkbenchView = lazy(() =>
  import("../features/workbench/WorkbenchView").then((m) => ({
    default: m.WorkbenchView,
  })),
);
const WorkspaceView = lazy(() =>
  import("../features/workspace/WorkspaceView").then((m) => ({
    default: m.WorkspaceView,
  })),
);
const ProjectView = lazy(() =>
  import("../features/project/ProjectView").then((m) => ({
    default: m.ProjectView,
  })),
);
const GraphView = lazy(() =>
  import("../features/graph/GraphView").then((m) => ({
    default: m.GraphView,
  })),
);
export default function App() {
  const currentView = useAppStore((state) => state.currentView);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const hydrateRepositories = useRepositoryStore((state) => state.hydrate);
  const repositoriesInitialized = useRepositoryStore((state) => state.initialized);
  const hydrateProfile = useProfileStore((state) => state.hydrate);
  const profileInitialized = useProfileStore((state) => state.initialized);
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const themeInitialized = useThemeStore((state) => state.initialized);

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
    <BaseTooltipProvider>
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
            {currentView === "connections" ? <SourcesView /> : null}
            {currentView === "dashboard" ? <DashboardView /> : null}
            {currentView === "workbench" ? <WorkbenchView /> : null}
            {currentView === "workspace" ? <WorkspaceView /> : null}
            {currentView === "project" ? <ProjectView /> : null}
            {currentView === "graph" ? <GraphView /> : null}
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    </BaseTooltipProvider>
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
