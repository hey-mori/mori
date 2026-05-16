import {
  Bot,
  HardDrive,
  Layers,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SessionModeBanner } from "../../components/layout/SessionModeBanner";
import {
  selectHasRealAnalysis,
  selectSessionMode,
  selectSessionView,
  useMoriSessionStore,
} from "../../app/sessionStore";
import { useMoriSqliteStore } from "../../app/sqliteStore";
import {
  selectActiveRepository,
  useMoriRepositoryStore,
} from "../../app/repositoryStore";
import { useMoriAppStore } from "../../app/store";
import { isTauriRuntime, pickRepositoryDirectory } from "../../lib/desktop";
import type { ViewKey } from "../../domain/types";
import type { RuntimeMode, RecommendedSetupStep } from "../../lib/settings/settingsStatus";
import { getProductRuntimeLabel } from "../../lib/product-state/productState";
import { LocalAiCard } from "./LocalAiCard";
import { PrivacyDefaultsCard } from "./PrivacyDefaultsCard";
import { PrivacyGuaranteesCard } from "./PrivacyGuaranteesCard";
import { StorageCard } from "./StorageCard";
import { RepositoriesCard } from "./RepositoriesCard";
import { PlannedConnectorsCard } from "./PlannedConnectorsCard";
import { TrustSummaryPanel } from "./TrustSummaryPanel";

type SettingsTab = "localAi" | "privacy" | "storage" | "repositories" | "connectors";

const TAB_DEFS: Array<{ id: SettingsTab; label: string; icon: typeof Bot }> = [
  { id: "localAi", label: "로컬 AI", icon: Bot },
  { id: "privacy", label: "개인정보", icon: Lock },
  { id: "storage", label: "저장소", icon: HardDrive },
  { id: "repositories", label: "리포지토리", icon: ShieldCheck },
  { id: "connectors", label: "커넥터", icon: Layers },
];

