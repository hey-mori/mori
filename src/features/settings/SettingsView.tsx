import {
  Bell,
  Bot,
  HardDrive,
  Palette,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useSessionStore } from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import {
  selectActiveRepository,
  useRepositoryStore,
} from "../../app/repositoryStore";
import { useAppStore } from "../../app/store";
import type { SettingsTab } from "../../app/store";
import { buildAnalysisRunHistoryViewModel } from "../../lib/analysis";
import { isTauriRuntime, pickRepositoryDirectory } from "../../lib/desktop";
import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import { LocalAiCard } from "./LocalAiCard";
import { StorageCard } from "./StorageCard";
import { RepositoriesCard } from "./RepositoriesCard";
import { ThemeCard } from "./ThemeCard";
import { DemoModeCard } from "./DemoModeCard";
import { NotificationsCard } from "./NotificationsCard";
import { SettingsSection } from "./SettingsPrimitives";

export const SETTINGS_TAB_DEFS: Array<{ id: SettingsTab; label: string; icon: typeof Bot }> = [
  { id: "localAi", label: "AI 엔진", icon: Bot },
  { id: "storage", label: "저장소", icon: HardDrive },
  { id: "appearance", label: "테마", icon: Palette },
  { id: "notifications", label: "알림", icon: Bell },
];

export function SettingsView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const settings = useSessionStore((state) => state.analysisSettings);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);
  const analysis = useSessionStore((state) => state.analysis);
  const loadAnalysisRunHistory = useSessionStore((state) => state.loadAnalysisRunHistory);
  const loadDesktopSession = useSessionStore((state) => state.loadDesktopSession);

  const sqliteAvailable = useSqliteStore((state) => state.available);
  const sqliteSessions = useSqliteStore((state) => state.sessions);
  const sqliteKind = useSqliteStore((state) => state.kind);
  const refreshSqlite = useSqliteStore((state) => state.refresh);

  const repositorySettings = useRepositoryStore((state) => state.settings);
  const repositoriesInitialized = useRepositoryStore((state) => state.initialized);
  const hydrateRepositories = useRepositoryStore((state) => state.hydrate);
  const addRepository = useRepositoryStore((state) => state.addRepository);
  const removeRepository = useRepositoryStore((state) => state.removeRepository);
  const renameRepository = useRepositoryStore((state) => state.renameRepository);
  const selectRepository = useRepositoryStore((state) => state.selectRepository);
  const verifyRepository = useRepositoryStore((state) => state.verifyRepository);
  const clearRepositoryVerification = useRepositoryStore((state) => state.clearRepositoryVerification);
  const verifyingId = useRepositoryStore((state) => state.verifyingId);
  const activeRepository = useRepositoryStore(selectActiveRepository);

  const setCurrentView = useAppStore((state) => state.navigate);
  const activeTab = useAppStore((state) => state.settingsTab);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

  useEffect(() => {
    if (!repositoriesInitialized) hydrateRepositories();
  }, [repositoriesInitialized, hydrateRepositories]);

  useEffect(() => {
    if (sqliteAvailable && sqliteKind !== "ok") void refreshSqlite();
  }, [sqliteAvailable, sqliteKind, refreshSqlite]);

  const desktopRuntime = useMemo(() => isTauriRuntime(), []);
  const mode: RuntimeMode = desktopRuntime ? "tauri-desktop" : "browser";

  const runHistory = useMemo(() => {
    const history = loadAnalysisRunHistory();
    return history ? buildAnalysisRunHistoryViewModel(history) : null;
    // Re-derive when a new run is adopted (analysis.runId) or after hydration.
  }, [loadAnalysisRunHistory, analysis?.runId, initialized]);

  async function handlePickRepository() {
    const result = await pickRepositoryDirectory({ title: "Mori: Select repository" });
    if (result.cancelled || !result.path) return null;
    return result.path;
  }

  return (
    <div className="settings-content-stack settings-page">
      <div className="settings-main">
        {activeTab === "localAi" ? (
          <LocalAiCard
            settings={settings}
            runHistory={runHistory}
            onProviderChange={(provider) => updateAnalysisSettings({ provider })}
            onUpdateSettings={(patch) => updateAnalysisSettings(patch)}
          />
        ) : null}
        {activeTab === "storage" ? (
          <>
            <DemoModeCard
              onGoToConnections={() => setCurrentView("connections")}
              onOpenSession={() => setCurrentView("session")}
            />
            <StorageCard
              mode={mode}
              sqliteKind={sqliteKind}
              sqliteSessionCount={sqliteSessions.length}
            />
            <SqliteLoadCard sessions={sqliteSessions} onLoad={loadDesktopSession} />
            <RepositoriesCard
              repositories={repositorySettings.repositories}
              desktopRuntime={desktopRuntime}
              defaultRepositoryId={activeRepository?.id ?? null}
              verifyingId={verifyingId}
              onAdd={({ path, label }) => addRepository({ path, label })}
              onPickDirectory={handlePickRepository}
              onRename={(id, label) => renameRepository(id, label)}
              onSelect={(id) => selectRepository(id)}
              onVerify={(id) => verifyRepository(id)}
              onClearVerification={(id) => clearRepositoryVerification(id)}
              onRemove={(id) => removeRepository(id)}
            />
          </>
        ) : null}
        {activeTab === "appearance" ? <ThemeCard /> : null}
        {activeTab === "notifications" ? <NotificationsCard /> : null}
      </div>

    </div>
  );
}

function SqliteLoadCard({
  sessions,
  onLoad,
}: {
  sessions: ReturnType<typeof useSqliteStore.getState>["sessions"];
  onLoad: (id: string) => Promise<boolean>;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (sessions.length === 0) return null;
  return (
    <SettingsSection
      title="저장된 세션"
      action={
        <Badge tone="purple">{sessions.length}개 세션</Badge>
      }
    >
      <ul className="settings-sqlite-saved-list">
        {sessions.map((entry) => (
          <li key={entry.sessionId}>
            <div>
              <strong>{entry.title}</strong>
              <small>
                {entry.projectName} · 이벤트 {entry.eventCount}개 · 출처 {entry.sourceCount}개
              </small>
            </div>
            <Badge tone={entry.status === "complete" ? "gray" : "green"}>
              {entry.status === "complete" ? "완료" : "진행 중"}
            </Badge>
            <Button
              disabled={loadingId === entry.sessionId}
              onClick={async () => {
                setError(null);
                setLoadingId(entry.sessionId);
                try {
                  const ok = await onLoad(entry.sessionId);
                  if (!ok) setError("SQLite에서 세션을 불러오지 못했습니다.");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "세션을 불러오지 못했습니다.");
                } finally {
                  setLoadingId(null);
                }
              }}
            >
              {loadingId === entry.sessionId ? "불러오는 중..." : "불러오기"}
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="settings-sqlite-error" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
}
