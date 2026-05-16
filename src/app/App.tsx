import { useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { useMoriAppStore } from "./store";
import { useMoriSessionStore } from "./sessionStore";
import { useMoriRepositoryStore } from "./repositoryStore";
import { useMoriProfileStore } from "./profileStore";
import { StartSessionView } from "../features/start-session/StartSessionView";
import { TimelineView } from "../features/timeline/TimelineView";
import { ReviewView } from "../features/review/ReviewView";
import { EvidenceView } from "../features/evidence/EvidenceView";
import { ReportsView } from "../features/reports/ReportsView";
import { MemoryView } from "../features/memory/MemoryView";
import { ConsolidationReviewView } from "../features/memory/ConsolidationReviewView";
import { CompanionInboxView } from "../features/companion/CompanionInboxView";
import { AccountProfileView } from "../features/account/AccountProfileView";
import { LoginView } from "../features/account/LoginView";
import { SettingsView } from "../features/settings/SettingsView";

export default function App() {
  const currentView = useMoriAppStore((state) => state.currentView);
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const hydrateRepositories = useMoriRepositoryStore((state) => state.hydrate);
  const repositoriesInitialized = useMoriRepositoryStore((state) => state.initialized);
  const hydrateProfile = useMoriProfileStore((state) => state.hydrate);
  const profileInitialized = useMoriProfileStore((state) => state.initialized);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  useEffect(() => {
    if (!repositoriesInitialized) hydrateRepositories();
  }, [repositoriesInitialized, hydrateRepositories]);

  useEffect(() => {
    if (!profileInitialized) hydrateProfile();
  }, [profileInitialized, hydrateProfile]);

  return (
    <AppShell>
      {currentView === "start" ? <StartSessionView /> : null}
      {currentView === "timeline" ? <TimelineView mode="timeline" /> : null}
      {currentView === "flow" ? <TimelineView mode="flow" /> : null}
      {currentView === "evidence" ? <EvidenceView /> : null}
      {currentView === "review" ? <ReviewView /> : null}
      {currentView === "reports" ? <ReportsView /> : null}
      {currentView === "memory" ? <MemoryView /> : null}
      {currentView === "consolidation" ? <ConsolidationReviewView /> : null}
      {currentView === "companion" ? <CompanionInboxView /> : null}
      {currentView === "profile" ? <AccountProfileView /> : null}
      {currentView === "login" ? <LoginView /> : null}
      {currentView === "settings" ? <SettingsView /> : null}
    </AppShell>
  );
}