export function SettingsView() {
  const hydrate = useMoriSessionStore((state) => state.hydrate);
  const initialized = useMoriSessionStore((state) => state.initialized);
  const settings = useMoriSessionStore((state) => state.analysisSettings);
  const updateAnalysisSettings = useMoriSessionStore((state) => state.updateAnalysisSettings);
  const sessionView = useMoriSessionStore(selectSessionView);
  const sessionMode = useMoriSessionStore(selectSessionMode);
  const sessionDraft = useMoriSessionStore((state) => state.draft);
  const imports = useMoriSessionStore((state) => state.imports);
  const hasAnalysis = useMoriSessionStore(selectHasRealAnalysis);
  const loadDesktopSession = useMoriSessionStore((state) => state.loadDesktopSession);

  const sqliteAvailable = useMoriSqliteStore((state) => state.available);
  const sqliteStatus = useMoriSqliteStore((state) => state.status);
  const sqliteSessions = useMoriSqliteStore((state) => state.sessions);
  const sqliteKind = useMoriSqliteStore((state) => state.kind);
  const sqliteError = useMoriSqliteStore((state) => state.error);
  const lastPersist = useMoriSqliteStore((state) => state.lastPersist);
  const refreshSqlite = useMoriSqliteStore((state) => state.refresh);
  const initializeSqlite = useMoriSqliteStore((state) => state.initialize);
  const persistSqlite = useMoriSqliteStore((state) => state.persist);

  const repositorySettings = useMoriRepositoryStore((state) => state.settings);
  const repositoriesInitialized = useMoriRepositoryStore((state) => state.initialized);
  const hydrateRepositories = useMoriRepositoryStore((state) => state.hydrate);
  const addRepository = useMoriRepositoryStore((state) => state.addRepository);
  const removeRepository = useMoriRepositoryStore((state) => state.removeRepository);
  const renameRepository = useMoriRepositoryStore((state) => state.renameRepository);
  const selectRepository = useMoriRepositoryStore((state) => state.selectRepository);
  const verifyRepository = useMoriRepositoryStore((state) => state.verifyRepository);
  const clearRepositoryVerification = useMoriRepositoryStore((state) => state.clearRepositoryVerification);
  const verifyingId = useMoriRepositoryStore((state) => state.verifyingId);
  const activeRepository = useMoriRepositoryStore(selectActiveRepository);

  const setCurrentView = useMoriAppStore((state) => state.setCurrentView);

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

  const [activeTab, setActiveTab] = useState<SettingsTab>("localAi");

  const providerLabel =
    settings.provider === "ollama"
      ? `Ollama · ${settings.ollamaModel}`
      : "Deterministic Quick Pass";

  function navigateForStep(step: RecommendedSetupStep) {
    const targetMap: Partial<Record<RecommendedSetupStep["id"], ViewKey>> = {
      "import-source": "evidence",
      "run-quickpass": "review",
      "verify-repository": "settings",
      "save-to-sqlite": "settings",
      "configure-ollama": "settings",
    };
    const view = targetMap[step.id];
    if (view) setCurrentView(view);
    if (step.id === "verify-repository") setActiveTab("repositories");
    if (step.id === "save-to-sqlite") setActiveTab("storage");
    if (step.id === "configure-ollama") setActiveTab("localAi");
  }

  async function handlePickRepository() {
    const result = await pickRepositoryDirectory({ title: "Mori: Select repository" });
    if (result.cancelled || !result.path) return null;
    return result.path;
  }

  return (
    <div className="page settings-workspace">
      <PageHeader
        title="Settings"
        subtitle="Mori의 로컬-퍼스트 동작을 한곳에서 관리합니다. Privacy · Local AI · Storage · Repositories · 그리고 아직 비활성화된 Planned Connectors까지 정직하게 보여줍니다."
        right={
          <div className="settings-page-actions">
            <Badge tone={sessionMode === "demo" ? "gray" : "green"}>
              {sessionMode === "demo" ? "데모 세션" : "실제 세션"}
            </Badge>
            <Badge tone="purple">{mode === "tauri-desktop" ? "Tauri desktop" : "Browser"}</Badge>
          </div>
        }
      />
      <SessionModeBanner />

      <StatusStrip
        mode={mode}
        sqliteKind={sqliteKind}
        sqliteSessionCount={sqliteSessions.length}
        repositoryCount={repositorySettings.repositories.length}
        sourceCount={sessionView.sources.length}
        providerLabel={providerLabel}
        hasAnalysis={hasAnalysis}
        importsCount={imports.length}
      />

      <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TAB_DEFS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="settings-layout">
        <div className="settings-main">
          {activeTab === "localAi" ? (
            <LocalAiCard
              settings={settings}
              onProviderChange={(provider) => updateAnalysisSettings({ provider })}
              onUpdateSettings={(patch) => updateAnalysisSettings(patch)}
            />
          ) : null}
          {activeTab === "privacy" ? (
            <>
              <PrivacyDefaultsCard />
              <PrivacyGuaranteesCard />
            </>
          ) : null}
          {activeTab === "storage" ? (
            <StorageCard
              mode={mode}
              sqliteAvailable={sqliteAvailable}
              sqliteKind={sqliteKind}
              sqliteStatus={sqliteStatus}
              sqliteSessions={sqliteSessions}
              sqliteError={sqliteError}
              lastPersist={lastPersist}
              packageDraftCount={0}
              canPersist={Boolean(sessionDraft) && sqliteKind !== "checking"}
              onInitializeSqlite={() => initializeSqlite()}
              onRefreshSqlite={() => refreshSqlite()}
              onPersistSession={() => persistSqlite(sessionView)}
              onOpenReports={() => setCurrentView("reports")}
            />
          ) : null}
          {activeTab === "repositories" ? (
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
          ) : null}
          {activeTab === "connectors" ? <PlannedConnectorsCard /> : null}
          {activeTab === "storage" ? (
            <SqliteLoadCard
              sessions={sqliteSessions}
              onLoad={loadDesktopSession}
            />
          ) : null}
        </div>

        <TrustSummaryPanel
          mode={mode}
          sqliteKind={sqliteKind}
          providerKind={settings.provider}
          providerLabel={providerLabel}
          importsCount={imports.length}
          hasAnalysis={hasAnalysis}
          hasUnsavedDraft={Boolean(sessionDraft) && sqliteKind === "ok"}
          repositoriesTotal={repositorySettings.repositories.length}
          sessionMode={sessionMode}
          onAction={navigateForStep}
        />
      </div>
    </div>
  );
}

