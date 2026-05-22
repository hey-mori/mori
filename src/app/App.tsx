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
import { ReportsView } from "../features/reports/ReportsView";
import { MemoryView } from "../features/memory/MemoryView";
import { ConsolidationReviewView } from "../features/memory/ConsolidationReviewView";
import { CompanionInboxView } from "../features/companion/CompanionInboxView";
import { ConnectionsView } from "../features/connections/ConnectionsView";
import { WorkspaceView } from "../features/workspace/WorkspaceView";
import { AccountProfileView } from "../features/account/AccountProfileView";
import { LoginView } from "../features/account/LoginView";
import { SecurityView } from "../features/account/SecurityView";
import { SettingsView } from "../features/settings/SettingsView";

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

  return (
    <AppShell>
      {currentView === "home" ? <HomeView /> : null}
      {currentView === "start" ? <StartSessionView /> : null}
      {/* The unified session workspace. The legacy timeline / flow / evidence /
          review keys map here too so no deep link dead-ends — they all open the
          one tabbed Session Detail rather than a standalone page. */}
      {currentView === "session" ||
      currentView === "timeline" ||
      currentView === "flow" ||
      currentView === "evidence" ||
      currentView === "review" ? (
        <SessionDetailView />
      ) : null}
      {currentView === "reports" ? <ReportsView /> : null}
      {currentView === "memory" ? <MemoryView /> : null}
      {currentView === "consolidation" ? <ConsolidationReviewView /> : null}
      {currentView === "companion" ? <CompanionInboxView /> : null}
      {currentView === "connections" ? <ConnectionsView /> : null}
      {currentView === "workspace" ? <WorkspaceView /> : null}
      {currentView === "profile" ? <AccountProfileView /> : null}
      {currentView === "login" ? <LoginView /> : null}
      {currentView === "security" ? <SecurityView /> : null}
      {currentView === "settings" ? <SettingsView /> : null}
    </AppShell>
  );
}
