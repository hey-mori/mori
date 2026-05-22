import { useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { useMoriAppStore } from "./store";
import { useMoriSessionStore } from "./sessionStore";
import { useMoriRepositoryStore } from "./repositoryStore";
import { useMoriProfileStore } from "./profileStore";
import { useMoriThemeStore } from "./themeStore";
import { HomeView } from "../features/home/HomeView";
import { StartSessionView } from "../features/start-session/StartSessionView";
import { SessionDetailView } from "../features/session/SessionDetailView";
import { MemoryView } from "../features/memory/MemoryView";
import { CompanionInboxView } from "../features/companion/CompanionInboxView";
import { ConnectionsView } from "../features/connections/ConnectionsView";
import { WorkspaceView } from "../features/workspace/WorkspaceView";

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
    </AppShell>
  );
}