type RuntimeStatTone = "ok" | "info" | "idle" | "warn" | "error";

function StatusStrip({
  mode,
  sqliteKind,
  sqliteSessionCount,
  repositoryCount,
  sourceCount,
  providerLabel,
  hasAnalysis,
  importsCount,
}: {
  mode: RuntimeMode;
  sqliteKind: "ok" | "checking" | "error" | "unavailable";
  sqliteSessionCount: number;
  repositoryCount: number;
  sourceCount: number;
  providerLabel: string;
  hasAnalysis: boolean;
  importsCount: number;
}) {
  // Honest storage language: the browser prototype's store *is*
  // localStorage — it is not a broken SQLite, so it never reads "error".
  // Runtime / storage names come from the shared product-state model.
  const sqliteLabel = getProductRuntimeLabel("desktopSQLite");
  const storage: { value: string; tone: RuntimeStatTone } =
    mode === "tauri-desktop"
      ? sqliteKind === "ok"
        ? { value: `${sqliteLabel} · ${sqliteSessionCount}개 저장됨`, tone: "ok" }
        : sqliteKind === "error"
          ? { value: `${sqliteLabel} · 오류`, tone: "error" }
          : sqliteKind === "checking"
            ? { value: `${sqliteLabel} · 확인 중…`, tone: "idle" }
            : { value: `${sqliteLabel} · 사용 불가`, tone: "warn" }
      : { value: getProductRuntimeLabel("browserLocalStorage"), tone: "info" };
  return (
    <div className="settings-runtime-summary" role="region" aria-label="Mori runtime status">
      <RuntimeStat
        label="Runtime"
        value={mode === "tauri-desktop" ? "Tauri desktop" : "Browser prototype"}
        tone="info"
      />
      <RuntimeStat label="Storage" value={storage.value} tone={storage.tone} />
      <RuntimeStat
        label="AI provider"
        value={`${providerLabel}${hasAnalysis ? " · analysis run" : ""}`}
        tone={hasAnalysis ? "ok" : "idle"}
      />
      <RuntimeStat
        label="This session"
        value={`${importsCount} imports · ${sourceCount} sources · ${repositoryCount} repos`}
        tone={importsCount > 0 || sourceCount > 0 ? "info" : "idle"}
      />
    </div>
  );
}

function RuntimeStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: RuntimeStatTone;
}) {
  return (
    <div className={`runtime-stat tone-${tone}`}>
      <span className="runtime-stat-dot" aria-hidden="true" />
      <div>
        <span className="runtime-stat-label">{label}</span>
        <strong className="runtime-stat-value">{value}</strong>
      </div>
    </div>
  );
}

function SqliteLoadCard({
  sessions,
  onLoad,
}: {
  sessions: ReturnType<typeof useMoriSqliteStore.getState>["sessions"];
  onLoad: (id: string) => Promise<boolean>;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (sessions.length === 0) return null;
  return (
    <section className="settings-card" aria-label="SQLite saved sessions">
      <header className="settings-card-head">
        <div>
          <h3>저장된 세션 다시 불러오기</h3>
          <p>Desktop SQLite에 저장된 세션을 활성 세션으로 다시 불러옵니다.</p>
        </div>
        <Badge tone="purple">{sessions.length}개 세션</Badge>
      </header>
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
    </section>
  );
}
