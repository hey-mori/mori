import { AppShell } from "../components/layout/AppShell";
import { useMoriAppStore } from "./store";
import { StartSessionView } from "../features/start-session/StartSessionView";
import { TimelineView } from "../features/timeline/TimelineView";
import { IssuesDecisionsView } from "../features/issues/IssuesDecisionsView";
import { SourcesEvidenceView } from "../features/sources/SourcesEvidenceView";
import { ResumeReportView } from "../features/reports/ResumeReportView";
import { ProjectView } from "../features/projects/ProjectView";
import { SettingsView } from "../features/settings/SettingsView";

export default function App() {
  const currentView = useMoriAppStore((state) => state.currentView);

  return (
    <AppShell>
      {currentView === "start" ? <StartSessionView /> : null}
      {currentView === "timeline" ? <TimelineView mode="timeline" /> : null}
      {currentView === "flow" ? <TimelineView mode="flow" /> : null}
      {currentView === "issues" ? <IssuesDecisionsView /> : null}
      {currentView === "sources" ? <SourcesEvidenceView /> : null}
      {currentView === "reports" ? <ResumeReportView /> : null}
      {currentView === "projects" ? <ProjectView /> : null}
      {currentView === "settings" ? <SettingsView /> : null}
    </AppShell>
  );
}
