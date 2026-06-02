import {
  Bell,
  Bot,
  HardDrive,
  Lock,
  Palette,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { InfoHint } from "../../components/ui/InfoHint";
import {
  selectHasRealAnalysis,
  selectSessionView,
  useSessionStore,
} from "../../app/sessionStore";
import { useSqliteStore } from "../../app/sqliteStore";
import {
  selectActiveRepository,
  useRepositoryStore,
} from "../../app/repositoryStore";
import { useAppStore } from "../../app/store";
import type { SettingsTab } from "../../app/store";
import { isTauriRuntime, pickRepositoryDirectory } from "../../lib/desktop";
import type { RuntimeMode } from "../../lib/settings/settingsStatus";
import { getProductRuntimeLabel } from "../../lib/product-state/productState";
import { LocalAiCard } from "./LocalAiCard";
import { PrivacyDefaultsCard } from "./PrivacyDefaultsCard";
import { PrivacyGuaranteesCard } from "./PrivacyGuaranteesCard";
import { RequestDisclosureCard } from "./RequestDisclosureCard";
import { StorageCard } from "./StorageCard";
import { RepositoriesCard } from "./RepositoriesCard";
import { ThemeCard } from "./ThemeCard";
import { DemoModeCard } from "./DemoModeCard";
import { NotificationsCard } from "./NotificationsCard";
import { SettingsSection, StatusPill } from "./SettingsPrimitives";

export const SETTINGS_TAB_DEFS: Array<{ id: SettingsTab; label: string; icon: typeof Bot }> = [
  { id: "localAi", label: "AI 엔진", icon: Bot },
  { id: "privacy", label: "개인정보", icon: Lock },
  { id: "storage", label: "저장소", icon: HardDrive },
  { id: "repositories", label: "리포지토리", icon: ShieldCheck },
  { id: "appearance", label: "화면", icon: Palette },
  { id: "notifications", label: "알림", icon: Bell },
];

export function SettingsView() {
  const hydrate = useSessionStore((state) => state.hydrate);
  const initialized = useSessionStore((state) => state.initialized);
  const settings = useSessionStore((state) => state.analysisSettings);
  const updateAnalysisSettings = useSessionStore((state) => state.updateAnalysisSettings);
  const sessionView = useSessionStore(selectSessionView);
  const sessionDraft = useSessionStore((state) => state.draft);
  const imports = useSessionStore((state) => state.imports);
  const hasAnalysis = useSessionStore(selectHasRealAnalysis);
  const loadDesktopSession = useSessionStore((state) => state.loadDesktopSession);

  const sqliteAvailable = useSqliteStore((state) => state.available);
  const sqliteStatus = useSqliteStore((state) => state.status);
  const sqliteSessions = useSqliteStore((state) => state.sessions);
  const sqliteKind = useSqliteStore((state) => state.kind);
  const sqliteError = useSqliteStore((state) => state.error);
  const lastPersist = useSqliteStore((state) => state.lastPersist);
  const refreshSqlite = useSqliteStore((state) => state.refresh);
  const initializeSqlite = useSqliteStore((state) => state.initialize);
  const persistSqlite = useSqliteStore((state) => state.persist);

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

  const providerLabel =
    settings.provider === "ollama"
      ? `Ollama · ${settings.ollamaModel}`
      : settings.provider === "openAiCompatible"
        ? `OpenAI 호환 · ${settings.openAiModel}`
      : "Deterministic Quick Pass";

  async function handlePickRepository() {
    const result = await pickRepositoryDirectory({ title: "Mori: Select repository" });
    if (result.cancelled || !result.path) return null;
    return result.path;
  }

  return (
    <div className="settings-content-stack settings-page">
      <div className="settings-pane-head">
        <div className="settings-pane-heading">
          <h2>{SETTINGS_TAB_DEFS.find((entry) => entry.id === activeTab)?.label ?? "설정"}</h2>
          <InfoHint label="이 화면 설명">{sectionDescription(activeTab)}</InfoHint>
        </div>
        <StatusPill tone={mode === "tauri-desktop" ? "green" : "blue"}>
          {mode === "tauri-desktop" ? "데스크톱 런타임" : "브라우저 런타임"}
        </StatusPill>
      </div>

      <div className="settings-main">
        {activeTab === "storage" ? (
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
        ) : null}
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
            <RequestDisclosureCard />
            <PrivacyGuaranteesCard />
          </>
        ) : null}
        {activeTab === "storage" ? (
          <DemoModeCard
            onGoToConnections={() => setCurrentView("connections")}
          />
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
        {activeTab === "appearance" ? <ThemeCard /> : null}
        {activeTab === "notifications" ? <NotificationsCard /> : null}
        {activeTab === "storage" ? (
          <SqliteLoadCard
            sessions={sqliteSessions}
            onLoad={loadDesktopSession}
          />
        ) : null}
      </div>

    </div>
  );
}

function sectionDescription(tab: SettingsTab): string {
  switch (tab) {
    case "localAi":
      return "가져온 세션을 해석할 로컬 또는 명시적 제공자를 선택합니다.";
    case "privacy":
      return "Mori가 기본으로 지키는 로컬 우선 경계입니다.";
    case "storage":
      return "이 기기의 저장 위치, SQLite 상태, 내보내기 경로를 확인합니다.";
    case "repositories":
      return "Git diff 캡처와 프로젝트 분류에 사용할 경로만 직접 등록합니다.";
    case "appearance":
      return "이 기기에만 저장되는 화면 표시 설정입니다.";
    case "notifications":
      return "향후 알림 전달 계층이 사용할 로컬 범주 설정입니다.";
    case "profile":
      return "이 기기에서만 쓰는 Mori 표시 이름입니다.";
  }
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
  // localStorage, which is not a broken SQLite, so it never reads "error".
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
    <div className="settings-runtime-summary" role="region" aria-label="Mori 런타임 상태">
      <RuntimeStat
        label="런타임"
        value={mode === "tauri-desktop" ? "데스크톱 (Tauri)" : "브라우저 시범판"}
        tone="info"
      />
      <RuntimeStat label="저장소" value={storage.value} tone={storage.tone} />
      <RuntimeStat
        label="AI 제공자"
        value={`${providerLabel}${hasAnalysis ? " · 분석 완료" : ""}`}
        tone={hasAnalysis ? "ok" : "idle"}
      />
      <RuntimeStat
        label="이번 세션"
        value={`가져오기 ${importsCount}건 · 출처 ${sourceCount}개 · 리포지토리 ${repositoryCount}개`}
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
  sessions: ReturnType<typeof useSqliteStore.getState>["sessions"];
  onLoad: (id: string) => Promise<boolean>;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (sessions.length === 0) return null;
  return (
    <SettingsSection
      title="저장된 세션"
      description="Desktop SQLite에 저장된 세션을 활성 세션으로 다시 불러옵니다."
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
