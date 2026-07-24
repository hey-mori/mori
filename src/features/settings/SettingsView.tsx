import {
  Bell,
  Bot,
  HardDrive,
  Info,
  Link2,
  Palette,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { useSessionStore } from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import { useAppStore } from "../../app/store";
import type { SettingsTab } from "../../app/store";
import { buildAnalysisRunHistoryViewModel } from "../../lib/analysis";
import { isTauriRuntime } from "../../lib/desktop";
import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import { BackgroundWatchCard } from "./BackgroundWatchCard";
import { AutoImportCard } from "./AutoImportCard";
import { RequestDisclosureCard } from "./RequestDisclosureCard";
import { AgentConnectionsCard } from "./AgentConnectionsCard";
import { LocalAiCard } from "./LocalAiCard";
import { StorageCard } from "./StorageCard";
import { ThemeCard } from "./ThemeCard";
import { DemoModeCard } from "./DemoModeCard";
import { DatabaseRecoveryCard } from "./DatabaseRecoveryCard";
import { NotificationsCard } from "./NotificationsCard";
import { SettingsSection } from "./SettingsPrimitives";
import { SourcesView } from "../sources/SourcesView";
import { AboutCard } from "./AboutCard";

export const SETTINGS_TAB_DEFS: Array<{ id: SettingsTab; label: string; icon: typeof Bot }> = [
  { id: "localAi", label: "분석 엔진", icon: Bot },
  { id: "connections", label: "연동", icon: Link2 },
  // 개인정보 holds the one control that decides how much of the user's own
  // request text is shown, including in an exported report. The tab key already
  // existed in SettingsTab but had no definition here, which left the only UI
  // that can change that default unreachable.
  { id: "privacy", label: "개인정보", icon: ShieldCheck },
  { id: "storage", label: "저장소", icon: HardDrive },
  { id: "appearance", label: "테마", icon: Palette },
  { id: "notifications", label: "알림", icon: Bell },
  { id: "about", label: "정보", icon: Info },
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

  const activeTab = useAppStore((state) => state.settingsTab);

  useEffect(() => {
    if (!initialized) hydrate();
  }, [initialized, hydrate]);

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

  return (
    <div
      className={`settings-content-stack settings-page${
        activeTab === "connections" ? " settings-content-stack--wide" : ""
      }`}
    >
      <div className="settings-main">
        {activeTab === "localAi" ? (
          <>
            <LocalAiCard
              settings={settings}
              runHistory={runHistory}
              onProviderChange={(provider) => updateAnalysisSettings({ provider })}
              onUpdateSettings={(patch) => updateAnalysisSettings(patch)}
            />
            <BackgroundWatchCard />
          </>
        ) : null}
        {activeTab === "connections" ? (
          <>
            <AutoImportCard />
            <AgentConnectionsCard />
            <details className="settings-advanced">
              <summary className="settings-advanced-summary">직접 연결 · 가져오기 (고급)</summary>
              <p className="settings-inline-note">
                자동 수집이 켜져 있으면 대부분 필요 없습니다. Claude 실시간 연결(훅)
                설정이나 특정 세션·대화를 직접 가져올 때 씁니다. 새 세션을 하나 만들려면
                왼쪽 위 <strong>+</strong> · <strong>새 세션</strong>이 더 편합니다.
              </p>
              <SourcesView embedded />
            </details>
          </>
        ) : null}
        {activeTab === "privacy" ? <RequestDisclosureCard /> : null}
        {activeTab === "storage" ? (
          <>
            <DatabaseRecoveryCard />
            <DemoModeCard />
            <StorageCard />
            <SqliteLoadCard sessions={sqliteSessions} onLoad={loadDesktopSession} />
          </>
        ) : null}
        {activeTab === "appearance" ? <ThemeCard /> : null}
        {activeTab === "notifications" ? <NotificationsCard /> : null}
        {activeTab === "about" ? (
          <AboutCard mode={mode} sqliteSessionCount={sqliteSessions.length} />
        ) : null}
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
    <SettingsSection title="저장된 세션">
      <ul className="settings-sqlite-saved-list">
        {sessions.map((entry) => (
          <li key={entry.sessionId}>
            <div>
              <strong>{entry.title}</strong>
              <small>
                {entry.projectName} · 이벤트 {entry.eventCount}개 · 출처 {entry.sourceCount}개
              </small>
            </div>
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
