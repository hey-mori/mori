import { lazy, Suspense, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ErrorBoundary } from "../components/layout/ErrorBoundary";
import { useAppStore } from "./store";
import { useSessionStore } from "./sessionStore";
import { useProfileStore } from "./profileStore";
import { useThemeStore } from "./themeStore";
import { useOnboardingStore } from "./onboardingStore";
import { FirstRunGuide } from "../features/onboarding/FirstRunGuide";
import { BaseTooltipProvider } from "../components/ui/BaseTooltip";
import { isImportFlowView } from "../lib/session/importFlowView";
import { isClaudeBridgeAvailable } from "../lib/claude/claudeTauri";
import { AmbientObservationProvider } from "../features/live-session/useAmbientObservation";
import { useDurableDocumentAdoption } from "./useDurableDocumentAdoption";
// HomeView is the landing surface — stay eager so first paint never waits
// on a chunk fetch. Every other surface is loaded on demand; Vite emits a
// separate chunk per dynamic import, shrinking the entry bundle.
import { HomeView } from "../features/home/HomeView";

// The retired continuation surface ("이어가기"), reached from Home's 검토 이어가기
// action and the command palette — lazy so it never weighs on first paint.
const HomeContinuationView = lazy(() =>
  import("../features/home/HomeContinuationView").then((m) => ({
    default: m.HomeContinuationView,
  })),
);
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
const AskMoriView = lazy(() =>
  import("../features/memory/AskMoriView").then((m) => ({ default: m.AskMoriView })),
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
const LiveSessionView = lazy(() =>
  import("../features/live-session/LiveSessionView").then((m) => ({
    default: m.LiveSessionView,
  })),
);
const MemoryHubView = lazy(() =>
  import("../features/memory-hub/MemoryHubView").then((m) => ({
    default: m.MemoryHubView,
  })),
);
const SessionsWorkspace = lazy(() =>
  import("../features/session/SessionsWorkspace").then((m) => ({
    default: m.SessionsWorkspace,
  })),
);
const LedgerWorkspace = lazy(() =>
  import("../features/record-ledger/LedgerWorkspace").then((m) => ({
    default: m.LedgerWorkspace,
  })),
);
const ContextView = lazy(() =>
  import("../features/record-ledger/ContextView").then((m) => ({
    default: m.ContextView,
  })),
);
const CalendarView = lazy(() =>
  import("../features/record-ledger/CalendarView").then((m) => ({
    default: m.CalendarView,
  })),
);
export default function App() {
  const currentView = useAppStore((state) => state.currentView);
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const hydrateProfile = useProfileStore((state) => state.hydrate);
  const profileInitialized = useProfileStore((state) => state.initialized);
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const themeInitialized = useThemeStore((state) => state.initialized);
  const hydrateOnboarding = useOnboardingStore((state) => state.hydrate);
  const onboardingInitialized = useOnboardingStore((state) => state.initialized);
  const pendingNewSession = useSessionStore((state) => state.pendingNewSession);
  const abandonPendingNewSessionIfEmpty = useSessionStore(
    (state) => state.abandonPendingNewSessionIfEmpty,
  );

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  // Importing a conversation eagerly creates the session before the user
  // confirms the review. The explicit 취소 cleans up that empty session, but
  // simply navigating away (to Home, a project, Memory, …) used to leave it
  // behind as an orphan with a dangling review. When the user leaves the
  // import / review flow without applying anything, abandon the empty session
  // here, mirroring 취소. Applied sessions are real work and are kept.
  useEffect(() => {
    if (pendingNewSession && !isImportFlowView(currentView)) {
      abandonPendingNewSessionIfEmpty();
    }
  }, [currentView, pendingNewSession, abandonPendingNewSessionIfEmpty]);


  useEffect(() => {
    if (!profileInitialized) hydrateProfile();
  }, [profileInitialized, hydrateProfile]);

  useEffect(() => {
    if (!themeInitialized) hydrateTheme();
  }, [themeInitialized, hydrateTheme]);

  useEffect(() => {
    if (!onboardingInitialized) hydrateOnboarding();
  }, [onboardingInitialized, hydrateOnboarding]);

  // Copies durable documents that predate dual-write into SQLite, once per
  // device. Desktop-only, and nothing on screen waits for it.
  useDurableDocumentAdoption();

  // Settings + profile no longer have a standing route — they live behind the
  // top-bar user button as a sheet (`SettingsSheet`, rendered inside AppShell).
  // Any legacy `navigate("settings")` is rerouted by the store to open the
  // sheet instead of changing `currentView`, so the workspace stays on the
  // user's last real surface.
  return (
    <BaseTooltipProvider>
      {/* The observation provider wraps the shell because the sidebar shows the
          watching state, so it sits above the route boundary below. That means a
          fault here would blank the whole window with nothing to catch it, which
          is exactly what happened once. It gets its own boundary; the hook is
          also defensive in its own right. */}
      <ErrorBoundary resetKey="shell">
        <AmbientObservationProvider
          // Both routes that put the live feed on screen. `LiveSessionView`
          // renders inside 세션 AND standalone at `liveSession`, so checking
          // only the first would poll at the slow background cadence while the
          // user sits watching the feed on the second.
          sessionViewOpen={currentView === "sessions" || currentView === "liveSession"}
          available={isClaudeBridgeAvailable()}
        >
          <AppShell>
        <ErrorBoundary resetKey={currentView}>
          <Suspense fallback={<RouteFallback />}>
            {currentView === "home" ? <HomeView /> : null}
            {currentView === "continue" ? <HomeContinuationView /> : null}
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
            {currentView === "ask" ? <AskMoriView /> : null}
            {currentView === "companion" ? <CompanionInboxView /> : null}
            {currentView === "connections" ? <SourcesView /> : null}
            {currentView === "dashboard" ? <DashboardView /> : null}
            {currentView === "workbench" ? <WorkbenchView /> : null}
            {currentView === "workspace" ? <WorkspaceView /> : null}
            {currentView === "project" ? <ProjectView /> : null}
            {currentView === "graph" ? <GraphView /> : null}
            {currentView === "liveSession" ? <LiveSessionView /> : null}
            {currentView === "sessions" ? <SessionsWorkspace /> : null}
            {currentView === "memoryHub" ? <MemoryHubView /> : null}
            {currentView === "ledger" ? <LedgerWorkspace /> : null}
            {currentView === "calendar" ? <CalendarView /> : null}
            {currentView === "contexts" ? <ContextView /> : null}
            </Suspense>
          </ErrorBoundary>
        </AppShell>
        </AmbientObservationProvider>
      </ErrorBoundary>
      {/* First-run guide: a full-bleed overlay above the shell that shows only
          on a truly empty first launch or when reopened. It renders null
          otherwise, so it costs nothing on a returning user. */}
      <FirstRunGuide />
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
